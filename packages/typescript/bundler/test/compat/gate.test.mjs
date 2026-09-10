import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import catalog from "./catalog.mjs";
import { checkCompatibility, parseBaseline } from "./gate.mjs";

const cases = [{ name: "working", version: "^1.0.0" }, { name: "unsupported", version: "^2.0.0" }];
const baseline = cases.map((entry, i) => ({ ...entry, required: i === 0 }));
const results = cases.map((entry, i) => ({ ...entry, status: i ? "compile_error" : "pass" }));
const check = (actual = results, expected = baseline, entries = cases) => checkCompatibility(entries, expected, actual);

test("the committed baseline covers the complete catalog using only reviewed requirements", () => {
  const document = JSON.parse(readFileSync(new URL("./baseline.json", import.meta.url)));
  const recorded = parseBaseline(document);
  const actual = recorded.map(({ name, version, required }) => ({ name, version, status: required ? "pass" : "compile_error" }));
  const result = checkCompatibility(catalog, recorded, actual);
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.equal(result.total, catalog.length);
  assert.equal(result.requiredPasses, recorded.filter(row => row.required).length);
  assert.deepEqual(Object.keys(document).sort(), ["libraries", "schemaVersion"]);
  assert.ok(recorded.every(row => Object.keys(row).sort().join() === "name,required,version"));
});

test("known failures and improvements are accepted", () => {
  assert.equal(check().ok, true);
  assert.equal(check([results[0], { ...results[1], status: "runtime_error" }]).ok, true);
  const improved = check(results.map((entry) => ({ ...entry, status: "pass" })));
  assert.equal(improved.ok, true);
  assert.deepEqual(improved.improvements, ["unsupported"]);
});

test("a regression fails even when an improvement preserves the pass count", () => {
  const result = check([{ ...results[0], status: "runtime_error", detail: "broken" }, { ...results[1], status: "pass" }]);
  assert.equal(result.ok, false);
  assert.equal(result.passed, result.requiredPasses);
  assert.deepEqual(result.regressions, [{ name: "working", status: "runtime_error", detail: "broken" }]);
});

test("empty, missing, duplicate, unknown, and malformed results cannot pass", () => {
  for (const actual of [undefined, [], [results[0]], [results[1]], [...results, results[0]],
    [...results, { name: "surprise", version: "", status: "pass" }], [results[0], null],
    [results[0], { ...results[1], status: "skipped" }], [results[0], { ...results[1], version: undefined }]]) {
    const result = checkCompatibility(cases, baseline, actual);
    assert.equal(result.ok, false, JSON.stringify(actual));
    assert.ok(result.errors.length > 0);
  }
});

test("incomplete network requests fail even for a known unsupported library", () => {
  const result = check([results[0], { ...results[1], status: "net_error" }]);
  assert.equal(result.ok, false);
  assert.match(result.errors.join("\n"), /did not complete/);
});

test("network failures of required libraries fail without claiming a compatibility regression", () => {
  const result = check([{ ...results[0], status: "net_error" }, results[1]]);
  assert.equal(result.ok, false);
  assert.equal(result.errors.length, 1);
  assert.match(result.errors[0], /working did not complete/);
  assert.deepEqual(result.regressions, []);
});

test("catalog additions, removals and version changes require a reviewed baseline", () => {
  const added = { name: "new-library", version: "^1.0.0", status: "pass" };
  assert.equal(check([...results, added], baseline, [...cases, added]).ok, false);
  assert.equal(check([results[0]], baseline, [cases[0]]).ok, false);
  const changed = { ...cases[0], version: "^3.0.0", status: "pass" };
  assert.equal(check([changed, results[1]], baseline, [changed, cases[1]]).ok, false);
  assert.equal(check([{ ...results[0], version: "wrong" }, results[1]]).ok, false);
});

test("invalid baseline and catalog data cannot turn the gate into a no-op", () => {
  assert.equal(check(results, []).ok, false);
  assert.equal(check(results, undefined, []).ok, false);
  assert.equal(check(results, [...baseline, baseline[0]]).ok, false);
  assert.equal(check(results, baseline, [...cases, cases[0]]).ok, false);
  for (const required of [undefined, null, "false", 0, 1]) {
    assert.equal(check(results, [{ ...baseline[0], required }, baseline[1]]).ok, false);
  }
});

test("baseline envelopes require the known schema and valid requirement entries", () => {
  assert.deepEqual(parseBaseline({ schemaVersion: 1, libraries: baseline }), baseline);
  for (const document of [null, {}, { schemaVersion: 2, libraries: baseline },
    { schemaVersion: 1, libraries: results }, { schemaVersion: 1, libraries: [...baseline, baseline[0]] }]) {
    assert.throws(() => parseBaseline(document));
  }
});
