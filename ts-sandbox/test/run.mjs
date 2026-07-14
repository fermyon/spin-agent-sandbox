// Unit-test runner: bundle each test/*.test.ts with the already-present esbuild, then
// run the output under Node's built-in test runner.
//
//   npm test           # (package.json wires this file)
//   node test/run.mjs

import { build } from "esbuild";
import { readdirSync, mkdirSync, rmSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const outdir = path.join(here, ".build");
rmSync(outdir, { recursive: true, force: true });
mkdirSync(outdir, { recursive: true });

const testFiles = readdirSync(here)
  .filter((f) => f.endsWith(".test.ts"))
  .map((f) => path.join(here, f));

if (testFiles.length === 0) {
  console.error("no *.test.ts files found in", here);
  process.exit(1);
}

await build({
  entryPoints: testFiles,
  outdir,
  bundle: true,
  format: "esm",
  platform: "node",
  target: "node18",
  logLevel: "error",
  outExtension: { ".js": ".mjs" },
});

const built = readdirSync(outdir)
  .filter((f) => f.endsWith(".mjs"))
  .map((f) => path.join(outdir, f));

const res = spawnSync(process.execPath, ["--test", ...built], { stdio: "inherit" });
process.exit(res.status ?? 1);
