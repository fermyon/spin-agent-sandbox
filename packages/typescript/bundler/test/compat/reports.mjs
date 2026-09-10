import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { lstatSync, mkdirSync, readFileSync, realpathSync, renameSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

// Resolve existing ancestors too: an output that does not yet exist can still be
// an alias of a protected path through a symlinked parent directory.
function canonicalPath(filename) {
  const absolute = path.resolve(filename);
  try { return realpathSync(absolute); }
  catch (error) {
    if (error.code !== "ENOENT") throw error;
    const parent = path.dirname(absolute);
    if (parent === absolute) throw error;
    return path.join(canonicalPath(parent), path.basename(absolute));
  }
}

function exists(filename) {
  try { lstatSync(filename); return true; }
  catch (error) { if (error.code === "ENOENT") return false; throw error; }
}

export function createOutputGuard({ repoRoot, baselinePath }) {
  // Fail closed when the tracked-file inventory cannot be read. Merely checking
  // the default report filename misses custom outputs and symlink aliases.
  const tracked = execFileSync("git", ["ls-files", "-z"], { cwd: repoRoot, encoding: "utf8" });
  const protectedPaths = new Set(tracked.split("\0").filter(Boolean).map((name) => canonicalPath(path.join(repoRoot, name))));
  protectedPaths.add(canonicalPath(baselinePath));
  const gitDirectory = canonicalPath(path.join(repoRoot, ".git"));
  return function assertOutput(filename, { exclusive = false } = {}) {
    const resolved = canonicalPath(filename);
    if (protectedPaths.has(resolved) || resolved === gitDirectory || resolved.startsWith(gitDirectory + path.sep)) {
      throw new Error(`Refusing to overwrite a tracked file or compatibility baseline: ${filename}`);
    }
    if (exclusive && exists(filename)) throw new Error(`Output already exists; choose a new filename: ${filename}`);
    return resolved;
  };
}

function gitMetadata(repoRoot) {
  try {
    return {
      gitCommit: execFileSync("git", ["rev-parse", "HEAD"], { cwd: repoRoot, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim(),
      gitDirty: Boolean(execFileSync("git", ["status", "--porcelain", "--untracked-files=normal"], { cwd: repoRoot, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim()),
    };
  } catch { return { gitCommit: null, gitDirty: null }; }
}

function atomicWrite(filename, contents, assertOutput) {
  assertOutput(filename);
  const temporary = `${filename}.${randomBytes(8).toString("hex")}.tmp`;
  try {
    writeFileSync(temporary, contents, { flag: "wx" });
    renameSync(temporary, filename);
  } finally { rmSync(temporary, { force: true }); }
}

export function createRunHistory({ outputDirectory, repoRoot, baselinePath, selectedCount, catalogCount }) {
  const assertOutput = createOutputGuard({ repoRoot, baselinePath });
  outputDirectory = path.resolve(outputDirectory);
  assertOutput(path.join(outputDirectory, "latest.json"));
  mkdirSync(outputDirectory, { recursive: true });
  const startedAt = new Date().toISOString();
  const id = `${startedAt.replace(/[:.]/g, "-")}-${randomBytes(6).toString("hex")}`;
  const runDirectory = path.join(outputDirectory, id);
  mkdirSync(runDirectory);
  const metadata = {
    schemaVersion: 1, id, startedAt, finishedAt: null,
    ...gitMetadata(repoRoot), complete: false, selectedCount, catalogCount,
  };
  let initialized = false;
  function write({ results, base, seconds, gate, complete = false, finishedAt = null }) {
    // run.json is the checkpoint's commit marker: consumers only accept complete
    // reports after the corresponding results and Markdown have been persisted.
    atomicWrite(path.join(runDirectory, "results.json"), JSON.stringify({ base, seconds, results }, null, 2) + "\n", assertOutput);
    atomicWrite(path.join(runDirectory, "REPORT.md"), formatReport(results), assertOutput);
    if (gate !== undefined) atomicWrite(path.join(runDirectory, "GATE.md"), gate, assertOutput);
    Object.assign(metadata, { complete, finishedAt });
    atomicWrite(path.join(runDirectory, "run.json"), JSON.stringify(metadata, null, 2) + "\n", assertOutput);
    if (!initialized) {
      // Only a starting run moves latest. Finishing an older concurrent run must
      // never move the pointer backwards.
      atomicWrite(path.join(outputDirectory, "latest.json"), JSON.stringify({ runDirectory: id }, null, 2) + "\n", assertOutput);
      initialized = true;
    }
  }
  function exportFile(sourceName, destination) {
    assertOutput(destination, { exclusive: true });
    mkdirSync(path.dirname(destination), { recursive: true });
    writeFileSync(destination, readFileSync(path.join(runDirectory, sourceName)), { flag: "wx" });
  }
  return { id, runDirectory, metadata, write, exportFile, assertOutput };
}

export function formatReport(results) {
  const order = ["pass", "wrong_output", "runtime_error", "compile_error", "transpile_err", "run_reject", "sandbox_crash", "bundle_error", "net_error"];
  const counts = {};
  for (const r of results) counts[r.status] = (counts[r.status] || 0) + 1;
  const lines = [
    "# Bundler → Sandbox compatibility sweep", "",
    `**${counts.pass || 0}/${results.length} libraries pass end-to-end** (bundle + run + expected output).`, "",
    "| outcome | count |", "|---|---|",
  ];
  for (const status of order) if (counts[status]) lines.push(`| \`${status}\` | ${counts[status]} |`);
  lines.push("", "## Results", "", "| library | version | category | outcome | fetches | modules | bytes | ms | detail |", "|---|---|---|---|--:|--:|--:|--:|---|");
  const rank = Object.fromEntries(order.map((status, index) => [status, index]));
  const sorted = [...results].sort((a, b) =>
    (rank[a.status] ?? 99) - (rank[b.status] ?? 99) || (a.category || "").localeCompare(b.category || "") || a.name.localeCompare(b.name));
  for (const row of sorted) {
    const stats = row.stats || {};
    const badge = row.status === "pass" ? "✅ pass" : row.status;
    lines.push(`| \`${escapePipes(row.name)}\` | ${escapePipes(row.version)} | ${escapePipes(row.category)} | ${badge} | ${stats.fetches ?? ""} | ${stats.modules ?? ""} | ${stats.bytes ?? ""} | ${stats.ms ?? ""} | ${escapePipes(row.detail)} |`);
  }
  return lines.join("\n") + "\n";
}

const escapePipes = (value) => String(value || "").replace(/\|/g, "\\|").replace(/[\r\n]/g, " ");
