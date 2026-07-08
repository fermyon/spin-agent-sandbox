// @spinframework/sandbox/interpreter — the Wasm code interpreter backend.
//
// A thin client over a wasm-sandbox component's `POST /ts/run` (JS/TS) and `/py/run`
// (Python) routes. Inherently single-shot and buffered, which is exactly the portable
// `core.run()` contract.
//
// In the intended deployment the interpreter is TWO PRIVATE components — ts-sandbox and
// py-sandbox — reached via service chaining. `.spin.internal` resolves to a COMPONENT id,
// so each language has its own host: use one Interpreter per language, each `baseUrl`
// pointed at its component (see examples/ai-code-executor/api/src/index.ts):
//
//   const js = new Interpreter({ baseUrl: "http://ts-sandbox.spin.internal" });
//   const py = new Interpreter({ baseUrl: "http://py-sandbox.spin.internal" });
//   await js.run(code, { lang: "javascript" });   // -> ts-sandbox
//   await py.run(code, { lang: "python" });        // -> py-sandbox
//
// (A single combined app that routes both /ts and /py by path also works — then one
// `baseUrl` at the app suffices — but the private two-component form is the default.)

import type { Caps, CodeRunner, Result, RunOpts } from "../core/index.ts";
import { langToRoute, withDefaults } from "../core/index.ts";

// Re-exported so a consumer can name run languages (and import `Interpreter`)
// from this one module, without also reaching into `@spinframework/sandbox/core`.
export type { Language } from "../core/index.ts";

/** A fetch implementation; defaults to the Spin guest's global `fetch`. */
export type FetchLike = typeof fetch;

export interface InterpreterOptions {
  /** Base URL of the interpreter component, no trailing slash, e.g.
   * "http://ts-sandbox.spin.internal" (use one Interpreter per language — see the module doc). */
  baseUrl: string;
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
// match a backend where an in-code exception is data, not a thrown error.
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
  private readonly fetchImpl: FetchLike;
  private readonly newId: () => string;

  constructor(opts: InterpreterOptions) {
    this.baseUrl = opts.baseUrl.replace(/\/+$/, "");
    this.fetchImpl = opts.fetch ?? (globalThis.fetch as FetchLike);
    this.newId = opts.newId ?? defaultNewId;
  }

  backend(): "interpreter" {
    return "interpreter";
  }

  capabilities(): Caps {
    return CAPS;
  }

  async run(code: string, opts?: RunOpts): Promise<Result> {
    const o = withDefaults(opts);
    const route = langToRoute(o.lang);
    const envelope = {
      code,
      sandboxId: o.identity ?? this.newId(),
      input: o.input,
      allowedHosts: o.allowedHosts ?? [],
    };

    const res = await this.fetchImpl(`${this.baseUrl}/${route}/run`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(envelope),
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
   * INTERPRETER-ONLY power: the per-namespace scoped key-value store
   * (`{namespace}-{key}`), reached by running a tiny snippet against the shared
   * `default` store. JSON-oriented.
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
    return this.eval<T | null>(
      `const v = s.exists(K) ? s.getJson(K) : null; out({ v });`,
      key,
    ).then((r) => r.v);
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
