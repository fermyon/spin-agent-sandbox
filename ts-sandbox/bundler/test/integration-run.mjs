// Orchestrates the integration tests against real Wasm components:
//   1. ensure ts-sandbox.wasm and bundler.wasm exist (build the two if missing)
//   2. start `spin up`
//   3. run integration.test.mjs against it
//   4. tear down
//
//   npm run test:integration
//
// Requires the `spin` CLI on PATH. Honors PORT (default 3000). If BUNDLER_BASE_URL is
// already set, it skips starting a server and just runs the tests against that URL.

import { spawn, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const WASM_DIR = path.join(HERE, "..", "..", ".."); // wasm/ (this file is at wasm/ts-sandbox/bundler/test/)
const BUILD_MANIFEST = path.join(WASM_DIR, "spin.toml"); // has the [build] commands
const RUN_MANIFEST = path.join(HERE, "spin.test.toml");  // only ts-sandbox + bundler (no py-sandbox)
const TESTS = path.join(HERE, "integration.test.mjs");
const PORT = process.env.PORT || "3000";

function runTests(baseUrl) {
  const res = spawnSync(process.execPath, ["--test", TESTS], {
    stdio: "inherit",
    env: { ...process.env, BUNDLER_BASE_URL: baseUrl },
  });
  return res.status ?? 1;
}

// If a server URL is provided, just run against it.
if (process.env.BUNDLER_BASE_URL) {
  process.exit(runTests(process.env.BUNDLER_BASE_URL));
}

// Need `spin`.
if (spawnSync("spin", ["--version"], { stdio: "ignore" }).status !== 0) {
  console.error("spin CLI not found on PATH. Install it (https://spinframework.dev) or set BUNDLER_BASE_URL.");
  process.exit(1);
}

// Build the two components we need if their artifacts are missing.
const artifacts = [
  path.join(WASM_DIR, "ts-sandbox", "dist", "ts-sandbox.wasm"),
  path.join(WASM_DIR, "ts-sandbox", "bundler", "dist", "bundler.wasm"),
];
if (!artifacts.every(existsSync)) {
  console.log("Building components (ts-sandbox, bundler) ...");
  const b = spawnSync("spin", ["build", "-f", BUILD_MANIFEST, "-c", "ts-sandbox", "-c", "bundler"], { stdio: "inherit" });
  if (b.status !== 0) { console.error("spin build failed"); process.exit(b.status ?? 1); }
}

// Start the server (trimmed manifest: no py-sandbox) and wait until it is serving.
const baseUrl = `http://127.0.0.1:${PORT}`;
console.log(`Starting spin up on ${baseUrl} ...`);
const server = spawn("spin", ["up", "-f", RUN_MANIFEST, "--listen", `127.0.0.1:${PORT}`], { stdio: ["ignore", "pipe", "pipe"] });

let exitCode = 1;
const cleanup = () => { try { server.kill("SIGTERM"); } catch {} };
process.on("exit", cleanup);
process.on("SIGINT", () => { cleanup(); process.exit(130); });

const ready = new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error("timed out waiting for `spin up` to serve")), 120000);
  const onData = (buf) => {
    const s = buf.toString();
    process.stdout.write(s);
    if (s.includes("Serving http")) { clearTimeout(timer); resolve(); }
  };
  server.stdout.on("data", onData);
  server.stderr.on("data", (b) => process.stderr.write(b.toString()));
  server.on("exit", (code) => { clearTimeout(timer); reject(new Error(`spin up exited early (code ${code})`)); });
});

try {
  await ready;
  exitCode = runTests(baseUrl);
} catch (e) {
  console.error(String(e && e.message ? e.message : e));
  exitCode = 1;
} finally {
  cleanup();
}
process.exit(exitCode);
