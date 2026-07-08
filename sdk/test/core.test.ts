import { test } from "node:test";
import assert from "node:assert/strict";

import { langToRoute, withDefaults } from "../src/core/index.ts";

test("langToRoute maps languages to interpreter routes", () => {
  assert.equal(langToRoute("python"), "py");
  assert.equal(langToRoute("javascript"), "ts");
  assert.equal(langToRoute(undefined), "py"); // python default
});

test("withDefaults applies python and preserves opts", () => {
  assert.equal(withDefaults(undefined).lang, "python");
  assert.equal(withDefaults({ lang: "javascript" }).lang, "javascript");
  assert.deepEqual(withDefaults({ allowedHosts: ["a"] }).allowedHosts, ["a"]);
});
