// The checked-in requirements are a per-library floor, not a percentage threshold:
// improvements elsewhere must never mask a previously working library regressing.
export const STATUSES = new Set([
  "pass", "wrong_output", "runtime_error", "compile_error", "transpile_err",
  "run_reject", "sandbox_crash", "bundle_error", "net_error",
]);

function indexLibraries(rows, label, kind, errors) {
  const indexed = new Map();
  if (!Array.isArray(rows) || rows.length === 0) {
    errors.push(`${label} must be a non-empty array`);
    return indexed;
  }
  for (const row of rows) {
    if (!row || typeof row.name !== "string" || !row.name.trim() ||
        row.name !== row.name.trim() || typeof row.version !== "string") {
      errors.push(`${label} contains an invalid library name or version`);
      continue;
    }
    if (indexed.has(row.name)) errors.push(`${label} contains duplicate library ${row.name}`);
    indexed.set(row.name, row);
    if (kind === "baseline" && typeof row.required !== "boolean") {
      errors.push(`${label}: ${row.name} must have a boolean required value`);
    }
    if (kind === "results" && !STATUSES.has(row.status)) {
      errors.push(`${label}: ${row.name} has invalid status ${JSON.stringify(row.status)}`);
    }
    if (kind === "results" && row.status === "net_error") {
      errors.push(`${label}: ${row.name} did not complete (net_error)`);
    }
  }
  return indexed;
}

export function parseBaseline(document) {
  if (!document || document.schemaVersion !== 1) {
    throw new Error("Baseline must have schemaVersion 1");
  }
  const errors = [];
  indexLibraries(document.libraries, "Baseline", "baseline", errors);
  if (errors.length) throw new Error(errors.join("\n"));
  return document.libraries;
}

export function checkCompatibility(catalog, baseline, results) {
  const errors = [];
  const regressions = [];
  const improvements = [];

  const cases = indexLibraries(catalog, "Catalog", "catalog", errors);
  const expected = indexLibraries(baseline, "Baseline", "baseline", errors);
  const actual = indexLibraries(results, "Results", "results", errors);
  for (const [label, rows] of [["Baseline", expected], ["Results", actual]]) {
    for (const [name, entry] of cases) {
      const row = rows.get(name);
      if (!row) errors.push(`${label} is missing ${name}`);
      else if ((row.version || "") !== (entry.version || "")) {
        errors.push(`${label}: ${name} version ${JSON.stringify(row.version || "")} differs from catalog ${JSON.stringify(entry.version || "")}`);
      }
    }
    for (const name of rows.keys()) {
      if (!cases.has(name)) errors.push(`${label} contains ${name}, which is missing from the catalog`);
    }
  }
  for (const [name, previous] of expected) {
    const current = actual.get(name);
    // A transport failure is inconclusive, not evidence of a compatibility
    // regression. It still fails the gate via the completion errors above.
    if (!current || current.status === "net_error") continue;
    if (previous.required === true && current.status !== "pass") {
      regressions.push({ name, status: current.status, detail: current.detail || "" });
    } else if (previous.required === false && current.status === "pass") {
      improvements.push(name);
    }
  }
  return {
    ok: errors.length === 0 && regressions.length === 0,
    errors,
    regressions,
    improvements,
    total: cases.size,
    requiredPasses: [...expected.values()].filter((row) => row.required === true).length,
    passed: [...actual.values()].filter((row) => row.status === "pass").length,
  };
}

export function gateReport(gate) {
  const lines = [
    `# Bundler compatibility gate: ${gate.ok ? "PASS" : "FAIL"}`,
    "",
    `${gate.passed}/${gate.total} libraries pass; ${gate.requiredPasses} baseline passes required.`,
    `${gate.regressions.length} regressions, ${gate.improvements.length} improvements, ${gate.errors.length} coverage/data errors.`,
    "",
  ];
  for (const error of gate.errors) lines.push(`- ${oneLine(error)}`);
  for (const row of gate.regressions) {
    lines.push(`- Regression: ${oneLine(row.name)} → ${oneLine(row.status)}${row.detail ? `: ${oneLine(row.detail)}` : ""}`);
  }
  if (gate.improvements.length) lines.push(`- Newly passing: ${gate.improvements.map(oneLine).join(", ")}`);
  return lines.join("\n") + "\n";
}

const oneLine = (value) => String(value).replace(/[\r\n]/g, " ");
