import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { formatBaseline, parseArguments, prepareBaselineUpdate, updateBaseline } from "./update-baseline.mjs";

const entries = [{ name: "working", version: "^1.0.0" }, { name: "unsupported", version: "^2.0.0" }];
const baseline = { schemaVersion: 1, libraries: entries.map((row, i) => ({ ...row, required: i === 0 })) };
const metadata = { schemaVersion: 1, complete: true, selectedCount: 2, catalogCount: 2 };
const report = { results: entries.map((row, i) => ({ ...row, status: i ? "compile_error" : "pass", detail: "example detail", stdout: "output" })) };
const prepare = (overrides = {}) => prepareBaselineUpdate(overrides.entries ?? entries, overrides.baseline ?? baseline,
  overrides.metadata ?? metadata, overrides.report ?? report, overrides.accepted ?? []);

function fixture(t) {
  const directory = mkdtempSync(path.join(os.tmpdir(), "compat-promotion-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const baselinePath = path.join(directory, "baseline.json");
  const runDirectory = path.join(directory, "run");
  mkdirSync(runDirectory);
  writeFileSync(baselinePath, formatBaseline(baseline));
  writeFileSync(path.join(runDirectory, "run.json"), JSON.stringify(metadata));
  writeFileSync(path.join(runDirectory, "results.json"), JSON.stringify(report));
  writeFileSync(path.join(runDirectory, "REPORT.md"), "important report\n");
  return { directory, baselinePath, runDirectory, entries };
}

test("promotion stores only name, version, and required, and discovers new required passes", () => {
  const improved = { results: report.results.map(row => ({ ...row, status: "pass" })) };
  const result = prepare({ report: improved });
  assert.deepEqual(result.baseline.libraries, entries.map(row => ({ ...row, required: true })));
  assert.deepEqual(result.changes, ["Required unsupported: false -> true"]);
  assert.deepEqual(result.regressions, []);
  assert.equal(formatBaseline(result.baseline).split("\n").length, 8);
  assert.doesNotMatch(formatBaseline(result.baseline), /stdout|detail|status/);
});

test("unchanged requirements produce no changes", () => {
  assert.deepEqual(prepare().changes, []);
});

test("previously required failures require exactly named acknowledgements", () => {
  const failed = { results: report.results.map(row => ({ ...row, status: "runtime_error" })) };
  assert.throws(() => prepare({ report: failed }), /Previously required libraries no longer pass: working/);
  assert.throws(() => prepare({ report: failed, accepted: ["unsupported"] }), /not regressions: unsupported/);
  assert.throws(() => prepare({ report: failed, accepted: ["working", "unsupported"] }), /not regressions: unsupported/);
  const accepted = prepare({ report: failed, accepted: ["working"] });
  assert.deepEqual(accepted.regressions, ["working"]);
  assert.equal(accepted.baseline.libraries[0].required, false);
  for (const names of [["working", "working"], [""], [" working"], [null]]) {
    assert.throws(() => prepare({ report: failed, accepted: names }), /distinct, non-empty library names/);
  }
});

test("complete metadata alone cannot promote incomplete, duplicate, malformed, or stale results", () => {
  for (const results of [undefined, [], [report.results[0]], [...report.results, report.results[0]],
    [...report.results, { name: "surprise", version: "1", status: "pass" }],
    [report.results[0], { ...report.results[1], version: "3" }],
    [report.results[0], { ...report.results[1], status: "skipped" }],
    [report.results[0], { ...report.results[1], status: "net_error" }], [report.results[0], null]]) {
    assert.throws(() => prepare({ report: { results } }));
  }
});

test("interrupted sweeps, filtered sweeps, and invalid metadata cannot be promoted", () => {
  for (const meta of [{ ...metadata, complete: false }, { ...metadata, complete: "true" },
    { ...metadata, schemaVersion: 2 }, { ...metadata, selectedCount: 1 },
    { ...metadata, catalogCount: 3 }, { complete: true, schemaVersion: 1 }, {}]) {
    assert.throws(() => prepare({ metadata: meta }));
  }
});

test("catalog additions, removals, and version changes are explicit in the diff", () => {
  const revised = [{ ...entries[0], version: "^3.0.0" }, { name: "new", version: "1" }];
  const result = prepare({ entries: revised, report: { results: revised.map(row => ({ ...row, status: "pass" })) } });
  assert.deepEqual(result.changes, [
    'Version working: "^1.0.0" -> "^3.0.0"',
    "Added new@1: required=true",
    "Removed unsupported@^2.0.0: required=false",
  ]);
  assert.throws(() => prepare({ entries: revised, report: { results: revised.map(row => ({ ...row, status: "runtime_error" })) } }), /working/);
});

test("invalid old baseline requirements fail before promotion", () => {
  for (const old of [{ schemaVersion: 2, libraries: baseline.libraries },
    { schemaVersion: 1, libraries: [] }, { schemaVersion: 1, libraries: report.results },
    { schemaVersion: 1, libraries: [...baseline.libraries, baseline.libraries[0]] }]) {
    assert.throws(() => prepare({ baseline: old }));
  }
});

test("dry run previews changes without changing the baseline or generated reports", t => {
  const files = fixture(t);
  const resultsPath = path.join(files.runDirectory, "results.json");
  writeFileSync(resultsPath, JSON.stringify({ results: report.results.map(row => ({ ...row, status: "pass" })) }));
  const before = [files.baselinePath, resultsPath, path.join(files.runDirectory, "REPORT.md")].map(file => readFileSync(file, "utf8"));
  const preview = updateBaseline({ ...files, dryRun: true });
  assert.deepEqual(preview.changes, ["Required unsupported: false -> true"]);
  assert.deepEqual([files.baselinePath, resultsPath, path.join(files.runDirectory, "REPORT.md")].map(file => readFileSync(file, "utf8")), before);
  assert.deepEqual(readdirSync(files.directory).sort(), ["baseline.json", "run"]);
});

test("accepted promotion replaces only the baseline and leaves no temporary file", t => {
  const files = fixture(t);
  const resultsPath = path.join(files.runDirectory, "results.json");
  const failedReport = JSON.stringify({ results: report.results.map(row => ({ ...row, status: "runtime_error" })) });
  writeFileSync(resultsPath, failedReport);
  const old = readFileSync(files.baselinePath, "utf8");
  assert.throws(() => updateBaseline(files), /Previously required libraries/);
  assert.equal(readFileSync(files.baselinePath, "utf8"), old);
  const updated = updateBaseline({ ...files, acceptedRegressions: ["working"] });
  assert.equal(readFileSync(files.baselinePath, "utf8"), formatBaseline(updated.baseline));
  assert.equal(readFileSync(resultsPath, "utf8"), failedReport);
  assert.equal(readFileSync(path.join(files.runDirectory, "REPORT.md"), "utf8"), "important report\n");
  assert.deepEqual(readdirSync(files.directory).sort(), ["baseline.json", "run"]);
});

test("malformed JSON and incomplete run metadata never modify the baseline", t => {
  const files = fixture(t);
  const before = readFileSync(files.baselinePath, "utf8");
  writeFileSync(path.join(files.runDirectory, "results.json"), "bad json");
  assert.throws(() => updateBaseline(files), SyntaxError);
  assert.equal(readFileSync(files.baselinePath, "utf8"), before);
  writeFileSync(path.join(files.runDirectory, "results.json"), JSON.stringify(report));
  writeFileSync(path.join(files.runDirectory, "run.json"), JSON.stringify({ ...metadata, complete: false }));
  assert.throws(() => updateBaseline(files), /incomplete/);
  assert.equal(readFileSync(files.baselinePath, "utf8"), before);
});

test("CLI accepts one run directory and the documented flags, rejecting typos", () => {
  assert.deepEqual(parseArguments(["example", "--dry-run", "--accept-regressions=@scope/pkg,working"]), {
    runDirectory: path.resolve("example"), dryRun: true, acceptedRegressions: ["@scope/pkg", "working"],
  });
  for (const args of [[], ["--dry-run"], ["a", "b"], ["a", "--force"], ["a", "--dry-run", "--dry-run"]]) {
    assert.throws(() => parseArguments(args), /Usage:/);
  }
});
