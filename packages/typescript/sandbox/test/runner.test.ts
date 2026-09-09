import assert from "node:assert/strict";
import { test } from "node:test";
import { coerceUserResponse, detectHandler } from "../src/runner";

test("detectHandler recognizes an { fetch } default export", async () => {
  const fetch = () => new Response("ok");
  const handler = detectHandler({ default: { fetch } });
  assert.ok(handler);
  // Bound to the exports object, not reference-equal to the raw fetch fn.
  const resp = await handler!(new Request("http://x"));
  assert.equal(await (resp as Response).text(), "ok");
});

test("detectHandler recognizes a bare function default export", () => {
  const fn = () => new Response("ok");
  const handler = detectHandler({ default: fn });
  assert.equal(handler, fn);
});

test("detectHandler returns null for a main-shape module", () => {
  assert.equal(detectHandler({}), null);
  assert.equal(detectHandler({ default: { notFetch: 1 } }), null);
  assert.equal(detectHandler({ default: 42 }), null);
});

test("coerceUserResponse passes a Response through unchanged", () => {
  const resp = new Response("hi");
  assert.equal(coerceUserResponse(resp), resp);
});

test("coerceUserResponse wraps a string in a Response", async () => {
  const resp = coerceUserResponse("hello");
  assert.ok(resp instanceof Response);
  assert.equal(await resp.text(), "hello");
});

test("coerceUserResponse JSON-encodes other values, including undefined as null", async () => {
  const resp = coerceUserResponse({ a: 1 });
  assert.equal(await resp.text(), JSON.stringify({ a: 1 }));

  const nullResp = coerceUserResponse(undefined);
  assert.equal(await nullResp.text(), "null");
});
