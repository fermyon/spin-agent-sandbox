import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createOutputGuard, createRunHistory } from "./reports.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "../../../../..");

function temporary(t) {
  const directory = mkdtempSync(path.join(os.tmpdir(), "compat-reports-test-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  return directory;
}

function fixture(t, entries = [{ name: "working", version: "1", source: "OK", expect: "OK" }]) {
  const root = temporary(t);
  const catalog = path.join(root, "catalog.mjs");
  const baseline = path.join(root, "baseline.json");
  const mock = path.join(root, "mock.mjs");
  const output = path.join(root, "history");
  writeFileSync(catalog, `export default ${JSON.stringify(entries)};\n`);
  writeFileSync(baseline, JSON.stringify({ schemaVersion: 1, libraries: entries.map(({ name, version }) => ({ name, version, required: true })) }));
  // Exercise the real CLI and cancellation behavior without a Spin server or
  // registry. A hanging request keeps the child alive until the signal arrives.
  writeFileSync(mock, `
    globalThis.fetch = async (url, options) => {
      const body = JSON.parse(options.body);
      if (body.source === "NET_ERROR") throw new Error("offline fixture");
      if (body.source === "HANG") return new Promise(() => setInterval(() => {}, 1000));
      const response = String(url).endsWith("/bundle") ? { blob: body.source, stats: {} } : { stdout: body.code, error: null };
      return new Response(JSON.stringify(response), { headers: { "content-type": "application/json" } });
    };
  `);
  return { root, catalog, baseline, mock, output };
}

function startCli(t, files, flags = [], onOutput) {
  const child = spawn(process.execPath, ["--import", files.mock, path.join(HERE, "run.mjs"), files.catalog, `--baseline=${files.baseline}`, `--out-dir=${files.output}`, ...flags], {
    cwd: REPO_ROOT, env: process.env, stdio: ["ignore", "pipe", "pipe"],
  });
  t.after(() => { if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL"); });
  return new Promise((resolve, reject) => {
    let output = "";
    child.stdout.on("data", (chunk) => { output += chunk; onOutput?.(output, child); });
    child.stderr.on("data", (chunk) => { output += chunk; });
    child.on("error", reject);
    child.on("close", (code, signal) => resolve({ code, signal, output }));
  });
}

function currentRun(files) {
  const pointer = JSON.parse(readFileSync(path.join(files.output, "latest.json"), "utf8"));
  const directory = path.join(files.output, pointer.runDirectory);
  return {
    directory,
    metadata: JSON.parse(readFileSync(path.join(directory, "run.json"), "utf8")),
    results: JSON.parse(readFileSync(path.join(directory, "results.json"), "utf8")).results,
    gate: readFileSync(path.join(directory, "GATE.md"), "utf8"),
  };
}

test("successive CLI runs retain both reports and expose completion/provenance", async (t) => {
  const files = fixture(t);
  const first = await startCli(t, files, ["--gate"]);
  assert.equal(first.code, 0, first.output);
  const previous = currentRun(files);
  const previousBytes = readFileSync(path.join(previous.directory, "run.json"));
  const second = await startCli(t, files, ["--gate", "--report=none"]);
  assert.equal(second.code, 0, second.output);
  const latest = currentRun(files);
  assert.notEqual(latest.directory, previous.directory);
  assert.deepEqual(readFileSync(path.join(previous.directory, "run.json")), previousBytes);
  assert.equal(readdirSync(files.output).filter((name) => name !== "latest.json").length, 2);
  assert.equal(latest.metadata.complete, true);
  assert.equal(latest.metadata.selectedCount, 1);
  assert.equal(latest.metadata.catalogCount, 1);
  assert.match(latest.metadata.gitCommit, /^[a-f0-9]{40}$/);
  assert.equal(typeof latest.metadata.gitDirty, "boolean");
  assert.ok(Date.parse(latest.metadata.finishedAt) >= Date.parse(latest.metadata.startedAt));
  assert.match(readFileSync(path.join(latest.directory, "REPORT.md"), "utf8"), /1\/1 libraries pass/);
  assert.match(latest.gate, /gate: PASS/);
  assert.ok(second.output.includes(latest.directory));
});

test("a network failure preserves completed results and fails the gate", async (t) => {
  const files = fixture(t, [
    { name: "working", version: "1", source: "OK", expect: "OK" },
    { name: "offline", version: "1", source: "NET_ERROR", expect: "OK" },
  ]);
  const result = await startCli(t, files, ["--gate", "--conc=1"]);
  assert.equal(result.code, 1, result.output);
  const saved = currentRun(files);
  assert.equal(saved.metadata.complete, false);
  assert.ok(saved.metadata.finishedAt);
  assert.deepEqual(saved.results.map((row) => row.status), ["pass", "net_error"]);
  assert.match(saved.gate, /gate: FAIL/);
  assert.match(saved.gate, /did not complete/);
  assert.doesNotMatch(saved.gate, /partial checkpoint|Regression:/);
  assert.equal(saved.results[1].requests.bundle.length, 3);
  assert.ok(saved.results[1].requests.bundle.every(attempt => attempt.outcome === "network_error"));
});

test("request deadlines are configurable and invalid values fail before requests", async (t) => {
  const files = fixture(t);
  const result = await startCli(t, files, ["--gate", "--bundle-timeout-ms=1000", "--run-timeout-ms=2000"]);
  assert.equal(result.code, 0, result.output);
  const saved = currentRun(files);
  assert.equal(saved.results[0].requests.bundle[0].timeoutMs, 1000);
  assert.equal(saved.results[0].requests.run[0].timeoutMs, 2000);
  for (const flag of ["--bundle-timeout-ms", "--bundle-timeout-ms=0", "--run-timeout-ms=NaN", "--run-timeout-ms=2147483648"]) {
    const invalid = await startCli(t, files, [flag]);
    assert.equal(invalid.code, 1, invalid.output);
    assert.match(invalid.output, /must be an integer between/);
  }
});

test("SIGTERM preserves the partial checkpoint and exits with signal status", async (t) => {
  const files = fixture(t, [
    { name: "working", version: "1", source: "OK", expect: "OK" },
    { name: "pending", version: "1", source: "HANG", expect: "OK" },
  ]);
  let signalled = false;
  const result = await startCli(t, files, ["--gate", "--conc=1"], (output, child) => {
    if (!signalled && output.includes("PASS          working")) { signalled = true; child.kill("SIGTERM"); }
  });
  assert.equal(result.code, 143, result.output);
  const saved = currentRun(files);
  assert.equal(saved.metadata.complete, false);
  assert.deepEqual(saved.results.map((row) => row.name), ["working"]);
  assert.match(saved.gate, /interrupted by SIGTERM/);
});

test("exploratory subsets stay incomplete for baseline promotion", async (t) => {
  const files = fixture(t, [
    { name: "working", version: "1", source: "OK", expect: "OK" },
    { name: "other", version: "1", source: "OK", expect: "OK" },
  ]);
  const result = await startCli(t, files, ["--only=working"]);
  assert.equal(result.code, 0, result.output);
  const pointer = JSON.parse(readFileSync(path.join(files.output, "latest.json"), "utf8"));
  const metadata = JSON.parse(readFileSync(path.join(files.output, pointer.runDirectory, "run.json"), "utf8"));
  assert.equal(metadata.complete, false);
  assert.equal(metadata.selectedCount, 1);
  assert.equal(metadata.catalogCount, 2);
});

test("tracked files, custom baselines and their symlink aliases are protected in both modes", async (t) => {
  const files = fixture(t);
  const readme = path.join(REPO_ROOT, "README.md");
  const original = readFileSync(readme);
  symlinkSync(REPO_ROOT, path.join(files.root, "checkout"), "dir");
  symlinkSync(files.baseline, path.join(files.root, "policy-alias.json"));
  for (const gate of [[], ["--gate"]]) {
    for (const output of [readme, path.join(files.root, "checkout", "README.md"), files.baseline, path.join(files.root, "policy-alias.json")]) {
      const result = await startCli(t, files, [...gate, `--out=${output}`]);
      assert.equal(result.code, 1, result.output);
      assert.match(result.output, /Refusing to overwrite/);
    }
  }
  assert.deepEqual(readFileSync(readme), original);
});

test("explicit exports are exclusive and retain canonical history", async (t) => {
  const files = fixture(t);
  const exported = path.join(files.root, "extra", "results.json");
  const first = await startCli(t, files, ["--gate", `--out=${exported}`]);
  assert.equal(first.code, 0, first.output);
  const original = readFileSync(exported);
  assert.deepEqual(original, readFileSync(path.join(currentRun(files).directory, "results.json")));
  const second = await startCli(t, files, ["--gate", `--out=${exported}`]);
  assert.equal(second.code, 1, second.output);
  assert.match(second.output, /Output already exists/);
  assert.deepEqual(readFileSync(exported), original);
});

test("finishing an older run cannot retarget latest to older reports", (t) => {
  const files = fixture(t);
  const options = { outputDirectory: files.output, repoRoot: REPO_ROOT, baselinePath: files.baseline, selectedCount: 1, catalogCount: 1 };
  const first = createRunHistory(options);
  first.write({ results: [], base: "fixture", seconds: 0 });
  const second = createRunHistory(options);
  second.write({ results: [], base: "fixture", seconds: 0 });
  first.write({ results: [{ name: "working", status: "pass" }], base: "fixture", seconds: 1, complete: true, finishedAt: new Date().toISOString() });
  assert.equal(JSON.parse(readFileSync(path.join(files.output, "latest.json"), "utf8")).runDirectory, second.id);
});

test("history pointer aliases cannot overwrite tracked files", (t) => {
  const files = fixture(t);
  mkdirSync(files.output);
  symlinkSync(path.join(REPO_ROOT, "README.md"), path.join(files.output, "latest.json"));
  assert.throws(() => createRunHistory({ outputDirectory: files.output, repoRoot: REPO_ROOT, baselinePath: files.baseline, selectedCount: 1, catalogCount: 1 }), /Refusing to overwrite/);
});

test("uncommitted repositories report unknown provenance without losing reports", (t) => {
  const root = temporary(t);
  execFileSync("git", ["init", "--quiet"], { cwd: root });
  const baselinePath = path.join(root, "baseline.json");
  const history = createRunHistory({ outputDirectory: path.join(root, "history"), repoRoot: root, baselinePath, selectedCount: 1, catalogCount: 1 });
  history.write({ results: [], base: "fixture", seconds: 0 });
  assert.equal(history.metadata.gitCommit, null);
  assert.equal(history.metadata.gitDirty, null);
  const guard = createOutputGuard({ repoRoot: root, baselinePath });
  assert.throws(() => guard(path.join(root, ".git", "config")), /Refusing to overwrite/);
});
