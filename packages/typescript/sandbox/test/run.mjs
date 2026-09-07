// Bundles each test/*.test.ts with esbuild (resolving this codebase's
// extensionless relative imports, which Node's native TS type-stripping
// can't do on its own) into plain JS under test/.build/, then runs them
// with node:test. npm deps stay external so they're resolved normally from
// node_modules instead of being bundled in.
//
// `splitting: true` matters for tests that need `node:test`'s
// `mock.module()` (e.g. stubbing `@spinframework/spin-kv`, which only loads
// inside the real Wasm component): without it, esbuild inlines a dynamic
// `import("../src/registry")` into the same output file as the test, and
// ESM hoists that inlined module's own top-level imports ahead of any
// mock.module() call. With splitting, the dynamically-imported module
// becomes a real, separately-loaded chunk, so it's only evaluated when the
// `import()` is actually awaited — after the mock is registered.

import { build } from "esbuild";
import { readdirSync } from "fs";
import { run } from "node:test";
import { tap } from "node:test/reporters";
import path from "path";
import { fileURLToPath } from "url";

const testDir = path.dirname(fileURLToPath(import.meta.url));
const buildDir = path.join(testDir, ".build");

const testFiles = readdirSync(testDir).filter((f) => f.endsWith(".test.ts"));

await build({
  entryPoints: testFiles.map((f) => path.join(testDir, f)),
  outdir: buildDir,
  bundle: true,
  splitting: true,
  platform: "node",
  format: "esm",
  packages: "external",
  sourcemap: "inline",
  logLevel: "error",
});

const builtFiles = testFiles.map((f) => path.join(buildDir, f.replace(/\.ts$/, ".js")));

let failed = false;
const stream = run({ files: builtFiles }).compose(tap);
stream.on("test:fail", () => {
  failed = true;
});
stream.pipe(process.stdout);
await new Promise((resolve) => stream.on("end", resolve));

process.exit(failed ? 1 : 0);
