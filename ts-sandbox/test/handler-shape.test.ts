// Pins the transpile -> module.exports.default -> handler-detection contract that
// index.ts relies on, using the real sucrase transform (no live server needed).
import { test } from "node:test";
import assert from "node:assert/strict";
import { transform } from "sucrase";
import { AsyncFunction, detectHandler, coerceUserResponse } from "../src/runner";

async function runUserCode(code: string): Promise<any> {
  const transpiled = transform(code, {
    transforms: ["typescript", "imports"],
    preserveDynamicImport: false,
  }).code;
  const moduleObj: any = { exports: {} };
  const fn = new AsyncFunction("require", "module", "exports", "console", "fetch", transpiled);
  await fn(
    (n: string) => {
      throw new Error("no module " + n);
    },
    moduleObj,
    moduleObj.exports,
    console,
    fetch
  );
  return moduleObj;
}

test("`export default { fetch }` transpiles to a detectable handler", async () => {
  const m = await runUserCode(
    `export default { async fetch(req: Request) { return new Response("ok"); } };`
  );
  const h = detectHandler(m.exports);
  assert.equal(typeof h, "function");
  const resp = await h!(new Request("http://x/"));
  assert.equal(await coerceUserResponse(resp).text(), "ok");
});

test("`export default function` transpiles to a detectable handler", async () => {
  const m = await runUserCode(
    `export default function (req: Request) { return new Response("fromfn"); }`
  );
  const h = detectHandler(m.exports);
  assert.equal(typeof h, "function");
  assert.equal(await coerceUserResponse(await h!(new Request("http://x/"))).text(), "fromfn");
});

test("a main-shape script (no default export) is not a handler", async () => {
  const m = await runUserCode(`const x: number = 41; console.log(x + 1);`);
  assert.equal(detectHandler(m.exports), null);
});

test("named exports alone do not count as a handler", async () => {
  const m = await runUserCode(`export const foo = 1; export function bar() {}`);
  assert.equal(detectHandler(m.exports), null);
});
