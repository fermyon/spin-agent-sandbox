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

// ---------------------------------------------------------------------------
// Scoped KV: one `default` store, keys namespaced as `${sandboxId}-${key}`.
// ---------------------------------------------------------------------------
function makeScopedKv(sandboxId: string) {
  const prefix = `${sandboxId}-`;
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
function hostAllowed(url: URL, allowedHosts: string[]): boolean {
  if (!allowedHosts || allowedHosts.length === 0) return false; // default deny
  const host = url.host; // host[:port]
  const hostname = url.hostname;
  return allowedHosts.some((raw) => {
    if (raw === "*") return true;
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
    return nativeFetch(input, init);
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
  return {
    log: (...a: any[]) => out.push(fmt(a)),
    info: (...a: any[]) => out.push(fmt(a)),
    debug: (...a: any[]) => out.push(fmt(a)),
    warn: (...a: any[]) => err.push(fmt(a)),
    error: (...a: any[]) => err.push(fmt(a)),
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
