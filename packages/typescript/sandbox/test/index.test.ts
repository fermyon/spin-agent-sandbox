import assert from "node:assert/strict";
import { mock, test } from "node:test";
import { BodyStream } from "../src/requestResponse";

// See test/registry.test.ts — index.ts pulls in registry.ts, which
// unconditionally bundles @spinframework/spin-kv.
mock.module("@spinframework/spin-kv", {
  namedExports: { open: () => ({}), openDefault: () => ({}) },
});

const { executor } = await import("../src/index");

test("main-shape code with no default export succeeds silently", async () => {
  const outcome = await executor.run("const x = 1 + 1;", undefined);
  assert.deepEqual(outcome, { tag: "main", val: undefined });
});

test("main-shape code that throws reports the stack as the outcome", async () => {
  const outcome = await executor.run("throw new Error('boom');", undefined);
  assert.equal(outcome.tag, "main");
  assert.match(String(outcome.val), /boom/);
});

test("invalid syntax is reported as a compile error, not thrown", async () => {
  const outcome = await executor.run("const x = ;;;", undefined);
  assert.equal(outcome.tag, "compile-error");
});

test("handler-shape { fetch } export runs and returns a wire response", async () => {
  const code = `
    export default {
      fetch(req) {
        return new Response("got:" + req.method, { status: 201 });
      }
    };
  `;
  const outcome = await executor.run(code, { method: "POST", path: "/x", headers: [], query: [] });
  assert.equal(outcome.tag, "handler-response");
  if (outcome.tag !== "handler-response") throw new Error("unreachable");
  assert.equal(outcome.val.status, 201);
  assert.equal(await readBodyToString(outcome.val.body), "got:POST");
});

test("handler-shape bare-function export also works", async () => {
  const code = `export default function (req) { return new Response("fn-ok"); }`;
  const outcome = await executor.run(code, undefined);
  assert.equal(outcome.tag, "handler-response");
  if (outcome.tag !== "handler-response") throw new Error("unreachable");
  assert.equal(outcome.val.status, 200);
  assert.equal(await readBodyToString(outcome.val.body), "fn-ok");
});

test("a throwing handler is reported as a handler-error", async () => {
  const code = `export default { fetch() { throw new Error("handler blew up"); } };`;
  const outcome = await executor.run(code, undefined);
  assert.equal(outcome.tag, "handler-error");
  assert.match(String(outcome.val), /handler blew up/);
});

test("guest code can require a bundled dependency (zod)", async () => {
  const code = `
    const { z } = require("zod");
    const result = z.object({ a: z.number() }).safeParse({ a: 1 });
    if (!result.success) throw new Error("zod validation unexpectedly failed");
  `;
  const outcome = await executor.run(code, undefined);
  assert.deepEqual(outcome, { tag: "main", val: undefined });
});

test("requiring a non-bundled module surfaces the registry's error", async () => {
  const outcome = await executor.run(`require("fs");`, undefined);
  assert.equal(outcome.tag, "main");
  assert.match(String(outcome.val), /module not found: 'fs'/);
});

test("TypeScript syntax is transpiled before execution", async () => {
  const code = `
    interface Point { x: number; y: number; }
    const p: Point = { x: 1, y: 2 };
    if (p.x + p.y !== 3) throw new Error("bad transpile");
  `;
  const outcome = await executor.run(code, undefined);
  assert.deepEqual(outcome, { tag: "main", val: undefined });
});

test("thrown values that cannot be stringified are still reported", async () => {
  const cases = [
    "throw Object.create(null);",
    "throw { get message() { throw new Error('getter'); } };",
    "throw new Proxy({}, { get() { throw new Error('trap'); } });",
    "throw { message: { toString() { throw new Error('toString'); } } };",
  ];
  for (const code of cases) {
    const outcome = await executor.run(code, undefined);
    assert.equal(outcome.tag, "main", code);
    assert.equal(typeof outcome.val, "string", code);
  }
});

test("a handler that throws an unstringifiable value is a handler-error", async () => {
  const code = `export default { fetch() { throw Object.create(null); } };`;
  const outcome = await executor.run(code, undefined);
  assert.equal(outcome.tag, "handler-error");
  assert.equal(typeof outcome.val, "string");
});

test("a throwing getter on the default export is reported, not thrown", async () => {
  const code = `module.exports = { get default() { throw new Error("export getter"); } };`;
  const outcome = await executor.run(code, undefined);
  assert.equal(outcome.tag, "main");
  assert.match(String(outcome.val), /export getter/);
});

test("a Response whose headers getter throws is a handler-error", async () => {
  const code = `
    class Bad extends Response {
      get headers() { throw new Error("headers getter"); }
    }
    export default { fetch() { return new Bad("x"); } };
  `;
  const outcome = await executor.run(code, undefined);
  assert.equal(outcome.tag, "handler-error");
  assert.match(String(outcome.val), /headers getter/);
});

async function readBodyToString(body: BodyStream) {
  let result = "";
  while (true) {
    let chunk = await body.read();
    if (chunk.tag == "chunk" && chunk.val != null) {
      result += new TextDecoder().decode(chunk.val);
    }
    if (chunk.tag == "done") {
      break;
    }
    if (chunk.tag == "error") {
      throw new Error("Error reading body");
    }
  }
  return result;
}
