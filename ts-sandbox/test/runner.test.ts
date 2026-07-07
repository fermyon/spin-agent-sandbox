import { test } from "node:test";
import assert from "node:assert/strict";
import { detectHandler, coerceUserResponse } from "../src/runner";

test("detectHandler finds `export default { fetch }`", () => {
  const h = detectHandler({ default: { fetch: () => {} } });
  assert.equal(typeof h, "function");
});

test("detectHandler finds `export default function`", () => {
  const h = detectHandler({ default: function () {} });
  assert.equal(typeof h, "function");
});

test("detectHandler returns null for the main shape / non-handler exports", () => {
  assert.equal(detectHandler({}), null);
  assert.equal(detectHandler({ default: { notFetch: 1 } }), null);
  assert.equal(detectHandler(undefined), null);
});

test("detectHandler binds `this` to the default object", async () => {
  const obj = {
    marker: 42,
    fetch(this: any) {
      return this.marker;
    },
  };
  const h = detectHandler({ default: obj })!;
  assert.equal(await h(new Request("http://x/")), 42);
});

test("coerceUserResponse passes a Response through unchanged", () => {
  const r = new Response("hi");
  assert.equal(coerceUserResponse(r), r);
});

test("coerceUserResponse wraps a string in a Response", async () => {
  const r = coerceUserResponse("hello");
  assert.equal(await r.text(), "hello");
});

test("coerceUserResponse JSON-encodes objects and coerces undefined to null", async () => {
  assert.deepEqual(await coerceUserResponse({ a: 1 }).json(), { a: 1 });
  assert.equal(await coerceUserResponse(undefined).json(), null);
});
