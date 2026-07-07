// Scoped key-value store: one shared `default` store, each sandbox sees only its own
// keys. Pure logic (no Spin imports) so it is unit-testable with a fake store; the real
// `@spinframework/spin-kv` module is injected by index.ts.

// Length-prefixed so no sandbox id can be a key-prefix of another's: a bare `${id}-`
// separator collides (id "a" + key "b-k" === id "a-b" + key "k"), which would let one
// sandbox read/write/enumerate another's keys.
export function scopedPrefix(sandboxId: string): string {
  return `${sandboxId.length}:${sandboxId}:`;
}

export interface KvStore {
  get(key: string): unknown;
  set(key: string, value: unknown): void;
  delete(key: string): void;
  exists(key: string): boolean;
  getKeys(): string[];
  getJson(key: string): unknown;
  setJson(key: string, value: unknown): void;
}

// Wrap a raw store so every operation is transparently namespaced to `sandboxId`.
export function wrapStore(store: any, sandboxId: string): KvStore {
  const prefix = scopedPrefix(sandboxId);
  return {
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
  };
}

export interface KvModule {
  openDefault(): any;
  open(label: string): any;
}

// Build the `@spinframework/spin-kv`-shaped object handed to user code, scoped to sandboxId.
export function makeScopedKv(kv: KvModule, sandboxId: string) {
  return {
    openDefault: () => wrapStore(kv.openDefault(), sandboxId),
    open: (label: string) => wrapStore(kv.open(label), sandboxId),
  };
}
