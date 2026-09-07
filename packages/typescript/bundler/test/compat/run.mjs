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
//   transpile_err sandbox's sucrase pass rejected the blob                 (rare, blob is already CJS)
//   bundle_error  /bundle failed (esm.sh fetch, sucrase transpile, graph too large)
//   net_error     harness could not reach the server (after retries)
//
// Usage:
//   BUNDLER_BASE_URL=http://127.0.0.1:3000 node run.mjs [catalog.mjs] [--only=name1,name2] [--conc=3]
// Defaults: BASE=http://127.0.0.1:3000, catalog=./catalog.mjs, concurrency=3.
// Writes results.json and REPORT.md next to this file.

import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const BASE = process.env.BUNDLER_BASE_URL || "http://127.0.0.1:3000";
const argv = process.argv.slice(2);
const posArgs = argv.filter((a) => !a.startsWith("--"));
const flags = Object.fromEntries(argv.filter((a) => a.startsWith("--")).map((a) => {
  const [k, v] = a.replace(/^--/, "").split("=");
  return [k, v ?? true];
}));
const CATALOG = posArgs[0] ? path.resolve(process.cwd(), posArgs[0]) : path.join(HERE, "catalog.mjs");
const ONLY = flags.only ? new Set(String(flags.only).split(",")) : null;
const CONC = Number(flags.conc || 3);
const OUT = flags.out ? path.resolve(process.cwd(), String(flags.out)) : path.join(HERE, "results.json");
const REPORT = flags.report === "none" ? null
  : flags.report ? path.resolve(process.cwd(), String(flags.report))
  : path.join(HERE, "REPORT.md");
const REQ_TIMEOUT_MS = 45000;

async function postJson(url, body, tries = 3) {
  let lastErr;
  for (let attempt = 1; attempt <= tries; attempt++) {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), REQ_TIMEOUT_MS);
    try {
      const r = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
        signal: ctl.signal,
      });
      clearTimeout(timer);
      const ct = r.headers.get("content-type") || "";
      const isJson = ct.includes("application/json");
      const payload = isJson ? await r.json() : await r.text();
      return { status: r.status, isJson, contentType: ct, payload };
    } catch (e) {
      clearTimeout(timer);
      lastErr = e;
      if (attempt < tries) await new Promise((res) => setTimeout(res, 500 * attempt));
    }
  }
  return { netError: String((lastErr && lastErr.message) || lastErr) };
}

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
  // guardBody() turns an uncaught throw into a THREW: marker (with the real message).
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
  const deps = { ...(entry.version ? { [entry.name]: entry.version } : {}), ...(entry.extraDeps || {}) };
  const bundleRes = await postJson(`${BASE}/bundle`, {
    source: entry.source,
    packageJson: { dependencies: deps },
  });
  let runRes = { payload: null };
  if (!bundleRes.netError && bundleRes.status === 200 && bundleRes.payload && bundleRes.payload.blob) {
    runRes = await postJson(`${BASE}/ts/run`, {
      code: wrapBlob(bundleRes.payload.blob),
      sandboxId: "compat-" + entry.name.replace(/[^a-z0-9]/gi, "_"),
      input: {},
    });
  }
  return classify(entry, bundleRes, runRes);
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

function report(results) {
  const order = ["pass", "wrong_output", "runtime_error", "compile_error", "transpile_err", "run_reject", "sandbox_crash", "bundle_error", "net_error"];
  const counts = {};
  for (const r of results) counts[r.status] = (counts[r.status] || 0) + 1;
  const total = results.length;
  const passed = counts.pass || 0;

  const lines = [];
  lines.push(`# Bundler → Sandbox compatibility sweep`);
  lines.push("");
  lines.push(`**${passed}/${total} libraries pass end-to-end** (bundle + run + expected output).`);
  lines.push("");
  lines.push(`| outcome | count |`);
  lines.push(`|---|---|`);
  for (const s of order) if (counts[s]) lines.push(`| \`${s}\` | ${counts[s]} |`);
  lines.push("");
  lines.push(`## Results`);
  lines.push("");
  lines.push(`| library | version | category | outcome | fetches | modules | bytes | ms | detail |`);
  lines.push(`|---|---|---|---|--:|--:|--:|--:|---|`);
  const rank = Object.fromEntries(order.map((s, i) => [s, i]));
  const sorted = [...results].sort((a, b) =>
    (rank[a.status] ?? 99) - (rank[b.status] ?? 99) || a.category.localeCompare(b.category) || a.name.localeCompare(b.name));
  for (const r of sorted) {
    const s = r.stats || {};
    const badge = r.status === "pass" ? "✅ pass" : r.status;
    lines.push(`| \`${r.name}\` | ${r.version} | ${r.category} | ${badge} | ${s.fetches ?? ""} | ${s.modules ?? ""} | ${s.bytes ?? ""} | ${s.ms ?? ""} | ${escapePipes(r.detail)} |`);
  }
  lines.push("");
  return lines.join("\n");
}
const escapePipes = (s) => String(s || "").replace(/\|/g, "\\|").replace(/\n/g, " ");

async function main() {
  let catalog = (await import(pathToFileURL(CATALOG).href)).default;
  if (ONLY) catalog = catalog.filter((e) => ONLY.has(e.name));
  console.log(`Running ${catalog.length} cases against ${BASE} (concurrency ${CONC}) ...`);
  const t0 = Date.now();
  let done = 0;
  const results = await pool(catalog, CONC, async (entry) => {
    const rec = await runOne(entry);
    done++;
    const badge = rec.status === "pass" ? "PASS" : rec.status.toUpperCase();
    console.log(`  [${String(done).padStart(2)}/${catalog.length}] ${badge.padEnd(13)} ${entry.name}${rec.detail ? ": " + firstLine(rec.detail) : ""}`);
    return rec;
  });
  const secs = ((Date.now() - t0) / 1000).toFixed(1);
  writeFileSync(OUT, JSON.stringify({ base: BASE, seconds: Number(secs), results }, null, 2) + "\n");
  if (REPORT) writeFileSync(REPORT, report(results));
  const passed = results.filter((r) => r.status === "pass").length;
  console.log(`\nDone in ${secs}s. ${passed}/${results.length} pass. Wrote ${path.basename(OUT)}${REPORT ? " and " + path.basename(REPORT) : ""}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
