import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { chmodSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

// Run a copied orchestrator with fixture suites and a fake Spin executable. This
// never starts or signals the real server or touches workspace build artifacts.
// A valid empty WebAssembly component satisfies the orchestrator's file-existence
// check. The fake Spin never loads it: these tests cover process shutdown, while
// integration.test.mjs exercises the real built components.
const EMPTY_COMPONENT = Buffer.from([0x00, 0x61, 0x73, 0x6d, 0x0d, 0x00, 0x01, 0x00]);

function fixture(t, { existingServer = false, stubborn = false } = {}) {
  const root = mkdtempSync(path.join(os.tmpdir(), "integration-shutdown-"));
  const here = path.join(root, "packages/typescript/bundler/test");
  const bin = path.join(root, "bin");
  mkdirSync(path.join(here, "compat"), { recursive: true });
  mkdirSync(path.join(root, "dist"));
  mkdirSync(path.join(here, "../dist"));
  mkdirSync(bin);
  copyFileSync(new URL("../integration-run.mjs", import.meta.url), path.join(here, "integration-run.mjs"));
  writeFileSync(path.join(root, "dist/ts-sandbox.wasm"), EMPTY_COMPONENT);
  writeFileSync(path.join(here, "../dist/bundler.wasm"), EMPTY_COMPONENT);
  writeFileSync(path.join(here, "integration.test.mjs"), 'import test from "node:test"; test("fixture", () => {});\n');
  writeFileSync(path.join(here, "compat/run.mjs"), `
    import { spawn } from "node:child_process";
    import { writeFileSync } from "node:fs";
    const root = process.env.SHUTDOWN_FIXTURE;
    writeFileSync(root + "/suite.pid", String(process.pid));
    const descendant = spawn(process.execPath, ["-e", "console.log('ready'); setInterval(() => {}, 1000)"], { stdio: ["ignore", "pipe", "inherit"] });
    writeFileSync(root + "/descendant.pid", String(descendant.pid));
    for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => {
      writeFileSync(root + "/signal", signal);
      if (${stubborn}) return;
      setTimeout(() => {
        writeFileSync(root + "/checkpoint", signal);
        process.exit(signal === "SIGINT" ? 130 : 143);
      }, 150);
    });
    descendant.stdout.once("data", () => console.log("FIXTURE_SWEEP_READY"));
    setInterval(() => {}, 1000);
  `);
  const spin = path.join(bin, "spin");
  writeFileSync(spin, `#!/usr/bin/env node
    const { writeFileSync } = require("node:fs");
    if (process.argv.includes("--version")) process.exit(0);
    const root = process.env.SHUTDOWN_FIXTURE;
    writeFileSync(root + "/spin.pid", String(process.pid));
    process.on("SIGTERM", () => {
      setTimeout(() => { writeFileSync(root + "/spin-stopped", "yes"); process.exit(0); }, 100);
    });
    console.log("Serving http fixture");
    setInterval(() => {}, 1000);
  `);
  chmodSync(spin, 0o755);
  const env = { ...process.env, SHUTDOWN_FIXTURE: root, PATH: `${bin}${path.delimiter}${path.dirname(process.execPath)}${path.delimiter}${process.env.PATH}` };
  delete env.BUNDLER_BASE_URL;
  if (existingServer) env.BUNDLER_BASE_URL = "http://fixture.invalid";
  const child = spawn(process.execPath, [path.join(here, "integration-run.mjs"), "--compat"], {
    cwd: root, env, stdio: ["ignore", "pipe", "pipe"],
  });
  t.after(() => {
    if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL");
    for (const name of ["suite", "descendant", "spin"]) {
      const file = path.join(root, `${name}.pid`);
      if (existsSync(file)) {
        try { process.kill(Number(readFileSync(file)), "SIGKILL"); } catch {}
      }
    }
    rmSync(root, { recursive: true, force: true });
  });
  return { root, child };
}

async function interruptFixture(t, options, signal) {
  const files = fixture(t, options);
  let output = "";
  let sent = false;
  let sentAt;
  const outcome = await new Promise((resolve, reject) => {
    files.child.on("error", reject);
    files.child.stdout.on("data", chunk => {
      output += chunk;
      if (!sent && output.includes("FIXTURE_SWEEP_READY")) {
        sent = true;
        sentAt = Date.now();
        // Signal only the orchestrator PID, not its process group.
        files.child.kill(signal);
      }
    });
    files.child.stderr.on("data", chunk => { output += chunk; });
    files.child.on("close", (code, exitSignal) => resolve({ code, exitSignal }));
  });
  assert.equal(sent, true, output);
  assert.equal(outcome.code, signal === "SIGINT" ? 130 : 143, output);
  assert.equal(outcome.exitSignal, null);
  assert.equal(readFileSync(path.join(files.root, "signal"), "utf8"), signal);
  for (const name of ["suite", "descendant", ...(options.existingServer ? [] : ["spin"])]) {
    const pid = Number(readFileSync(path.join(files.root, `${name}.pid`)));
    assert.throws(() => process.kill(pid, 0), { code: "ESRCH" }, `${name} process ${pid} was orphaned`);
  }
  if (options.existingServer) assert.equal(existsSync(path.join(files.root, "spin.pid")), false);
  else assert.equal(readFileSync(path.join(files.root, "spin-stopped"), "utf8"), "yes");
  return { ...files, elapsed: Date.now() - sentAt };
}

for (const existingServer of [false, true]) {
  test(`direct SIGTERM checkpoints the active sweep and cleans up (${existingServer ? "existing" : "managed"} server)`, { timeout: 10000 }, async t => {
    const { root, elapsed } = await interruptFixture(t, { existingServer }, "SIGTERM");
    assert.equal(readFileSync(path.join(root, "checkpoint"), "utf8"), "SIGTERM");
    assert.ok(elapsed >= 100 && elapsed < 5000, `shutdown took ${elapsed}ms`);
  });
}

test("direct SIGINT preserves checkpoint and conventional exit status", { timeout: 10000 }, async t => {
  const { root } = await interruptFixture(t, { existingServer: true }, "SIGINT");
  assert.equal(readFileSync(path.join(root, "checkpoint"), "utf8"), "SIGINT");
});

test("an uncooperative suite is killed after the bounded shutdown grace", { timeout: 12000 }, async t => {
  const { root, elapsed } = await interruptFixture(t, { stubborn: true }, "SIGTERM");
  assert.equal(existsSync(path.join(root, "checkpoint")), false);
  assert.ok(elapsed >= 4900 && elapsed < 8000, `shutdown took ${elapsed}ms`);
});
