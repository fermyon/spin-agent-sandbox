// @spinframework/sandbox/store — persist AI-generated code and run it later by id.
//
// KvCodeStore is the one CodeStore implementation today: it keeps code in the sandbox's
// scoped KV (via InterpreterKV). serveStoredCode composes a store with interpreters to run
// a stored HTTP-handler app live and return its raw Response.

import type { CodeMeta, CodeStore, HttpInput, Language, StoredCode } from "../core/index.ts";
import type { Interpreter, InterpreterKV } from "../interpreter/index.ts";

export interface KvCodeStoreOptions {
  /** Interpreter used as the KV transport (KV snippets run as JS on /ts/run). */
  interpreter: Interpreter;
  /** KV namespace (sandbox scope) holding the code. Default "code". */
  namespace?: string;
  /** Override id generation (default: a UUID v4 via crypto.randomUUID). */
  newId?: () => string;
  /** Override the timestamp source (default Date.now). */
  now?: () => number;
}

const INDEX_KEY = "index";
const recordKey = (id: string) => `code:${id}`;

/** A {@link CodeStore} backed by the sandbox's scoped Spin KV. */
export class KvCodeStore implements CodeStore {
  private readonly kv: InterpreterKV;
  private readonly newId: () => string;
  private readonly now: () => number;

  constructor(opts: KvCodeStoreOptions) {
    this.kv = opts.interpreter.kv(opts.namespace ?? "code");
    this.newId = opts.newId ?? (() => crypto.randomUUID()); // StarlingMonkey/Spin provides WebCrypto
    this.now = opts.now ?? (() => Date.now());
  }

  async save(input: {
    id?: string;
    code: string;
    language: Language;
    title?: string;
    dependencies?: Record<string, string>;
    allowedHosts?: string[];
    bundled?: string;
  }): Promise<CodeMeta> {
    const id = input.id ?? this.newId();
    const existing = input.id ? await this.get(id) : null;
    const meta: CodeMeta = {
      id,
      language: input.language,
      title: input.title,
      dependencies: input.dependencies,
      allowedHosts: input.allowedHosts,
      createdAt: existing?.createdAt ?? this.now(), // preserve the original time on update
    };
    // `code` is the editable source; `bundled` (when present) is what serveStoredCode runs.
    await this.kv.setJson(recordKey(id), { ...meta, code: input.code, bundled: input.bundled } satisfies StoredCode);
    // Maintain a metadata index for cheap list() — replace in place on update, append on
    // create. Read-modify-write: fine for a single control-plane; concurrent saves could drop
    // an index entry — the record itself is never lost, it is keyed by unique id.
    const index = (await this.kv.getJson<CodeMeta[]>(INDEX_KEY)) ?? [];
    const at = index.findIndex((m) => m.id === id);
    if (at >= 0) index[at] = meta;
    else index.push(meta);
    await this.kv.setJson(INDEX_KEY, index);
    return meta;
  }

  get(id: string): Promise<StoredCode | null> {
    return this.kv.getJson<StoredCode>(recordKey(id));
  }

  async list(): Promise<CodeMeta[]> {
    return (await this.kv.getJson<CodeMeta[]>(INDEX_KEY)) ?? [];
  }

  async delete(id: string): Promise<void> {
    await this.kv.delete(recordKey(id));
    const index = (await this.kv.getJson<CodeMeta[]>(INDEX_KEY)) ?? [];
    await this.kv.setJson(INDEX_KEY, index.filter((m) => m.id !== id));
  }
}

/**
 * Load stored code by id and run it as an HTTP handler, returning the sandbox's raw Response
 * (status/headers/body) verbatim. Picks the interpreter by the stored language, scopes the
 * app's own KV to its id, and applies the app's stored outbound allow-list (default-deny when
 * the app declared none). Runs the pre-bundled blob when present (an app with dependencies is
 * bundled once at save time).
 */
export async function serveStoredCode(
  store: CodeStore,
  interpreters: Record<Language, Interpreter>,
  id: string,
  req: HttpInput,
): Promise<Response> {
  const record = await store.get(id);
  if (!record) return new Response("not found", { status: 404 });
  return interpreters[record.language].runRaw(record.bundled ?? record.code, {
    lang: record.language,
    input: req,
    identity: `code:${id}`,
    allowedHosts: record.allowedHosts ?? [],
  });
}
