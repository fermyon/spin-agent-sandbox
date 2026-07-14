// @spinframework/sandbox/interpreter, the Wasm code interpreter backend.
//
// A thin client over a wasm-sandbox component's `POST /ts/run` (JS/TS) and `/py/run`
// (Python) routes. Inherently single-shot and buffered, which is exactly the portable
// `core.run()` contract.
//
// In the intended deployment the interpreter is TWO PRIVATE components, ts-sandbox and
// py-sandbox, reached via service chaining. `.spin.internal` resolves to a COMPONENT id,
// so each language has its own host: use one Interpreter per language, each `baseUrl`
// pointed at its component (see examples/ai-code-executor/api/src/index.ts):
//
//   const js = new Interpreter({ baseUrl: "http://ts-sandbox.spin.internal" });
//   const py = new Interpreter({ baseUrl: "http://py-sandbox.spin.internal" });
//   await js.run(code, { lang: "javascript" });   // -> ts-sandbox
//   await py.run(code, { lang: "python" });        // -> py-sandbox
//
// (A single combined app that routes both /ts and /py by path also works; then one
// `baseUrl` at the app suffices, but the private two-component form is the default.)
//
// JavaScript can pull npm dependencies beyond the frozen libs by giving the JS Interpreter
// a `bundlerUrl` (the bundler component) and passing `packageJson` to run():
//
//   const js = new Interpreter({ baseUrl: "http://ts-sandbox.spin.internal",
//                                bundlerUrl: "http://bundler.spin.internal" });
//   await js.run(code, { lang: "javascript", packageJson: { dependencies: { mustache: "^4.2.0" } } });

import type { Caps, CodeRunner, PackageJson, Result, RunOpts } from "../core/index.ts";
import { langToRoute, withDefaults } from "../core/index.ts";

// Re-exported so a consumer can name run languages (and import `Interpreter`)
// from this one module, without also reaching into `@spinframework/sandbox/core`.
export type { Language } from "../core/index.ts";

/** A fetch implementation; defaults to the Spin guest's global `fetch`. */
export type FetchLike = typeof fetch;

export interface InterpreterOptions {
  /** Base URL of the interpreter component, no trailing slash, e.g.
   * "http://ts-sandbox.spin.internal" (use one Interpreter per language, see the module doc). */
  baseUrl: string;
  /** Optional. Base URL of the bundler component, e.g. "http://bundler.spin.internal".
   * Enables `RunOpts.packageJson` for JavaScript: the source + package.json are POSTed to
   * `${bundlerUrl}/bundle` and the returned self-contained bundle is what runs. Without it,
   * passing `packageJson` throws. Python is unaffected (its libraries are frozen in). */
  bundlerUrl?: string;
  /** Override the global fetch (mainly for tests). */
  fetch?: FetchLike;
  /** Override sandbox-id generation for runs without an explicit identity. */
  newId?: () => string;
}

const CAPS: Caps = {
  languages: ["python", "javascript"],
  filesystem: false,
  sessions: false,
  exec: false,
  kv: true,
  lifecycle: false,
  arbitraryImage: false,
  realTimeout: false,
  streaming: false,
};

// User-code failure kinds the interpreter reports as DATA (Result.error), to
// match the portable contract, where an in-code exception is data, not a thrown error.
const CODE_ERROR_KINDS = new Set(["transpile_error", "compile_error", "handler_error"]);

interface MainShape {
  stdout?: string;
  stderr?: string;
  error?: string | null;
}

interface ErrorShape {
  error?: string;
  /** ts-sandbox keys the detail as `message`; py-sandbox keys it as `trace`. */
  message?: string;
  trace?: string;
}

export class Interpreter implements CodeRunner {
  private readonly baseUrl: string;
  private readonly bundlerUrl?: string;
  private readonly fetchImpl: FetchLike;
  private readonly newId: () => string;

  constructor(opts: InterpreterOptions) {
    this.baseUrl = opts.baseUrl.replace(/\/+$/, "");
    this.bundlerUrl = opts.bundlerUrl ? opts.bundlerUrl.replace(/\/+$/, "") : undefined;
    this.fetchImpl = opts.fetch ?? (globalThis.fetch as FetchLike);
    this.newId = opts.newId ?? defaultNewId;
  }

  backend(): "interpreter" {
    return "interpreter";
  }

  capabilities(): Caps {
    // A configured bundler lets JavaScript pull dependencies beyond the frozen libs.
    return this.bundlerUrl ? { ...CAPS, arbitraryImage: true } : CAPS;
  }

  /**
   * Bundle npm dependencies into `code` WITHOUT running it, returning the self-contained
   * bundle. JavaScript only; requires a `bundlerUrl`. Use it to pre-bundle code you will
   * store and run later (see @spinframework/sandbox/store), so it is bundled once at publish
   * rather than on every request.
   */
  async bundle(code: string, packageJson: PackageJson): Promise<string> {
    if (!this.bundlerUrl) {
      throw new Error("bundle() requires the Interpreter to have a bundlerUrl");
    }
    return this.postBundle(code, packageJson);
  }

  // POST source + package.json to the bundler component; return the self-contained bundle.
  private async postBundle(code: string, packageJson: PackageJson): Promise<string> {
    const res = await this.fetchImpl(`${this.bundlerUrl}/bundle`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ source: code, packageJson }),
    });
    const text = await res.text();
    const json = safeJson(text) as { blob?: string; error?: string; message?: string } | null;
    if (!res.ok || !json || typeof json.blob !== "string") {
      const detail = json?.message ?? json?.error ?? (text || res.statusText || "no body");
      throw new Error(`bundler failed (${res.status}): ${detail}`);
    }
    return json.blob;
  }

  /**
   * If the run requests dependencies (`packageJson`), bundle them into `code` via the
   * bundler component and return the self-contained bundle; otherwise return `code`
   * unchanged. JavaScript only; python and a missing bundler are hard errors.
   */
  private async maybeBundle(code: string, o: RunOpts): Promise<string> {
    if (o.packageJson === undefined) return code;
    if (o.lang !== "javascript") {
      throw new Error("packageJson (dependencies) is only supported for javascript");
    }
    if (!this.bundlerUrl) {
      throw new Error(
        "packageJson was provided but this Interpreter has no bundlerUrl; construct it with { bundlerUrl }",
      );
    }
    return this.postBundle(code, o.packageJson);
  }

  // Shared envelope + URL construction for run() / runRaw().
  private buildEnvelope(code: string, o: RunOpts): { url: string; body: string; route: "ts" | "py" } {
    const route = langToRoute(o.lang);
    const envelope = {
      code,
      sandboxId: o.identity ?? this.newId(),
      input: o.input,
      allowedHosts: o.allowedHosts ?? [],
    };
    return { url: `${this.baseUrl}/${route}/run`, body: JSON.stringify(envelope), route };
  }

  /**
   * Like run(), but returns the sandbox's raw HTTP Response verbatim. For the HTTP-handler
   * shape, where the handler's Response (status/headers/body) is the payload you want, not
   * the parsed {stdout,stderr}. Throws only on transport failure.
   */
  async runRaw(code: string, opts?: RunOpts): Promise<Response> {
    const o = withDefaults(opts);
    const bundled = await this.maybeBundle(code, o);
    const { url, body } = this.buildEnvelope(bundled, o);
    return this.fetchImpl(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
    });
  }

  // Runs `code` and returns the parsed main-shape `{ stdout, stderr, error }`. For
  // handler-shape code (`export default { fetch }` / `def handle_request`) the sandbox
  // returns the handler's Response instead, which does not match this shape and yields an
  // empty Result; use runRaw() for that case.
  async run(code: string, opts?: RunOpts): Promise<Result> {
    const o = withDefaults(opts);
    const bundled = await this.maybeBundle(code, o);
    const { url, body, route } = this.buildEnvelope(bundled, o);

    const res = await this.fetchImpl(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
    });

    const text = await res.text();
    const json = safeJson(text);

    if (!res.ok) {
      const e = (json ?? {}) as ErrorShape;
      const kind = e.error ?? "internal";
      // ts-sandbox reports the detail as `message`, py-sandbox as `trace` (a traceback).
      const detail = e.message ?? e.trace;
      if (CODE_ERROR_KINDS.has(kind)) {
        // A syntax/compile/handler error is data about the user's code.
        return {
          stdout: "",
          stderr: "",
          results: [],
          error: { name: kind, value: detail ?? kind, traceback: e.trace ? e.trace.split("\n") : [] },
        };
      }
      throw new Error(
        `interpreter ${route}/run failed (${res.status}): ${detail ?? (text || res.statusText || "no body")}`,
      );
    }

    const main = (json ?? {}) as MainShape;
    const result: Result = {
      stdout: main.stdout ?? "",
      stderr: main.stderr ?? "",
      results: [],
    };
    if (main.error != null && main.error !== "") {
      result.error = { name: "error", value: main.error, traceback: main.error.split("\n") };
    }
    return result;
  }

  /**
   * INTERPRETER-ONLY power: the per-namespace scoped key-value store, reached by running a
   * tiny snippet against the shared `default` store (the sandbox namespaces keys as
   * `{len}:{sandboxId}:{key}`, with the namespace as the sandbox id). JSON-oriented. Reads
   * round-trip through the sandbox's captured stdout, which is capped at 256 KiB, so a stored
   * value whose JSON exceeds that cannot be read back (getJson throws rather than truncating).
   */
  kv(namespace: string): InterpreterKV {
    return new InterpreterKV(this, namespace);
  }
}

/** A JSON-oriented view of the interpreter's scoped KV for one namespace. */
export class InterpreterKV {
  private readonly itp: Interpreter;
  private readonly namespace: string;

  constructor(itp: Interpreter, namespace: string) {
    this.itp = itp;
    this.namespace = namespace;
  }

  async getJson<T = unknown>(key: string): Promise<T | null> {
    // The scoped store already returns null for a missing key, so no exists() guard is needed.
    return this.eval<T | null>(`out({ v: s.getJson(K) });`, key).then((r) => r.v);
  }

  async setJson(key: string, value: unknown): Promise<void> {
    await this.eval(`s.setJson(K, ${JSON.stringify(value)}); out({ ok: true });`, key);
  }

  async delete(key: string): Promise<void> {
    await this.eval(`s.delete(K); out({ ok: true });`, key);
  }

  async exists(key: string): Promise<boolean> {
    return this.eval<boolean>(`out({ v: s.exists(K) });`, key).then((r) => r.v);
  }

  async keys(): Promise<string[]> {
    return this.eval<string[]>(`out({ v: s.getKeys() });`, "").then((r) => r.v);
  }

  // Runs a KV snippet against this namespace and parses the JSON it prints.
  private async eval<T>(bodyExpr: string, key: string): Promise<{ v: T }> {
    const code =
      `import * as kv from "@spinframework/spin-kv";\n` +
      `const s = kv.openDefault();\n` +
      `const K = ${JSON.stringify(key)};\n` +
      `const out = (o) => console.log(JSON.stringify(o));\n` +
      bodyExpr;
    const res = await this.itp.run(code, { lang: "javascript", identity: this.namespace });
    if (res.error) {
      throw new Error(`interpreter kv op failed: ${res.error.name}: ${res.error.value}`);
    }
    const parsed = safeJson(res.stdout.trim());
    if (parsed == null) {
      // The read snippet prints its result to stdout, which the sandbox caps at 256 KiB and
      // marks with this suffix.
      if (res.stdout.includes("...[truncated]")) {
        throw new Error("interpreter kv value too large to read back (exceeds the sandbox's 256 KiB stdout cap)");
      }
      throw new Error(`interpreter kv op returned no JSON (stdout: ${JSON.stringify(res.stdout)})`);
    }
    return parsed as { v: T };
  }
}

function safeJson(text: string): unknown {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

let idCounter = 0;

function defaultNewId(): string {
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (c?.randomUUID) return c.randomUUID();
  // Fallback for environments without WebCrypto: time + counter is unique enough
  // for a sandbox-id that only scopes an ephemeral KV namespace.
  idCounter += 1;
  return `run-${Date.now().toString(36)}-${idCounter}`;
}
