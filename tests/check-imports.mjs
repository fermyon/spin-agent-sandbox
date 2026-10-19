#!/usr/bin/env node
// Checks the host capabilities each composed sandbox can reach, from the built components.
// Run after `spin build` (needs `wasm-tools` on PATH):
//
//   node tests/check-imports.mjs
//
// For each sandbox it asserts that:
//   1. the language guest never imports `sandbox:guard/context` (guard-io exports it, so a
//      guest import would let user code change its own sandboxId, allow-list, or KV flag);
//   2. every guest import NOT satisfied by guard-io or a stub component (and so wired straight
//      to the host by the `...` in crates/guard/compose*.wac) is in GUEST_TO_HOST;
//   3. every import of the composed component is in COMPOSED.
// A new capability therefore fails here until it is reviewed and added to a list below.
// Interfaces are compared without versions: wac wires semver-compatible versions together.

import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const RELEASE = "target/wasm32-wasip2/release";

// Harmless host interfaces a guest may reach directly, bypassing guard-io.
const GUEST_TO_HOST = new Set([
  "wasi:cli/environment", // component environment variables; the sandbox manifests set none
  "wasi:cli/exit",
  // terminal-* only report whether a stream is a terminal (method-less handles). Output itself
  // goes through wasi:cli/stdout and stderr, which guard-io provides, so they are not listed here.
  "wasi:cli/terminal-input",
  "wasi:cli/terminal-output",
  "wasi:cli/terminal-stdin",
  "wasi:cli/terminal-stdout",
  "wasi:cli/terminal-stderr",
  "wasi:clocks/monotonic-clock",
  "wasi:clocks/wall-clock",
  "wasi:io/error",
  "wasi:io/poll",
  "wasi:random/insecure",
  "wasi:random/insecure-seed",
  "wasi:random/random",
]);

// Everything the composed component may import from Spin: the above, plus what guard-io
// wraps (KV, outbound HTTP, stdio) and `variables`, which only guard-front reads (log_level).
const COMPOSED = new Set([
  ...GUEST_TO_HOST,
  "fermyon:spin/key-value",
  "fermyon:spin/variables",
  "wasi:cli/stderr",
  "wasi:cli/stdin",
  "wasi:cli/stdout",
  "wasi:http/outgoing-handler",
  "wasi:http/types",
  "wasi:io/streams",
]);

const SANDBOXES = [
  {
    name: "ts-sandbox",
    composed: "dist/ts-sandbox.wasm",
    guest: "packages/typescript/sandbox/dist/ts-sandbox.wasm",
    providers: [`${RELEASE}/guard_io.wasm`],
  },
  {
    name: "py-sandbox",
    composed: "dist/py-sandbox.wasm",
    guest: "py-sandbox/py-sandbox.wasm",
    providers: [`${RELEASE}/guard_io.wasm`, "target/dummy_sockets.wasm", "target/dummy_capabilities.wasm"],
  },
];

// Inline `export <name>: interface {` blocks that are known not to reach the host. componentize-py
// emits `exports` as a types-only record of its own bindings; it has no functions or imports.
const INLINE_EXPORTS = new Set(["exports"]);

// The `import`/`export` interface names of a component's world, without versions. Every
// import/export line must parse: one that does not could hide a capability, so it fails the run.
const WORLD_LINE = /^\s*(import|export)\s+([\w.-]+:[\w./-]+?)(?:@[^;\s]+)?;\s*$/;
const INLINE_LINE = /^\s*(import|export)\s+([\w-]+):\s*interface\s*\{\s*$/;

function world(file, kind) {
  const wit = execFileSync("wasm-tools", ["component", "wit", path.join(ROOT, file)], { encoding: "utf8" });
  const fail = (line) => {
    console.error(`FAIL ${file}: cannot parse world line: ${line.trim()}`);
    process.exit(1);
  };
  const names = new Set();
  let inInline = false;
  for (const line of wit.split("\n")) {
    if (inInline) {
      inInline = !/^  \}\s*$/.test(line); // the block closes at the world's own indentation
      continue;
    }
    if (!/^\s*(import|export)\b/.test(line)) continue;
    const m = WORLD_LINE.exec(line);
    if (m) {
      if (m[1] === kind) names.add(m[2]);
      continue;
    }
    const inline = INLINE_LINE.exec(line);
    if (!inline || inline[1] !== "export" || !INLINE_EXPORTS.has(inline[2])) fail(line);
    inInline = true;
  }
  if (inInline) fail("unterminated inline interface");
  return names;
}

const failures = [];
for (const s of SANDBOXES) {
  const guestImports = world(s.guest, "import");
  const provided = new Set(s.providers.flatMap((p) => [...world(p, "export")]));
  const toHost = [...guestImports].filter((i) => !provided.has(i));
  const composedImports = [...world(s.composed, "import")];

  const problems = [];
  if (guestImports.has("sandbox:guard/context")) problems.push("guest imports sandbox:guard/context");
  for (const i of toHost) if (!GUEST_TO_HOST.has(i)) problems.push(`guest reaches the host directly: ${i}`);
  for (const i of composedImports) if (!COMPOSED.has(i)) problems.push(`composed component imports: ${i}`);

  console.log(`${s.name}: ${composedImports.length} composed imports, ${toHost.length} direct guest-to-host`);
  for (const p of problems) console.log(`  FAIL ${p}`);
  failures.push(...problems);
}

if (failures.length) {
  console.log(`\n${failures.length} unexpected import(s). If intended, review and add them to the lists in tests/check-imports.mjs.`);
  process.exit(1);
}
console.log("ok: imports match the allowlists");
