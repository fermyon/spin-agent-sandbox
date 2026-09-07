// The linker. Runs in StarlingMonkey using only fetch + sucrase + URL.
//
// Strategy: offload dependency-graph resolution and tree-shaking to esm.sh (?bundle).
// For each bare specifier in the user source, fetch its (near-)standalone esm.sh module,
// close the graph over esm.sh's own polyfill URLs (substituting curated Node shims that
// sucrase can transpile cleanly), convert each module ESM->CJS with sucrase, and stitch a
// single blob whose require() resolves module specifiers at RUNTIME via the URL API, with no
// fragile string rewriting. The sandbox's pre-bundled packages (BUILTINS below) are left as
// bare require() so they fall through to the in-WASM registry.

import { transform as sucrase } from "sucrase";
import { resolveShim } from "./shims";

// The ts-sandbox's pre-bundled packages, kept as bare require() (host registry). Must stay in
// sync with ts-sandbox/src/registry.ts.
const BUILTINS = [
  "cheerio", "node-html-parser", "zod", "js-yaml", "nanoid", "ulidx", "uuid",
  "lodash", "date-fns", "dayjs", "@spinframework/spin-kv",
];
const BSET = new Set(BUILTINS);
const ESM = "https://esm.sh";
const MAX_MODULES = 300;
// Source-size budgets. Very large libraries otherwise exhaust memory and surface as an opaque
// "out of memory". Two independent limits: the per-module cap catches a single huge minified
// module that OOMs the bundler's own sucrase pass; the total cap bounds the assembled blob.
//
// Calibrated by measurement under a 128 MB instance cap (Spin/hosted default): with the sandbox's
// skip-transpile marker in place, the 128 MB SANDBOX runs ~720 KB blobs (resend, elysia) that used
// to crash it. The remaining wall is the BUNDLER: bundling that tier needs ~256 MB (the bundler is
// trusted build infra that executes no untrusted code, so it can be provisioned above the 128 MB sandbox).
// At a uniform 128 MB the bundler is the tighter limit (~600 KB); provision it higher to reach these.
//
// The per-module cap stays low: skip-transpile only removes the SANDBOX's re-parse, not the
// bundler's own per-module sucrase, which still OOMs on a single ~800 KB minified module (pug).
// The total cap is what skip-transpile lets us raise, since the sandbox can now run larger blobs.
const MAX_MODULE_BYTES = 700 * 1024;
const MAX_TOTAL_BYTES = 1 * 1024 * 1024;
const moduleTooLarge = (kb: number, url: string) =>
  `module too large to transpile (${kb} KB: ${url.split("/").pop()}); this library has a single ` +
  `oversized module; try a smaller alternative`;
const graphTooLarge = (bytes: number, mods: number) =>
  `dependency graph too large (${Math.round(bytes / 1024)} KB across ${mods} modules); this library is ` +
  `too big to bundle in the sandbox; try a smaller alternative`;

const rootOf = (s: string) => (s.startsWith("@") ? s.split("/").slice(0, 2).join("/") : s.split("/")[0]);
const isBuiltin = (s: string) => BSET.has(rootOf(s));
const isBare = (s: string) => !(s.startsWith("/") || s.startsWith("./") || s.startsWith("../") || /^https?:\/\//.test(s));

const stripImportMeta = (t: string) =>
  t.replace(/import\.meta\.url/g, JSON.stringify(ESM + "/")).replace(/import\.meta/g, "({})");

// Collect the `require("...")` specifiers from already-transpiled CJS. We scan the CJS
// (not the raw ESM) because esm.sh's minified bundle output uses forms with no whitespace
// after the keyword (`import*as X from"..."`, `export{x}from"..."`) that a raw-ESM regex
// misses; sucrase normalizes all of them to plain require() calls, so this catches them all.
const REQUIRE_RE = /require\(\s*['"]([^'"]+)['"]\s*\)/g;
function requireSpecs(cjs: string): string[] {
  const out = new Set<string>();
  REQUIRE_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = REQUIRE_RE.exec(cjs))) out.add(m[1]);
  return [...out];
}

// sucrase turns ESM into CJS, correctly handling strings/comments/regex (unlike a regex rewrite).
// Also make sucrase's prepended `__esModule` marker writable+configurable: some esm.sh bundle
// outputs later run `exports.__esModule = X`, which otherwise throws "'__esModule' is read-only"
// against the default non-writable value descriptor (StarlingMonkey enforces the strict-mode assign).
const toCjs = (esm: string) =>
  sucrase(stripImportMeta(esm), { transforms: ["imports"], preserveDynamicImport: false }).code
    .replace(
      /Object\.defineProperty\(exports, "__esModule", \{value: true\}\)/g,
      'Object.defineProperty(exports, "__esModule", {value: true, writable: true, configurable: true})'
    )
    // sucrase drops the space in `return await x?.y()` when it rewrites the optional chain into
    // its `_asyncOptionalChain` helper, emitting an invalid `returnawait ...` token. Restore it.
    // (`returnawait` is never a real identifier, so this is safe.)
    .replace(/\breturnawait\b/g, "return await");

function esmUrl(spec: string, deps: Record<string, string>): string {
  const root = rootOf(spec);
  const range = deps[root];
  const ver = range ? "@" + encodeURIComponent(range) : "";
  return `${ESM}/${root}${ver}${spec.slice(root.length)}?bundle&target=es2020`;
}

interface Mod { base: string; cjs: string; }
export interface BundleResult { blob: string; ms: number; fetches: number; modules: number; }

export async function bundle(userSource: string, deps: Record<string, string>): Promise<BundleResult> {
  const t0 = Date.now();
  const mods = new Map<string, Mod | null>(); // absolute URL -> module (null = reserved, cycle guard)
  const entry = new Map<string, string>();    // bare entry specifier -> resolved URL key
  let fetches = 0;
  let totalBytes = 0;

  async function process(url: string): Promise<string> {
    if (mods.has(url)) return url;
    if (mods.size > MAX_MODULES) throw new Error(`dependency graph too large (> ${MAX_MODULES} modules)`);

    // Curated Node-builtin shim (avoids esm.sh's minified unenv polyfills sucrase can't parse).
    const shim = resolveShim(url);
    if (shim) { mods.set(url, { base: url, cjs: shim }); return url; }

    mods.set(url, null);
    const res = await fetch(url, { redirect: "follow" });
    if (!res.ok) throw new Error(`fetch ${url} -> ${res.status}`);
    const text = await res.text();
    fetches++;
    totalBytes += text.length;
    // Stop before sucrase touches a module large enough to OOM the engine, and before the assembled
    // graph grows past what the sandbox can compile.
    if (text.length > MAX_MODULE_BYTES) throw new Error(moduleTooLarge(Math.round(text.length / 1024), url));
    if (totalBytes > MAX_TOTAL_BYTES) throw new Error(graphTooLarge(totalBytes, mods.size));
    const finalUrl = res.url || url;
    const rec: Mod = { base: finalUrl, cjs: toCjs(text) };
    mods.set(url, rec);
    if (finalUrl !== url) mods.set(finalUrl, rec); // alias after redirect

    // Close the graph over what the TRANSPILED module actually require()s (robust to esm.sh's
    // minified import forms). builtins -> host; bare handled at entry; the rest we fetch/shim.
    for (const spec of requireSpecs(rec.cjs)) {
      if (isBuiltin(spec) || isBare(spec)) continue;
      const abs = /^https?:\/\//.test(spec) ? spec : new URL(spec, finalUrl).href;
      await process(abs);
    }
    return finalUrl;
  }

  // Transpile the user source first, then read the entry specifiers off the resulting CJS
  // require() calls (the same robust scan used for fetched modules). Scanning the CJS instead
  // of the raw ESM means comments and string literals don't produce phantom fetches, and
  // whitespace-free forms like `import{x}from"pkg"` are still caught (sucrase normalizes them).
  const userCjs = sucrase(userSource, { transforms: ["typescript", "imports"], preserveDynamicImport: false }).code;

  for (const spec of requireSpecs(userCjs)) {
    if (isBuiltin(spec) || !isBare(spec)) continue;
    entry.set(spec, await process(esmUrl(spec, deps)));
  }

  const modLiteral = [...mods.entries()]
    .filter(([, v]) => v)
    .map(([k, v]) => `${JSON.stringify(k)}: { base: ${JSON.stringify(v!.base)}, fn: function(module, exports, require){\n${v!.cjs}\n} }`)
    .join(",\n");
  const entryLiteral = [...entry.entries()].map(([k, v]) => `${JSON.stringify(k)}: ${JSON.stringify(v)}`).join(", ");

  // The assembled blob. The first-line marker tells the sandbox this is already CommonJS so it
  // skips its own sucrase pass (avoiding a second full parse of the whole blob, the peak-memory
  // step on large blobs). `require` here is the sandbox's host registry (builtins). No regex is used
  // inside the blob (indexOf checks) to stay robust if the sandbox ever does transpile it.
  //
  // The user code runs in an `await (async function(){...})()`: the sandbox runs the blob as its
  // AsyncFunction body, so (1) top-level `await` in the user source is valid (it sits inside an
  // async function) and (2) awaiting the IIFE makes the sandbox wait for the user's async work to
  // finish before it captures stdout. Without this, top-level await was a compile error under the
  // bundler path and floating async work was cut off before its output flushed.
  const blob =
`//__spin_bundled_cjs__
const __B = new Set(${JSON.stringify(BUILTINS)});
const __rootOf = function(s){ return s.charAt(0) === "@" ? s.split("/").slice(0,2).join("/") : s.split("/")[0]; };
const __isBare = function(s){ return !(s.charAt(0) === "/" || s.slice(0,2) === "./" || s.slice(0,3) === "../" || s.indexOf("://") >= 0); };
const __entry = { ${entryLiteral} };
const __mods = {
${modLiteral}
};
const __cache = Object.create(null);
function __resolve(spec, base){
  if (__B.has(__rootOf(spec))) return { host: true };
  if (__isBare(spec)) { const u = __entry[spec]; return u ? { key: u } : { host: true }; }
  return { key: new URL(spec, base).href };
}
function __require(spec, base){
  const r = __resolve(spec, base);
  if (r.host) return require(spec);
  if (r.key in __cache) return __cache[r.key];
  const rec = __mods[r.key];
  if (!rec) return require(spec);
  const m = { exports: {} };
  __cache[r.key] = m.exports;
  rec.fn(m, m.exports, function(s){ return __require(s, rec.base); });
  __cache[r.key] = m.exports;
  return m.exports;
}
await (async function(module, exports, require){
${userCjs}
})(module, exports, function(s){ return __require(s, null); });
`;

  return { blob, ms: Date.now() - t0, fetches, modules: [...mods.values()].filter(Boolean).length };
}
