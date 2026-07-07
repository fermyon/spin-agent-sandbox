// ts-sandbox — executes dynamic JS/TS code received as a JSON envelope.
//
// Request (POST, body = strict JSON envelope):
//   { code: string, sandboxId: string, input?: {method?, headers?, query?, body?}, allowedHosts?: string[] }
//
// The user `code` is TypeScript/JS using ES modules. It is transpiled at runtime
// with sucrase (types stripped, `import`/`export default` -> CommonJS) and run via
// the AsyncFunction constructor with an injected `require` (a fixed module registry),
// a per-sandbox scoped KV, an allow-listed `fetch`, and a capturing `console`.
//
// Two code shapes are supported:
//   - handler:  `export default { fetch(request) {...} }`  -> synthetic Request built
//               from `input`, awaited, its Response returned verbatim.
//   - main:     top-level script that prints                -> stdout/stderr captured,
//               returned as { stdout, stderr, error } JSON.

import { transform } from "sucrase";
import { log, initLogger } from "./logger";

// Pre-bundled libraries exposed to user code via require(). Imported statically so
// esbuild bundles them into the component; reached at runtime through the registry.
import * as cheerio from "cheerio";
import * as nodeHtmlParser from "node-html-parser";
import * as zod from "zod";
import * as jsyaml from "js-yaml";
import * as nanoid from "nanoid";
import * as ulidx from "ulidx";
import * as uuid from "uuid";
import * as lodash from "lodash";
import * as dateFns from "date-fns";
import dayjs from "dayjs";
import * as realKv from "@spinframework/spin-kv";

const MAX_OUTPUT = 256 * 1024; // cap captured stdout/stderr (mirror py-sandbox _MAX_OUTPUT)
const MAX_CODE = 5 * 1024 * 1024; // reject user code larger than this

// ---------------------------------------------------------------------------
// Scoped KV: one `default` store, keys namespaced as `${sandboxId}-${key}`.
// ---------------------------------------------------------------------------
function makeScopedKv(sandboxId: string) {
  // Length-prefixed so no sandbox id can be a key-prefix of another's: a bare
  // `${id}-` separator collides (id "a" + key "b-k" === id "a-b" + key "k"), which
  // would let one sandbox read/write/enumerate another's keys.
  const prefix = `${sandboxId.length}:${sandboxId}:`;
  const wrap = (store: any) => ({
    get: (k: string) => store.get(prefix + k),
    set: (k: string, v: any) => store.set(prefix + k, v),
    delete: (k: string) => store.delete(prefix + k),
    exists: (k: string) => store.exists(prefix + k),
    getKeys: () =>
      store
        .getKeys()
        .filter((x: string) => x.startsWith(prefix))
        .map((x: string) => x.slice(prefix.length)),
    // Real getJson throws on a missing key (JSON.parse("")); return null instead.
    getJson: (k: string) => (store.exists(prefix + k) ? store.getJson(prefix + k) : null),
    setJson: (k: string, v: any) => store.setJson(prefix + k, v),
  });
  return {
    openDefault: () => wrap(realKv.openDefault()),
    open: (label: string) => wrap(realKv.open(label)),
  };
}

// ---------------------------------------------------------------------------
// require() registry handed to user code.
// ---------------------------------------------------------------------------
function makeRequire(sandboxId: string): (name: string) => any {
  const registry: Record<string, any> = {
    cheerio,
    "node-html-parser": nodeHtmlParser,
    zod,
    "js-yaml": jsyaml,
    nanoid,
    ulidx,
    uuid,
    lodash,
    "date-fns": dateFns,
    dayjs,
    "@spinframework/spin-kv": makeScopedKv(sandboxId),
  };
  return (name: string) => {
    if (Object.prototype.hasOwnProperty.call(registry, name)) return registry[name];
    throw new Error(
      `module not found: '${name}'. The sandbox only bundles a fixed set of modules: ${Object.keys(
        registry
      ).join(", ")}`
    );
  };
}

// ---------------------------------------------------------------------------
// Outbound fetch: per-sandbox allow-list on top of the broad Spin manifest bound.
// ---------------------------------------------------------------------------
function isInternalHost(hostname: string): boolean {
  // Loopback / link-local / private / internal targets are never reachable, even if
  // allow-listed — primary SSRF backstop (cloud metadata 169.254.169.254, *.spin.internal).
  const h = (hostname || "").toLowerCase().replace(/\.$/, "");
  if (
    h === "" || h === "localhost" ||
    h.endsWith(".localhost") || h.endsWith(".internal") || h.endsWith(".local")
  ) {
    return true;
  }
  const v6 = h.replace(/^\[/, "").replace(/\]$/, "");
  if (v6 === "::1" || v6 === "::" || /^f[cd][0-9a-f]*:/.test(v6) || v6.startsWith("fe80:")) return true;
  const m = h.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (m) {
    const a = Number(m[1]);
    const b = Number(m[2]);
    if (a === 0 || a === 127 || a === 10) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
  }
  return false;
}

function hostAllowed(url: URL, allowedHosts: string[]): boolean {
  if (!allowedHosts || allowedHosts.length === 0) return false; // default deny
  if (isInternalHost(url.hostname)) return false; // deny internal targets unconditionally
  const host = url.host; // host[:port]
  const hostname = url.hostname;
  return allowedHosts.some((raw) => {
    if (raw === "*") return false; // a bare "*" from the per-request envelope must not allow-all
    const pat = raw.replace(/^[a-z]+:\/\//i, "").replace(/\/.*$/, "");
    if (pat.startsWith("*.")) {
      const base = pat.slice(2);
      return hostname === base || hostname.endsWith("." + base);
    }
    return hostname === pat || host === pat;
  });
}

function makeFetch(allowedHosts: string[]) {
  const nativeFetch = globalThis.fetch.bind(globalThis);
  const MAX_REDIRECTS = 5;
  return async (input: any, init?: any) => {
    const raw = typeof input === "string" ? input : input && input.url ? input.url : String(input);
    let url: URL;
    try {
      url = new URL(raw);
    } catch {
      throw new Error(`invalid fetch URL: ${raw}`);
    }
    if (!hostAllowed(url, allowedHosts)) {
      throw new Error(
        `outbound host not allowed by sandbox: ${url.host} (allowedHosts: ${JSON.stringify(allowedHosts)})`
      );
    }
    // Follow redirects manually so EVERY hop is re-checked against the allow-list — an
    // allow-listed host must not be able to 302 to an internal/metadata or otherwise
    // disallowed target. NOTE: this relies on `redirect: "manual"` being honored by the
    // Spin JS runtime; if it is not, fetch auto-follows and only the initial URL is
    // validated (the internal-host block still applies). Verify with a build+test.
    let curInput: any = input;
    let curInit: any = { ...(init || {}), redirect: "manual" };
    for (let hop = 0; ; hop++) {
      const resp = await nativeFetch(curInput, curInit);
      const location = typeof resp.headers?.get === "function" ? resp.headers.get("location") : null;
      if (resp.status >= 300 && resp.status < 400 && location) {
        if (hop >= MAX_REDIRECTS) throw new Error("too many redirects");
        let next: URL;
        try {
          next = new URL(location, url);
        } catch {
          throw new Error(`invalid redirect location: ${location}`);
        }
        if (!hostAllowed(next, allowedHosts)) {
          throw new Error(`redirect to disallowed host blocked: ${next.host}`);
        }
        url = next;
        curInput = next.toString();
        curInit = { ...curInit, redirect: "manual" };
        continue;
      }
      return resp;
    }
  };
}

// ---------------------------------------------------------------------------
// Capturing console for the "main" code shape.
// ---------------------------------------------------------------------------
function fmt(args: any[]): string {
  return args
    .map((a) => {
      if (typeof a === "string") return a;
      try {
        return JSON.stringify(a);
      } catch {
        return String(a);
      }
    })
    .join(" ");
}

function makeConsole(out: string[], err: string[]) {
  // Cap each stream so unbounded logging (e.g. `for(;;) console.log(...)`) can't grow
  // the buffer until the instance OOMs. Mirrors py-sandbox's _MAX_OUTPUT.
  const cap = (arr: string[]) => {
    let len = 0;
    let cut = false;
    return (s: string) => {
      if (cut) return;
      const remaining = MAX_OUTPUT - len;
      if (s.length >= remaining) {
        if (remaining > 0) arr.push(s.slice(0, remaining));
        arr.push("...[truncated]");
        cut = true;
        return;
      }
      len += s.length + 1; // +1 approximates the join("\n") separator
      arr.push(s);
    };
  };
  const pushOut = cap(out);
  const pushErr = cap(err);
  return {
    log: (...a: any[]) => pushOut(fmt(a)),
    info: (...a: any[]) => pushOut(fmt(a)),
    debug: (...a: any[]) => pushOut(fmt(a)),
    warn: (...a: any[]) => pushErr(fmt(a)),
    error: (...a: any[]) => pushErr(fmt(a)),
  };
}

// ---------------------------------------------------------------------------
// Synthetic Request built from envelope.input (handler shape).
// ---------------------------------------------------------------------------
function buildRequest(input: any): Request {
  input = input || {};
  const method = String(input.method || "GET").toUpperCase();
  const url = new URL("http://sandbox.localhost/");
  for (const [k, v] of Object.entries(input.query || {})) url.searchParams.set(k, String(v));
  const init: any = { method, headers: new Headers(input.headers || {}) };
  if (input.body !== undefined && method !== "GET" && method !== "HEAD") {
    init.body = typeof input.body === "string" ? input.body : JSON.stringify(input.body);
  }
  return new Request(url.toString(), init);
}

function errorResponse(status: number, kind: string, message: string): Response {
  return Response.json({ error: kind, message }, { status });
}

const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor as any;

async function handle(request: Request): Promise<Response> {
  initLogger();

  if (request.method !== "POST") {
    return errorResponse(405, "method_not_allowed", "send the code envelope as a POST body");
  }

  let envelope: any;
  try {
    envelope = await request.json();
  } catch {
    return errorResponse(400, "invalid_json", "request body must be a JSON envelope");
  }
  if (!envelope || typeof envelope.code !== "string" || typeof envelope.sandboxId !== "string") {
    return errorResponse(
      400,
      "invalid_envelope",
      "expected { code: string, sandboxId: string, input?, allowedHosts? }"
    );
  }
  if (envelope.code.length > MAX_CODE) {
    return errorResponse(413, "code_too_large", `code exceeds ${MAX_CODE} bytes`);
  }

  const sandboxId: string = envelope.sandboxId;
  const allowedHosts: string[] = Array.isArray(envelope.allowedHosts) ? envelope.allowedHosts : [];

  // Transpile TS -> CJS at runtime.
  let transpiled: string;
  try {
    transpiled = transform(envelope.code, {
      transforms: ["typescript", "imports"],
      preserveDynamicImport: false,
    }).code;
  } catch (e: any) {
    return errorResponse(400, "transpile_error", String(e && e.message ? e.message : e));
  }

  const out: string[] = [];
  const err: string[] = [];
  const moduleObj: any = { exports: {} };
  const requireShim = makeRequire(sandboxId);
  const fetchShim = makeFetch(allowedHosts);
  const consoleShim = makeConsole(out, err);

  // Gate globalThis.fetch too, so user code can't bypass the shim. Restore after.
  const savedFetch = globalThis.fetch;
  (globalThis as any).fetch = fetchShim;

  try {
    let fn: any;
    try {
      fn = new AsyncFunction("require", "module", "exports", "console", "fetch", transpiled);
    } catch (e: any) {
      return errorResponse(400, "compile_error", String(e && e.message ? e.message : e));
    }

    try {
      await fn(requireShim, moduleObj, moduleObj.exports, consoleShim, fetchShim);
    } catch (e: any) {
      return Response.json({
        stdout: out.join("\n"),
        stderr: err.join("\n"),
        error: String(e && e.stack ? e.stack : e),
      });
    }

    const def = moduleObj.exports && moduleObj.exports.default;
    const handler =
      def && typeof def.fetch === "function" ? def.fetch.bind(def) : typeof def === "function" ? def : null;

    if (handler) {
      const synthReq = buildRequest(envelope.input);
      let userResp: any;
      try {
        userResp = await handler(synthReq);
      } catch (e: any) {
        return errorResponse(500, "handler_error", String(e && e.stack ? e.stack : e));
      }
      if (userResp instanceof Response) return userResp;
      // Defensive: coerce non-Response return values.
      if (typeof userResp === "string") return new Response(userResp);
      return Response.json(userResp ?? null);
    }

    // main shape
    return Response.json({ stdout: out.join("\n"), stderr: err.join("\n"), error: null });
  } catch (e: any) {
    log.error(`sandbox internal error: ${e}`);
    return errorResponse(500, "internal", String(e && e.stack ? e.stack : e));
  } finally {
    (globalThis as any).fetch = savedFetch;
  }
}

//@ts-ignore - addEventListener/FetchEvent are provided by the Spin/StarlingMonkey runtime.
addEventListener("fetch", (event: any) => {
  event.respondWith(handle(event.request));
});
