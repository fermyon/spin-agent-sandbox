import { test } from "node:test";
import assert from "node:assert/strict";
import { wrapStore, scopedPrefix, makeScopedKv } from "../src/kv";

function fakeStore() {
  const m = new Map<string, any>();
  return {
    _m: m,
    get: (k: string) => (m.has(k) ? m.get(k) : null),
    set: (k: string, v: any) => void m.set(k, v),
    delete: (k: string) => void m.delete(k),
    exists: (k: string) => m.has(k),
    getKeys: () => [...m.keys()],
    getJson: (k: string) => JSON.parse(m.get(k)),
    setJson: (k: string, v: any) => void m.set(k, JSON.stringify(v)),
  };
}

test("scopedPrefix is length-prefixed and unambiguous", () => {
  assert.equal(scopedPrefix("a"), "1:a:");
  assert.equal(scopedPrefix("a-b"), "3:a-b:");
});

test('sandbox "a" cannot read sandbox "a-b" via the "-" prefix collision', () => {
  const store = fakeStore();
  const victim = wrapStore(store, "a-b");
  victim.set("secret", "TOP");
  const attacker = wrapStore(store, "a");
  // Under the old "{id}-{key}" scheme attacker.get("b-secret") returned "TOP".
  assert.equal(attacker.get("b-secret"), null);
  assert.deepEqual(attacker.getKeys(), []);
});

test("getKeys returns only the sandbox's own keys, unprefixed", () => {
  const store = fakeStore();
  const s = wrapStore(store, "a-b");
  s.set("k1", "1");
  s.set("k2", "2");
  wrapStore(store, "zzz").set("x", "9");
  assert.deepEqual(s.getKeys().sort(), ["k1", "k2"]);
});

test("getJson returns null for a missing key (no throw) and round-trips values", () => {
  const store = fakeStore();
  const s = wrapStore(store, "sb");
  assert.equal(s.getJson("nope"), null);
  s.setJson("a", { v: 1 });
  assert.deepEqual(s.getJson("a"), { v: 1 });
});

test("makeScopedKv wires openDefault/open through wrapStore", () => {
  const store = fakeStore();
  const kv = makeScopedKv({ openDefault: () => store, open: () => store }, "sb");
  kv.openDefault().set("k", "v");
  assert.equal(store._m.get("2:sb:k"), "v");
});
