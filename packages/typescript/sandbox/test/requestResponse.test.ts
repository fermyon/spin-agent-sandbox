import assert from "node:assert/strict";
import { test } from "node:test";
import { BodyStream, buildRequest, toWireResponse } from "../src/requestResponse";

test("buildRequest defaults to GET / with no body", async () => {
  const req = buildRequest(undefined);
  assert.equal(req.method, "GET");
  assert.equal(req.url, "http://sandbox.local/");
  assert.equal(await req.text(), "");
});

test("buildRequest builds the query string and uppercases the method", () => {
  const req = buildRequest({
    method: "post",
    path: "/x",
    headers: [],
    query: [["a", "1"], ["b", "2"]],
  });
  assert.equal(req.method, "POST");
  assert.equal(req.url, "http://sandbox.local/x?a=1&b=2");
});

test("buildRequest passes headers through", () => {
  const req = buildRequest({
    method: "GET",
    path: "/",
    headers: [["x-test", "yes"]],
    query: [],
  });
  assert.equal(req.headers.get("x-test"), "yes");
});

test("buildRequest drops the body for GET/HEAD even if one is given", async () => {
  const body = new TextEncoder().encode("should be ignored");
  const req = buildRequest({ method: "GET", path: "/", headers: [], query: [], body });
  assert.equal(await req.text(), "");
});

test("buildRequest attaches the body for non-GET/HEAD methods", async () => {
  const body = new TextEncoder().encode("hello");
  const req = buildRequest({ method: "POST", path: "/", headers: [], query: [], body });
  assert.equal(await req.text(), "hello");
});

test("toWireResponse round-trips status, headers, and body", async () => {
  const resp = new Response("hi", { status: 201, headers: { "x-test": "yes" } });
  const wire = await toWireResponse(resp);
  assert.equal(wire.status, 201);
  assert.deepEqual(wire.headers.find(([k]) => k === "x-test"), ["x-test", "yes"]);
  // we have to read bodystream to the end to ensure the body is fully consumed
  let body = "";
  while (true) {
    let chunk = await wire.body.read();
    if (chunk.tag == "chunk" && chunk.val != null) {
      body += new TextDecoder().decode(chunk.val);
    }
    if (chunk.tag == "done") {
      break;
    }
    if (chunk.tag == "error") {
      throw new Error("Error reading body");
    }

  }
  assert.equal(body, "hi");
});

test("BodyStream reports non-byte chunks as an error instead of passing them on", async () => {
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue("not bytes");
      controller.close();
    },
  });
  const body = new BodyStream(stream as ReadableStream<Uint8Array>);
  assert.deepEqual(await body.read(), { tag: "error", val: "response body stream chunks must be Uint8Array" });
  assert.deepEqual(await body.read(), { tag: "done" });
});

test("BodyStream reports an unstringifiable stream error as an error chunk", async () => {
  const stream = new ReadableStream({
    pull() {
      throw Object.create(null);
    },
  });
  const chunk = await new BodyStream(stream).read();
  assert.equal(chunk.tag, "error");
});
