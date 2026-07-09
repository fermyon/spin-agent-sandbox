import { test } from "node:test";
import assert from "node:assert/strict";
import { validateEnvelope, buildRequest, errorResponse, MAX_CODE } from "../src/envelope";

test("validateEnvelope rejects missing or mistyped fields", () => {
  assert.equal(validateEnvelope(null).ok, false);
  assert.equal(validateEnvelope({}).ok, false);
  assert.equal(validateEnvelope({ code: "x" }).ok, false);
  assert.equal(validateEnvelope({ code: 1, sandboxId: "s" }).ok, false);
  assert.equal(validateEnvelope({ code: "x", sandboxId: 1 }).ok, false);
});

test("validateEnvelope rejects oversized code with 413", () => {
  const r = validateEnvelope({ code: "x".repeat(MAX_CODE + 1), sandboxId: "s" });
  assert.equal(r.ok, false);
  if (!r.ok) assert.equal(r.status, 413);
});

test("validateEnvelope accepts a valid envelope and defaults allowedHosts to []", () => {
  const r = validateEnvelope({ code: "print(1)", sandboxId: "s", input: { method: "GET" } });
  assert.equal(r.ok, true);
  if (r.ok) {
    assert.deepEqual(r.allowedHosts, []);
    assert.equal(r.sandboxId, "s");
  }
});

test("validateEnvelope preserves a provided allowedHosts array", () => {
  const r = validateEnvelope({ code: "x", sandboxId: "s", allowedHosts: ["a.com"] });
  assert.equal(r.ok, true);
  if (r.ok) assert.deepEqual(r.allowedHosts, ["a.com"]);
});

test("buildRequest: GET drops the body and sets query params", () => {
  const req = buildRequest({ method: "get", query: { n: "ada", x: 2 } });
  assert.equal(req.method, "GET");
  const u = new URL(req.url);
  assert.equal(u.searchParams.get("n"), "ada");
  assert.equal(u.searchParams.get("x"), "2");
  assert.equal(req.body, null);
});

test("buildRequest: POST serializes an object body as JSON", async () => {
  const req = buildRequest({ method: "POST", body: { a: 1 } });
  assert.equal(req.method, "POST");
  assert.equal(await req.text(), '{"a":1}');
});

test("buildRequest: POST passes a string body through unchanged", async () => {
  const req = buildRequest({ method: "POST", body: "raw" });
  assert.equal(await req.text(), "raw");
});

test("buildRequest: input.path sets the pathname (default '/')", () => {
  assert.equal(new URL(buildRequest({}).url).pathname, "/");
  assert.equal(new URL(buildRequest({ path: "/api/data" }).url).pathname, "/api/data");
  const u = new URL(buildRequest({ path: "/x", query: { a: "1" } }).url);
  assert.equal(u.pathname, "/x");
  assert.equal(u.searchParams.get("a"), "1");
});

test("errorResponse builds a JSON error body with the given status", async () => {
  const r = errorResponse(400, "invalid_json", "bad");
  assert.equal(r.status, 400);
  assert.deepEqual(await r.json(), { error: "invalid_json", message: "bad" });
});
