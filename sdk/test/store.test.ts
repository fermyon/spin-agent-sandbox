import { test } from "node:test";
import assert from "node:assert/strict";

import { KvCodeStore, serveStoredCode } from "../src/store/index.ts";
import type { Interpreter } from "../src/interpreter/index.ts";
import type { CodeStore, StoredCode } from "../src/core/index.ts";

// An in-memory stand-in for the InterpreterKV an Interpreter hands back from kv().
function fakeKvInterpreter() {
  const map = new Map<string, unknown>();
  const kv = {
    async getJson<T>(key: string): Promise<T | null> {
      return map.has(key) ? (map.get(key) as T) : null;
    },
    async setJson(key: string, value: unknown): Promise<void> {
      map.set(key, JSON.parse(JSON.stringify(value))); // clone, like a real round-trip
    },
    async delete(key: string): Promise<void> {
      map.delete(key);
    },
  };
  const interpreter = { kv: () => kv } as unknown as Interpreter;
  return { interpreter, map };
}

test("KvCodeStore: save writes a record + index; list/get read them back", async () => {
  const { interpreter } = fakeKvInterpreter();
  let n = 0;
  const store = new KvCodeStore({ interpreter, namespace: "apps", newId: () => `id${++n}`, now: () => 1000 });

  const m1 = await store.save({ code: "export default {}", language: "javascript", title: "one" });
  assert.equal(m1.id, "id1");
  assert.equal(m1.language, "javascript");
  assert.equal(m1.title, "one");
  assert.equal(m1.createdAt, 1000);

  await store.save({ code: "print(1)", language: "python" });
  assert.deepEqual((await store.list()).map((m) => m.id), ["id1", "id2"]);

  const got = await store.get("id1");
  assert.equal(got?.code, "export default {}");
  assert.equal(got?.language, "javascript");
  assert.equal(await store.get("missing"), null);
});

test("KvCodeStore: save with an existing id updates in place (stable id, preserved createdAt)", async () => {
  const { interpreter } = fakeKvInterpreter();
  let n = 0;
  let t = 100;
  const store = new KvCodeStore({ interpreter, newId: () => `id${++n}`, now: () => (t += 1) });

  const m1 = await store.save({ code: "v1", language: "javascript", title: "A" });
  const m2 = await store.save({ id: m1.id, code: "v2", language: "javascript", title: "A edited" });

  assert.equal(m2.id, m1.id);
  assert.equal(m2.createdAt, m1.createdAt); // original time preserved on update
  assert.equal((await store.get(m1.id))?.code, "v2");
  const list = await store.list();
  assert.deepEqual(list.map((m) => m.id), [m1.id]); // no duplicate index entry
  assert.equal(list[0].title, "A edited");
});

test("KvCodeStore: default ids are UUID v4 (unique)", async () => {
  const { interpreter } = fakeKvInterpreter();
  const store = new KvCodeStore({ interpreter }); // no newId → default crypto.randomUUID()
  const a = await store.save({ code: "a", language: "javascript" });
  const b = await store.save({ code: "b", language: "javascript" });
  const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
  assert.match(a.id, UUID);
  assert.match(b.id, UUID);
  assert.notEqual(a.id, b.id);
});

test("KvCodeStore: delete removes the record and the index entry", async () => {
  const { interpreter } = fakeKvInterpreter();
  let n = 0;
  const store = new KvCodeStore({ interpreter, newId: () => `id${++n}`, now: () => 0 });

  await store.save({ code: "a", language: "javascript" });
  const { id } = await store.save({ code: "b", language: "javascript" });
  await store.delete(id);

  assert.equal(await store.get(id), null);
  assert.deepEqual((await store.list()).map((m) => m.id), ["id1"]);
});

test("serveStoredCode: routes by stored language, scopes identity, denies egress, forwards Response", async () => {
  const record: StoredCode = { id: "x", language: "python", createdAt: 0, code: "def handle_request(r): ..." };
  const store = { get: async (id: string) => (id === "x" ? record : null) } as unknown as CodeStore;

  const calls: Array<{ lang: string; code: string; opts: any }> = [];
  const mk = (lang: string) => ({
    runRaw: async (code: string, opts: any) => {
      calls.push({ lang, code, opts });
      return new Response("ok", { status: 200, headers: { "content-type": "text/html" } });
    },
  });
  const interpreters = { javascript: mk("js"), python: mk("py") } as any;

  const resp = await serveStoredCode(store, interpreters, "x", { method: "GET", path: "/data" });
  assert.equal(resp.status, 200);
  assert.equal(await resp.text(), "ok");
  assert.equal(calls.length, 1);
  assert.equal(calls[0].lang, "py"); // routed by the stored language, not the KV transport
  assert.equal(calls[0].opts.identity, "code:x");
  assert.deepEqual(calls[0].opts.allowedHosts, []);
  assert.equal(calls[0].opts.kvEnabled, false);
  assert.equal(calls[0].opts.input.path, "/data");

  record.kvEnabled = true;
  await serveStoredCode(store, interpreters, "x", {});
  assert.equal(calls[1].opts.kvEnabled, true);

  const missing = await serveStoredCode(store, interpreters, "nope", {});
  assert.equal(missing.status, 404);
});

test("pre-bundled app: save keeps source + bundle + deps; serveStoredCode runs the bundle", async () => {
  const { interpreter } = fakeKvInterpreter();
  let n = 0;
  const store = new KvCodeStore({ interpreter, namespace: "apps", newId: () => `id${++n}`, now: () => 0 });

  const meta = await store.save({
    code: "import M from 'mustache'; export default { fetch(){} }",
    language: "javascript",
    title: "greeter",
    dependencies: { mustache: "^4.2.0" },
    bundled: "BUNDLED_BLOB();",
  });

  // dependencies are metadata (surface in list()); source is kept for editing; bundle is stored
  assert.deepEqual((await store.list())[0].dependencies, { mustache: "^4.2.0" });
  const rec = await store.get(meta.id);
  assert.match(rec?.code ?? "", /import M from 'mustache'/);
  assert.equal(rec?.bundled, "BUNDLED_BLOB();");

  // serveStoredCode runs the BUNDLE, not the source
  const seen: string[] = [];
  const mk = () => ({ runRaw: async (code: string) => { seen.push(code); return new Response("ok"); } });
  await serveStoredCode(store, { javascript: mk(), python: mk() } as any, meta.id, { method: "GET", path: "/" });
  assert.equal(seen[0], "BUNDLED_BLOB();");
});

test("serveStoredCode falls back to the source when there is no bundle", async () => {
  const record: StoredCode = { id: "y", language: "javascript", createdAt: 0, code: "SOURCE();" };
  const store = { get: async (id: string) => (id === "y" ? record : null) } as unknown as CodeStore;
  const seen: string[] = [];
  const mk = () => ({ runRaw: async (code: string) => { seen.push(code); return new Response("ok"); } });
  await serveStoredCode(store, { javascript: mk(), python: mk() } as any, "y", {});
  assert.equal(seen[0], "SOURCE();");
});
