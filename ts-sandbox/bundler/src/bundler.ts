// The linker. Runs in StarlingMonkey using only fetch + sucrase + URL.
//
// Strategy: offload dependency-graph resolution and tree-shaking to esm.sh (?bundle).
// For each bare specifier in the user source, fetch its (near-)standalone esm.sh module,
// close the graph over esm.sh's own polyfill URLs (substituting curated Node shims that
// sucrase can transpile cleanly), convert each module ESM->CJS with sucrase, and stitch a
// single blob whose require() resolves module specifiers at RUNTIME via the URL API — no
// fragile string rewriting. The sandbox's 14 built-ins are left as bare require() so they
// fall through to the in-WASM registry.

import { transform as sucrase } from "sucrase";
import { resolveShim } from "./shims";

// The ts-sandbox's pre-bundled packages — kept as bare require() (host registry).
const BUILTINS = [
  "cheerio", "node-html-parser", "zod", "js-yaml", "nanoid", "ulidx", "uuid",
  "lodash", "date-fns", "dayjs", "@spinframework/spin-kv",
];
const BSET = new Set(BUILTINS);
const ESM = "https://esm.sh";
const MAX_MODULES = 300;
// Source-size budgets. Very large libraries (mathjs, pug) otherwise exhaust the StarlingMonkey
// heap while transpiling and surface as an opaque "out of memory". We stop first (before the
// expensive sucrase pass) and return a clear, actionable error. A single ~800 KB module already
// triggers the OOM in this build, so the per-module cap is what actually catches those; passing
// libraries here top out well under 200 KB.
const MAX_MODULE_BYTES = 700 * 1024;
const MAX_TOTAL_BYTES = 2 * 1024 * 1024;
const tooLarge = (bytes: number, mods: number) =>
  `dependency graph too large (${Math.round(bytes / 1024)} KB across ${mods} modules); this library is ` +
  `too big to bundle in the sandbox — try a smaller alternative`;

const rootOf = (s: string) => (s.startsWith("@") ? s.split("/").slice(0, 2).join("/") : s.split("/")[0]);
const isBuiltin = (s: string) => BSET.has(rootOf(s));
const isBare = (s: string) => !(s.startsWith("/") || s.startsWith("./") || s.startsWith("../") || /^https?:\/\//.test(s));

// Detect import/require specifiers. Over-detection is harmless (worst case: one extra fetch).
const IMPORT_RE = /(?:import\s+(?:[\s\S]*?\sfrom\s*)?|export\s+[\s\S]*?\sfrom\s*|require\s*\(\s*|import\s*\(\s*)['"]([^'"]+)['"]/g;
function specifiers(src: string): string[] {
  const out = new Set<string>();
  IMPORT_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = IMPORT_RE.exec(src))) out.add(m[1]);
  return [...out];
}

const stripImportMeta = (t: string) =>
  t.replace(/import\.meta\.url/g, JSON.stringify(ESM + "/")).replace(/import\.meta/g, "({})");

// Collect the `require("...")` specifiers from already-transpiled CJS. We scan the CJS
// (not the raw ESM) because esm.sh's minified bundle output uses forms with no whitespace
// after the keyword (`import*as X from"..."`, `export{x}from"..."`) that a raw-ESM regex
// misses — sucrase normalizes all of them to plain require() calls, so this catches them all.
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
  sucrase(stripImportMeta(esm), { transforms: ["imports"], preserveDynamicImport: false }).code.replace(
    /Object\.defineProperty\(exports, "__esModule", \{value: true\}\)/g,
    'Object.defineProperty(exports, "__esModule", {value: true, writable: true, configurable: true})'
  );

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
    // Stop before sucrase touches a module large enough to OOM the engine.
    if (text.length > MAX_MODULE_BYTES || totalBytes > MAX_TOTAL_BYTES) throw new Error(tooLarge(totalBytes, mods.size));
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

  for (const spec of specifiers(userSource)) {
    if (isBuiltin(spec) || !isBare(spec)) continue;
    entry.set(spec, await process(esmUrl(spec, deps)));
  }

  const userCjs = sucrase(userSource, { transforms: ["typescript", "imports"], preserveDynamicImport: false }).code;

  const modLiteral = [...mods.entries()]
    .filter(([, v]) => v)
    .map(([k, v]) => `${JSON.stringify(k)}: { base: ${JSON.stringify(v!.base)}, fn: function(module, exports, require){\n${v!.cjs}\n} }`)
    .join(",\n");
  const entryLiteral = [...entry.entries()].map(([k, v]) => `${JSON.stringify(k)}: ${JSON.stringify(v)}`).join(", ");

  // The assembled blob. It runs through the UNCHANGED sandbox: sucrase(no-op) -> AsyncFunction.
  // Note: no regex is used inside the blob (indexOf checks) to keep it robust across the
  // sandbox's second sucrase pass. `require` here is the sandbox's host registry (builtins).
  const blob =
`const __B = new Set(${JSON.stringify(BUILTINS)});
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
(function(module, exports, require){
${userCjs}
})(module, exports, function(s){ return __require(s, null); });
`;

  return { blob, ms: Date.now() - t0, fetches, modules: [...mods.values()].filter(Boolean).length };
}
