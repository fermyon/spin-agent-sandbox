import { build } from "esbuild";
import { SpinEsbuildPlugin } from "@spinframework/build-tools/plugins/esbuild/index.js";

const spinPlugin = await SpinEsbuildPlugin();

await build({
  entryPoints: ["./src/index.ts"],
  outfile: "./build/bundle.js",
  bundle: true,
  format: "esm",
  platform: "browser",
  plugins: [spinPlugin],
  logLevel: "error",
  resolveExtensions: [".ts", ".js"],
});