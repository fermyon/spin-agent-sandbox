// Portable types shared by every backend. This module has NO transport and no
// runtime dependencies — it is the extension point of the library: a backend
// (today the Wasm interpreter) is anything that implements `CodeRunner` and
// honestly describes itself through `Caps`.

/** A language the portable core can run. */
export type Language = "python" | "javascript";

/**
 * Which backend a runner targets. Open on purpose: a future backend introduces
 * its own name here without a breaking change — a widenable union, so known
 * values still autocomplete while any string remains assignable.
 */
export type Backend = "interpreter" | (string & {});

/** A rich, non-text output emitted by a run (e.g. an `image/png`). */
export interface MIMEResult {
  mimeType: string;
  data: Uint8Array;
}

/**
 * A failure raised by the code inside the sandbox (or a run timeout). This is
 * DATA about the user's code, never a thrown error — `run()` only throws for
 * transport/auth/validation failures.
 */
export interface CodeError {
  /** Error class, e.g. "NameError", "timeout", or "error". */
  name: string;
  /** Error message / value. */
  value: string;
  /** Interpreter traceback, when available. */
  traceback: string[];
}

/** The fully-buffered output of one `run()` call. */
export interface Result {
  stdout: string;
  stderr: string;
  /** Rich outputs (images, etc.). Empty on the interpreter today. */
  results: MIMEResult[];
  /** Set when the in-sandbox code raised or timed out; undefined on success. */
  error?: CodeError;
}

/**
 * An HTTP-style input the code can read (the Wasm handler shape). Mirrors the
 * Wasm interpreter's `input` envelope field.
 */
export interface HttpInput {
  method?: string;
  /** Request path the code sees, e.g. "/api/data". Defaults to "/". */
  path?: string;
  headers?: Record<string, string>;
  query?: Record<string, string>;
  /** A string is passed through; an object is JSON-encoded. */
  body?: unknown;
}

/**
 * A package.json (or its raw JSON string) whose `dependencies` should be bundled
 * into JS/TS code before it runs. See `RunOpts.packageJson`.
 */
export type PackageJson = string | { dependencies?: Record<string, string>; [key: string]: unknown };

/** Options accepted by `run()` — the portable surface every backend honors. */
export interface RunOpts {
  /** Defaults to "python". */
  lang?: Language;
  /**
   * Per-run outbound allow-list. Default-deny: an empty/omitted list blocks all
   * egress.
   */
  allowedHosts?: string[];
  /**
   * A stable identity for the run. On the interpreter it is the scoped-KV
   * namespace (`sandboxId`); a future backend may use it as a create/reuse key.
   */
  identity?: string;
  /** HTTP-style input made available to the code. */
  input?: HttpInput;
  /**
   * Wall-clock bound. Whether it actually kills the process is reported by
   * `Caps.realTimeout` (best-effort, host-request-bounded on the interpreter).
   */
  timeoutMs?: number;
  /**
   * JS/TS ONLY. npm dependencies to bundle into `code` before it runs, given as a
   * package.json object or its raw JSON string (its `dependencies` are used). The
   * runner must be configured with a bundler (the Interpreter's `bundlerUrl`); it
   * sends the source + this package.json to that bundler component and runs the
   * returned self-contained bundle. Rejected for python, whose libraries are frozen
   * into the component. Reflected by `Caps.arbitraryImage`.
   */
  packageJson?: PackageJson;
}

/**
 * Static, per-backend truth about what a runner can do. This is the extension
 * contract: a tool built at runtime (e.g. from MCP) branches on these BEFORE
 * acting; native TypeScript tools rely on compile-time method absence instead.
 *
 * The interpreter sets most of these `false` today; a future backend flips the
 * relevant ones on — no change to this shape is required to add one.
 */
export interface Caps {
  languages: Language[];
  /** Real filesystem (write/read/mkdir/stat). Interpreter: false. */
  filesystem: boolean;
  /** Stateful REPL sessions (vars persist across calls). Interpreter: false. */
  sessions: boolean;
  /** Subprocess / argv exec. Interpreter: false. */
  exec: boolean;
  /** Scoped key-value store. Interpreter: true. */
  kv: boolean;
  /** Real lifecycle (create/destroy/idle-reap/status). Interpreter: false. */
  lifecycle: boolean;
  /** Arbitrary dependency set beyond the frozen libs. Interpreter: false. */
  arbitraryImage: boolean;
  /** `timeoutMs` actually kills the process. Interpreter: false (best-effort). */
  realTimeout: boolean;
  /** Live incremental output. Interpreter: false — `run()` is buffered. */
  streaming: boolean;
}

/**
 * The portable surface. A tool written against `CodeRunner` runs UNCHANGED on
 * any backend; the host injects the concrete client at the edge. Implement this
 * interface (and describe yourself through `capabilities()`) to add a backend.
 */
export interface CodeRunner {
  backend(): Backend;
  capabilities(): Caps;
  run(code: string, opts?: RunOpts): Promise<Result>;
}

/** Metadata for a stored code entry (the source itself omitted). */
export interface CodeMeta {
  id: string;
  language: Language;
  title?: string;
  /** JS/TS only. npm dependencies the code declared (name -> semver), for display/metadata. */
  dependencies?: Record<string, string>;
  /** Unix epoch millis when saved. */
  createdAt: number;
}

/** A stored code entry, including its source. */
export interface StoredCode extends CodeMeta {
  code: string;
  /**
   * JS/TS only. The self-contained bundle produced from `code` + `dependencies` at save
   * time. When present it is what runs (serveStoredCode prefers it over `code`), so an app
   * with dependencies is bundled once at publish, not on every request. `code` stays the
   * editable source.
   */
  bundled?: string;
}

/**
 * A pluggable store for AI-generated code: persist it, list it, load it by id (to run
 * later). The portable seam — like `CodeRunner` for execution. Implement it over any
 * backing store (Spin KV today); a consumer depends only on this interface.
 */
export interface CodeStore {
  /** Persist code; returns its id + metadata. Pass `id` to update an existing entry in place.
   *  `code` is the editable source; optional `bundled` is a self-contained blob (from the
   *  bundler) that will run in its place, and `dependencies` records what it declared. */
  save(input: {
    id?: string;
    code: string;
    language: Language;
    title?: string;
    dependencies?: Record<string, string>;
    bundled?: string;
  }): Promise<CodeMeta>;
  /** Load one entry with its source, or null if absent. */
  get(id: string): Promise<StoredCode | null>;
  /** List stored entries (metadata only). */
  list(): Promise<CodeMeta[]>;
  /** Remove an entry. */
  delete(id: string): Promise<void>;
}
