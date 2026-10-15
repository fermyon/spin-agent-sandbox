// Compatibility sweep harness for the "generate code + deps -> bundler -> sandbox" pipeline.
//
// For each catalog entry it chains the two REAL Wasm components over HTTP:
//   POST /bundle  {source, packageJson:{dependencies}}  -> { blob, stats } | { error, message }
//   POST /ts/run  {code: blob, sandboxId, input:{}}      -> { stdout, error } | 400 {error,message} | handler Response
// and classifies the outcome, attributing each failure to the surface that produced it:
//   pass          bundle ok, run ok, stdout contains the expected marker
//   wrong_output  bundle ok, run ok (error null) but marker missing        (behavioral diff / bad snippet)
//   runtime_error bundle ok, sandbox threw at run time                     (usually a Node-builtin shim gap)
//   compile_error sandbox engine (StarlingMonkey) rejected the blob        (engine capability gap, e.g. \p{} regex)
//   transpile_err sandbox returned "transpile_error"                      (not emitted by the current guard)
//   bundle_error  /bundle failed (esm.sh fetch, sucrase transpile, graph too large)
//   net_error     harness could not reach the server (after retries)
//
// Usage:
//   BUNDLER_BASE_URL=http://127.0.0.1:3000 node run.mjs [catalog.mjs] [--only=name1,name2] [--conc=3]
// Defaults: BASE=http://127.0.0.1:3000, catalog=./catalog.mjs, concurrency=3.
// Preserves each run in a unique directory under COMPAT_OUTPUT_DIR or repo/test-results/bundler-compat.
// Add --gate to require all baseline passes and complete catalog coverage.

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { checkCompatibility, gateReport, parseBaseline } from "./gate.mjs";
import { createOutputGuard, createRunHistory } from "./reports.mjs";
import { postJson } from "./http.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const BASE = process.env.BUNDLER_BASE_URL || "http://127.0.0.1:3000";
const argv = process.argv.slice(2);
const posArgs = argv.filter((a) => !a.startsWith("--"));
const flags = Object.fromEntries(argv.filter((a) => a.startsWith("--")).map((a) => {
  const value = a.replace(/^--/, "");
  const separator = value.indexOf("=");
  return separator < 0 ? [value, true] : [value.slice(0, separator), value.slice(separator + 1)];
}));
const CATALOG = posArgs[0] ? path.resolve(process.cwd(), posArgs[0]) : path.join(HERE, "catalog.mjs");
const ONLY = flags.only ? new Set(String(flags.only).split(",")) : null;
const CONC = Number(flags.conc || 3);
const REPO_ROOT = path.resolve(HERE, "../../../../..");
const OUTPUT_DIR = path.resolve(String(flags["out-dir"] || process.env.COMPAT_OUTPUT_DIR || path.join(REPO_ROOT, "test-results/bundler-compat")));
// Optional additional exports never replace the canonical report history.
const OUT = flags.out ? path.resolve(String(flags.out)) : null;
const REPORT = flags.report && flags.report !== "none" ? path.resolve(String(flags.report)) : null;
const GATE = Boolean(flags.gate);
const BASELINE = flags.baseline ? path.resolve(String(flags.baseline)) : path.join(HERE, "baseline.json");
const BUNDLE_TIMEOUT_MS = Number(flags["bundle-timeout-ms"] ?? process.env.COMPAT_BUNDLE_TIMEOUT_MS ?? 120000);
const RUN_TIMEOUT_MS = Number(flags["run-timeout-ms"] ?? process.env.COMPAT_RUN_TIMEOUT_MS ?? 45000);

function classify(entry, bundleRes, runRes) {
  const rec = {
    name: entry.name,
    version: entry.version || "",
    category: entry.category || "",
    note: entry.note || "",
    status: "",
    detail: "",
    stats: null,
    stdout: "",
  };

  // --- bundle surface ---
  if (bundleRes.netError) { rec.status = "net_error"; rec.detail = "bundle: " + bundleRes.netError; return rec; }
  const b = bundleRes.payload;
  if (bundleRes.status !== 200 || (b && b.error)) {
    rec.status = "bundle_error";
    rec.detail = String((b && (b.message || b.error)) || `HTTP ${bundleRes.status}`);
    return rec;
  }
  rec.stats = b.stats || null;
  if (!b.blob) { rec.status = "bundle_error"; rec.detail = "no blob in response"; return rec; }

  // --- run surface ---
  if (runRes.netError) { rec.status = "net_error"; rec.detail = "run: " + runRes.netError; return rec; }
  const r = runRes.payload;

  // 400/500 envelope: compile_error / transpile_error / handler_error / validation
  if (runRes.status >= 400 && runRes.isJson && r && r.error) {
    rec.status = r.error === "compile_error" ? "compile_error"
              : r.error === "transpile_error" ? "transpile_err"
              : r.error === "handler_error" ? "runtime_error"
              : "run_reject";
    rec.detail = firstLine(r.message || r.error);
    return rec;
  }

  // A 5xx with no JSON envelope means the sandbox component itself crashed/trapped (e.g. OOM on
  // a very large blob) rather than returning a handler Response; classify it as a crash.
  if (runRes.status >= 500 && (!runRes.isJson || !r || String(r).trim() === "")) {
    rec.status = "sandbox_crash";
    rec.detail = `sandbox returned HTTP ${runRes.status} with no body (blob too large/complex to run)`;
    return rec;
  }

  // Handler-shape response (non-JSON or JSON without stdout field): treat body as output.
  if (!runRes.isJson || (r && typeof r === "object" && !("stdout" in r) && !("error" in r))) {
    const body = typeof r === "string" ? r : JSON.stringify(r);
    rec.stdout = body;
    rec.status = matches(entry, body) ? "pass" : "wrong_output";
    rec.detail = rec.status === "pass" ? "" : `handler body: ${firstLine(body)}`;
    return rec;
  }

  // Main-shape envelope { stdout, stderr, error }
  rec.stdout = (r && r.stdout) || "";
  if (r && r.error) {
    rec.status = "runtime_error";
    rec.detail = firstLine(r.error);
    return rec;
  }
  // wrapBlob() turns an uncaught throw into a THREW: marker (with the real message).
  const threw = rec.stdout.split("\n").find((l) => l.startsWith("THREW:"));
  if (threw) { rec.status = "runtime_error"; rec.detail = threw; return rec; }
  if (matches(entry, rec.stdout)) { rec.status = "pass"; return rec; }
  rec.status = "wrong_output";
  rec.detail = `stdout: ${firstLine(rec.stdout)}` + (r && r.stderr ? ` | stderr: ${firstLine(r.stderr)}` : "");
  return rec;
}

function matches(entry, out) {
  if (Array.isArray(entry.expect)) return entry.expect.every((s) => out.includes(s));
  if (entry.expect) return out.includes(entry.expect);
  return true; // no expectation -> "ran without error" is a pass
}
const firstLine = (s) => String(s || "").split("\n")[0].slice(0, 300);

// Wrap the user IIFE inside the bundler's blob in try/catch so any throw (at module load time in a
// dependency's factory, or in the user body, sync or async) prints its real message. (SpiderMonkey's
// error.stack omits the message, so an uncaught throw shows only frames.) The bundler emits the user
// code as exactly one `await (async function(module, exports, require){...})(...)` at the end of the
// blob; we wrap that whole awaited expression, so `await` inside the try catches async rejections too.
// Compile errors still fail at parse (before this runs) and are classified separately.
const IIFE_MARK = "await (async function(module, exports, require){";
function wrapBlob(blob) {
  const idx = blob.lastIndexOf(IIFE_MARK);
  if (idx < 0) return blob;
  return blob.slice(0, idx) + "try {\n" + blob.slice(idx) +
    "\n} catch (e) { console.log('THREW:' + (e && e.name ? e.name : 'Error') + ': ' + (e && e.message ? e.message : String(e))); }";
}

async function runOne(entry) {
  const requestOptions = (stage, timeoutMs) => ({
    timeoutMs,
    onRetry: ({ detail, nextAttempt, delayMs }) => {
      console.log(`  RETRY ${entry.name} ${stage}: ${detail}; attempt ${nextAttempt}/3 in ${delayMs}ms`);
    },
  });
  const deps = { ...(entry.version ? { [entry.name]: entry.version } : {}), ...(entry.extraDeps || {}) };
  const bundleRes = await postJson(`${BASE}/bundle`, {
    source: entry.source,
    packageJson: { dependencies: deps },
  }, requestOptions("bundle", BUNDLE_TIMEOUT_MS));
  let runRes = { payload: null };
  if (!bundleRes.netError && bundleRes.status === 200 && bundleRes.payload && bundleRes.payload.blob) {
    runRes = await postJson(`${BASE}/ts/run`, {
      code: wrapBlob(bundleRes.payload.blob),
      sandboxId: "compat-" + entry.name.replace(/[^a-z0-9]/gi, "_"),
      input: {},
    }, requestOptions("run", RUN_TIMEOUT_MS));
  }
  return {
    ...classify(entry, bundleRes, runRes),
    requests: { bundle: bundleRes.attempts, run: runRes.attempts || [] },
  };
}

async function pool(items, n, fn) {
  const out = new Array(items.length);
  let i = 0;
  async function worker() {
    while (i < items.length) {
      const idx = i++;
      out[idx] = await fn(items[idx], idx);
    }
  }
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, worker));
  return out;
}

async function main() {
  if (!Number.isInteger(CONC) || CONC < 1) throw new Error("--conc must be a positive integer");
  for (const [name, value] of [["bundle-timeout-ms", BUNDLE_TIMEOUT_MS], ["run-timeout-ms", RUN_TIMEOUT_MS]]) {
    if (flags[name] === true || !Number.isInteger(value) || value < 1 || value > 2147483647) {
      throw new Error(`--${name} must be an integer between 1 and 2147483647 milliseconds`);
    }
  }
  if (GATE && ONLY) throw new Error("--gate requires the full catalog; --only is not allowed");
  // Apply the same safety rules to exploratory runs and gated runs before any
  // requests are sent. Exports must be new files, even outside the checkout.
  const assertOutput = createOutputGuard({ repoRoot: REPO_ROOT, baselinePath: BASELINE });
  const exports = [OUT, REPORT].filter(Boolean).map((filename) => assertOutput(filename, { exclusive: true }));
  if (new Set(exports).size !== exports.length) throw new Error("--out and --report must use different filenames");
  const fullCatalog = (await import(pathToFileURL(CATALOG).href)).default;
  if (!Array.isArray(fullCatalog) || !fullCatalog.length) throw new Error("Catalog must be a non-empty array");
  const catalog = ONLY ? fullCatalog.filter((entry) => ONLY.has(entry.name)) : fullCatalog;
  if (!catalog.length) throw new Error("No catalog entries selected");
  const history = createRunHistory({ outputDirectory: OUTPUT_DIR, repoRoot: REPO_ROOT, baselinePath: BASELINE, selectedCount: catalog.length, catalogCount: fullCatalog.length });
  console.log(`Reports: ${history.runDirectory}`);
  const t0 = Date.now();
  const completed = new Map();
  let baseline = [];
  let finished = false;
  let failure = null;
  const results = () => [...completed].sort(([a], [b]) => a - b).map(([, row]) => row);
  const seconds = () => Number(((Date.now() - t0) / 1000).toFixed(1));
  function checkpoint(final = false) {
    const rows = results();
    const covered = finished && catalog.length === fullCatalog.length && rows.length === catalog.length;
    const complete = covered && !rows.some((row) => row.status === "net_error");
    let gate;
    if (GATE) {
      const checked = checkCompatibility(fullCatalog, baseline, rows);
      if (!covered) checked.errors.push("Sweep did not complete; results are a partial checkpoint.");
      if (failure) checked.errors.push(failure);
      checked.ok = checked.ok && complete && !failure;
      gate = gateReport(checked);
    }
    history.write({ results: rows, base: BASE, seconds: seconds(), gate, complete, finishedAt: final ? new Date().toISOString() : null });
    return gate;
  }
  function interrupt(signal) {
    failure = `Sweep interrupted by ${signal}.`;
    try { checkpoint(true); }
    catch (error) { console.error(`Could not save final checkpoint: ${error.message}`); }
    console.error(`${failure} Reports: ${history.runDirectory}`);
    process.exit(signal === "SIGINT" ? 130 : 143);
  }
  const onInterrupt = () => interrupt("SIGINT");
  const onTerminate = () => interrupt("SIGTERM");
  process.on("SIGINT", onInterrupt);
  process.on("SIGTERM", onTerminate);
  try {
    checkpoint();
    if (GATE) {
      const policy = JSON.parse(readFileSync(BASELINE, "utf8"));
      baseline = parseBaseline(policy);
      // Validate policy coverage before spending time on a live sweep. Synthetic
      // successes validate every required flag, name and version without guessing
      // outcomes for libraries that are allowed to fail.
      const validation = checkCompatibility(fullCatalog, baseline, fullCatalog.map((entry) => ({ ...entry, status: "pass" })));
      if (!validation.ok) throw new Error(gateReport(validation));
      checkpoint();
    }
    console.log(`Running ${catalog.length} cases against ${BASE} (concurrency ${CONC}) ...`);
    console.log(`Request timeouts: bundle ${BUNDLE_TIMEOUT_MS}ms, run ${RUN_TIMEOUT_MS}ms; up to 3 transport attempts each.`);
    let done = 0;
    await pool(catalog, CONC, async (entry, index) => {
      const rec = await runOne(entry);
      completed.set(index, rec);
      done++;
      checkpoint();
      const badge = rec.status === "pass" ? "PASS" : rec.status.toUpperCase();
      console.log(`  [${String(done).padStart(2)}/${catalog.length}] ${badge.padEnd(13)} ${entry.name}${rec.detail ? ": " + firstLine(rec.detail) : ""}`);
      return rec;
    });
    finished = true;
    const summary = checkpoint(true);
    if (OUT) history.exportFile("results.json", OUT);
    if (REPORT) history.exportFile("REPORT.md", REPORT);
    const rows = results();
    const passed = rows.filter((row) => row.status === "pass").length;
    console.log(`\nDone in ${seconds()}s. ${passed}/${rows.length} pass. Reports: ${history.runDirectory}`);
    if (summary) {
      console.log(summary);
      if (!checkCompatibility(fullCatalog, baseline, rows).ok || !history.metadata.complete) process.exitCode = 1;
    }
  } catch (error) {
    failure = error.message;
    checkpoint(true);
    throw error;
  } finally {
    process.off("SIGINT", onInterrupt);
    process.off("SIGTERM", onTerminate);
  }
}

main().catch((error) => { console.error(error); process.exit(1); });
