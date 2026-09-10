// Orchestrates the integration tests against real Wasm components:
//   1. ensure the composed ts-sandbox.wasm and bundler.wasm exist (build if missing)
//   2. start `spin up`
//   3. run integration.test.mjs and, with --compat, the full compatibility gate
//   4. tear down
//
//   npm run test:integration
//   npm run test:ci             # integration + compatibility, sharing one server
//
// Requires the `spin` CLI on PATH. Honors PORT (default 3000). If BUNDLER_BASE_URL is
// already set, it skips starting a server and just runs the tests against that URL.

import { spawn, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const WASM_DIR = path.join(HERE, "..", "..", "..", ".."); // repo root (this file is at packages/typescript/bundler/test/)
const BUILD_MANIFEST = path.join(WASM_DIR, "spin.toml"); // has the [build] commands
const RUN_MANIFEST = path.join(HERE, "spin.test.toml");  // only ts-sandbox + bundler (no py-sandbox)
const TESTS = path.join(HERE, "integration.test.mjs");
const PORT = process.env.PORT || "3000";
const WITH_COMPAT = process.argv.includes("--compat");
const PROCESS_GROUPS = process.platform !== "win32";
let activeSuite = null;
let server = null;
let cancelled = 0;
let shutdownPromise;

function signalChild(child, signal) {
  if (!child?.pid) return;
  try {
    // Include descendants such as the subprocess started by node --test.
    if (PROCESS_GROUPS) process.kill(-child.pid, signal);
    else child.kill(signal);
  } catch (error) {
    if (error.code !== "ESRCH") console.error(error);
  }
}

function stopChild(child, signal) {
  if (!child?.pid || child.exitCode !== null || child.signalCode !== null) return Promise.resolve();
  return new Promise((resolve) => {
    let forced;
    const finish = () => {
      clearTimeout(grace);
      clearTimeout(forced);
      child.off("exit", finish);
      child.off("error", finish);
      // A group leader may exit before a descendant that ignored the signal.
      if (PROCESS_GROUPS) signalChild(child, "SIGKILL");
      resolve();
    };
    const grace = setTimeout(() => {
      signalChild(child, "SIGKILL");
      // Do not wait indefinitely even if the OS cannot reap a killed process.
      forced = setTimeout(finish, 1000);
    }, 5000);
    child.once("exit", finish);
    child.once("error", finish);
    signalChild(child, signal);
  });
}

function shutdown(signal = "SIGTERM") {
  return shutdownPromise ??= Promise.all([stopChild(activeSuite, signal), stopChild(server, "SIGTERM")]);
}

function cancel(signal) {
  if (cancelled) return;
  cancelled = signal === "SIGINT" ? 130 : 143;
  // The compatibility child gets time to persist its final checkpoint before
  // this parent exits, including when using an externally managed server.
  void shutdown(signal).then(() => process.exit(cancelled));
}
process.on("SIGINT", () => cancel("SIGINT"));
process.on("SIGTERM", () => cancel("SIGTERM"));
process.on("exit", () => {
  for (const child of [activeSuite, server]) {
    if (child && child.exitCode === null && child.signalCode === null) signalChild(child, "SIGKILL");
  }
});

function runSuite(args, baseUrl) {
  // Keep the event loop free to drain Spin's stdout/stderr during the live tests.
  return new Promise((resolve) => {
    const child = spawn(process.execPath, args, {
      stdio: "inherit",
      detached: PROCESS_GROUPS,
      env: { ...process.env, BUNDLER_BASE_URL: baseUrl },
    });
    activeSuite = child;
    child.on("error", (error) => { console.error(error); resolve(1); });
    child.on("close", (code) => {
      if (activeSuite === child) activeSuite = null;
      resolve(code ?? 1);
    });
  });
}

async function runTests(baseUrl) {
  const integrationStatus = await runSuite(["--test", TESTS], baseUrl);
  if (cancelled) return cancelled;
  // Always run compatibility as well so a failed integration assertion still leaves
  // a complete compatibility report to diagnose in CI.
  const compatibilityStatus = WITH_COMPAT
    ? await runSuite([path.join(HERE, "compat", "run.mjs"), "--gate"], baseUrl)
    : 0;
  return cancelled || integrationStatus || compatibilityStatus;
}

async function main() {
  // If a server URL is provided, just run against it.
  if (process.env.BUNDLER_BASE_URL) {
    return runTests(process.env.BUNDLER_BASE_URL);
  }

  // Need `spin`.
  if (spawnSync("spin", ["--version"], { stdio: "ignore" }).status !== 0) {
    console.error("spin CLI not found on PATH. Install it (https://spinframework.dev) or set BUNDLER_BASE_URL.");
    return 1;
  }

  // Build the two components we need if their artifacts are missing.
  const artifacts = [
    path.join(WASM_DIR, "dist", "ts-sandbox.wasm"),
    path.join(WASM_DIR, "packages", "typescript", "bundler", "dist", "bundler.wasm"),
  ];
  if (!artifacts.every(existsSync)) {
    console.log("Building components (ts-sandbox, bundler) ...");
    const b = spawnSync("spin", ["build", "-f", BUILD_MANIFEST, "-c", "ts-sandbox", "-c", "bundler"], { stdio: "inherit" });
    if (b.status !== 0) { console.error("spin build failed"); return b.status ?? 1; }
  }

  // Start the server (trimmed manifest: no py-sandbox) and wait until it is serving.
  const baseUrl = `http://127.0.0.1:${PORT}`;
  console.log(`Starting spin up on ${baseUrl} ...`);
  server = spawn("spin", ["up", "-f", RUN_MANIFEST, "--listen", `127.0.0.1:${PORT}`], {
    stdio: ["ignore", "pipe", "pipe"], detached: PROCESS_GROUPS,
  });

  const ready = new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("timed out waiting for `spin up` to serve")), 120000);
    const onData = (buf) => {
      const s = buf.toString();
      process.stdout.write(s);
      if (s.includes("Serving http")) { clearTimeout(timer); resolve(); }
    };
    server.stdout.on("data", onData);
    server.stderr.on("data", (b) => process.stderr.write(b.toString()));
    server.on("error", (error) => { clearTimeout(timer); reject(error); });
    server.on("exit", (code) => { clearTimeout(timer); reject(new Error(`spin up exited early (code ${code})`)); });
  });

  await ready;
  if (cancelled) return cancelled;
  return runTests(baseUrl);
}

let exitCode = 1;
try {
  exitCode = await main();
} catch (error) {
  if (!cancelled) console.error(String(error && error.message ? error.message : error));
} finally {
  await shutdown();
}
process.exit(cancelled || exitCode);
