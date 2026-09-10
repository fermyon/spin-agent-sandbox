// Explicitly promote a complete, reviewed run into the small CI requirement file.
// Generated reports remain in the run directory and are never copied into Git.
import { randomUUID } from "node:crypto";
import { readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import catalog from "./catalog.mjs";
import { checkCompatibility, parseBaseline } from "./gate.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_BASELINE = path.join(HERE, "baseline.json");
const USAGE = "Usage: npm run compat:update-baseline -- <run-directory> [--dry-run] [--accept-regressions=name1,name2]";

export function formatBaseline(baseline) {
  return '{\n  "schemaVersion": 1,\n  "libraries": [\n' +
    baseline.libraries.map(row => `    ${JSON.stringify(row)}`).join(",\n") + "\n  ]\n}\n";
}

export function prepareBaselineUpdate(entries, previousDocument, metadata, report, acceptedRegressions = []) {
  const previous = parseBaseline(previousDocument);
  if (!metadata || metadata.schemaVersion !== 1 || metadata.complete !== true) {
    throw new Error("Run must have schemaVersion 1 and complete: true in run.json; interrupted or incomplete runs cannot become a baseline");
  }
  // A temporary all-optional floor validates coverage and statuses independently of
  // old catalog additions, removals, and version changes being reviewed here.
  const optional = Array.isArray(entries) ? entries.map(row => ({ ...row, required: false })) : [];
  const checked = checkCompatibility(entries, optional, report?.results);
  if (checked.errors.length) throw new Error(checked.errors.join("\n"));
  for (const key of ["selectedCount", "catalogCount"]) {
    if (metadata[key] !== checked.total) {
      throw new Error(`Run ${key} does not match the complete current catalog (${checked.total})`);
    }
  }
  if (!Array.isArray(acceptedRegressions) || acceptedRegressions.some(name => typeof name !== "string" || !name.trim() || name !== name.trim()) ||
      new Set(acceptedRegressions).size !== acceptedRegressions.length) {
    throw new Error("Accepted regressions must be distinct, non-empty library names");
  }
  const actual = new Map(report.results.map(row => [row.name, row]));
  const old = new Map(previous.map(row => [row.name, row]));
  const next = entries.map(({ name, version }) => ({ name, version, required: actual.get(name).status === "pass" }));
  const regressions = next.filter(row => old.get(row.name)?.required && !row.required).map(row => row.name);
  const accepted = new Set(acceptedRegressions);
  const unused = acceptedRegressions.filter(name => !regressions.includes(name));
  if (unused.length) throw new Error(`Accepted names are not regressions: ${unused.join(", ")}`);
  const unaccepted = regressions.filter(name => !accepted.has(name));
  if (unaccepted.length) {
    throw new Error(`Previously required libraries no longer pass: ${unaccepted.join(", ")}. Review the run, then acknowledge exactly these regressions with --accept-regressions=${unaccepted.join(",")}`);
  }
  const changes = [];
  for (const row of next) {
    const before = old.get(row.name);
    if (!before) changes.push(`Added ${row.name}@${row.version || "(built-in)"}: required=${row.required}`);
    else {
      if (row.version !== before.version) changes.push(`Version ${row.name}: ${JSON.stringify(before.version)} -> ${JSON.stringify(row.version)}`);
      if (row.required !== before.required) changes.push(`Required ${row.name}: ${before.required} -> ${row.required}`);
    }
  }
  const names = new Set(next.map(row => row.name));
  for (const row of previous) {
    if (!names.has(row.name)) changes.push(`Removed ${row.name}@${row.version || "(built-in)"}: required=${row.required}`);
  }
  return { baseline: { schemaVersion: 1, libraries: next }, changes, regressions };
}

export function updateBaseline({ runDirectory, entries = catalog, baselinePath = DEFAULT_BASELINE, dryRun = false, acceptedRegressions = [] }) {
  const readJson = file => JSON.parse(readFileSync(file, "utf8"));
  const update = prepareBaselineUpdate(entries, readJson(baselinePath), readJson(path.join(runDirectory, "run.json")),
    readJson(path.join(runDirectory, "results.json")), acceptedRegressions);
  if (!dryRun && update.changes.length) {
    const temporary = `${baselinePath}.${randomUUID()}.tmp`;
    try {
      writeFileSync(temporary, formatBaseline(update.baseline), { flag: "wx" });
      renameSync(temporary, baselinePath);
    } finally {
      rmSync(temporary, { force: true });
    }
  }
  return update;
}

export function parseArguments(args) {
  let runDirectory;
  let dryRun = false;
  let acceptedRegressions = [];
  let hasAccepted = false;
  for (const arg of args) {
    if (arg === "--dry-run" && !dryRun) dryRun = true;
    else if (arg.startsWith("--accept-regressions=") && !hasAccepted) {
      hasAccepted = true;
      acceptedRegressions = arg.slice("--accept-regressions=".length).split(",");
    } else if (arg.startsWith("--") || runDirectory) throw new Error(`Unexpected argument ${arg}\n${USAGE}`);
    else runDirectory = path.resolve(arg);
  }
  if (!runDirectory) throw new Error(USAGE);
  return { runDirectory, dryRun, acceptedRegressions };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const options = parseArguments(process.argv.slice(2));
    const update = updateBaseline(options);
    console.log(update.changes.length ? update.changes.join("\n") : "No baseline changes.");
    const required = update.baseline.libraries.filter(row => row.required).length;
    console.log(`${required}/${update.baseline.libraries.length} libraries required to pass.`);
    console.log(options.dryRun ? "Dry run: baseline unchanged." : `Baseline: ${DEFAULT_BASELINE}`);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
