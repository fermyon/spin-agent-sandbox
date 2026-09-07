import assert from "node:assert/strict";
import { mock, test } from "node:test";

// @spinframework/spin-kv imports the special `fermyon:spin/key-value@2.0.0`
// scheme, which only resolves inside the real componentized Wasm runtime
// (satisfied there by guard-io's own store). Stub it so registry.ts — which
// bundles it unconditionally for guest code that does `require()` it — can
// load under plain Node. Must happen before the dynamic import below; see
// test/run.mjs for why this needs a dynamic import plus esbuild splitting.
mock.module("@spinframework/spin-kv", {
  namedExports: { open: () => ({}), openDefault: () => ({}) },
});

const { makeRequire } = await import("../src/registry");

const BUNDLED = [
  "cheerio",
  "node-html-parser",
  "zod",
  "js-yaml",
  "nanoid",
  "ulidx",
  "uuid",
  "lodash",
  "date-fns",
  "dayjs",
  "@spinframework/spin-kv",
];

for (const name of BUNDLED) {
  test(`makeRequire resolves the bundled module '${name}'`, () => {
    const require = makeRequire();
    assert.ok(require(name), `expected require("${name}") to return a module`);
  });
}

test("makeRequire throws a descriptive error for a module that isn't bundled", () => {
  const require = makeRequire();
  assert.throws(() => require("fs"), (err: unknown) => {
    assert.ok(err instanceof Error);
    assert.match(err.message, /module not found: 'fs'/);
    // Lists the allowed set so the error is actionable, not just a bare failure.
    assert.match(err.message, /lodash/);
    return true;
  });
});
