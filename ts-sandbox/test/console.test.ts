import { test } from "node:test";
import assert from "node:assert/strict";
import { fmt, makeConsole, MAX_OUTPUT } from "../src/console";

test("fmt stringifies args and joins with a space", () => {
  assert.equal(fmt(["a", 1, { b: 2 }]), 'a 1 {"b":2}');
});

test("fmt falls back to String() on a circular value", () => {
  const o: any = {};
  o.self = o;
  assert.equal(fmt([o]), String(o)); // "[object Object]"
});

test("makeConsole routes log/info/debug to stdout and warn/error to stderr", () => {
  const out: string[] = [];
  const err: string[] = [];
  const c = makeConsole(out, err);
  c.log("a");
  c.info("b");
  c.debug("c");
  c.warn("d");
  c.error("e");
  assert.deepEqual(out, ["a", "b", "c"]);
  assert.deepEqual(err, ["d", "e"]);
});

test("makeConsole caps a stream and appends the truncation marker exactly once", () => {
  const out: string[] = [];
  const err: string[] = [];
  const c = makeConsole(out, err);
  c.log("x".repeat(MAX_OUTPUT + 100));
  c.log("more");
  c.log("again");
  const joined = out.join("");
  assert.ok(joined.includes("...[truncated]"));
  assert.equal(out.filter((s) => s === "...[truncated]").length, 1);
  assert.ok(joined.length <= MAX_OUTPUT + "...[truncated]".length);
});
