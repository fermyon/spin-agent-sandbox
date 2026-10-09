// bundler, a Spin/StarlingMonkey component that turns (source + package.json) into
// ONE self-contained CJS blob the (unchanged) ts-sandbox can execute.
//
// Request (POST, JSON body):
//   { source: string, packageJson?: object | string }
// Response (JSON):
//   { blob: string, stats: { ms, fetches, modules, bytes } }   on success
//   { error: string, message?: string }                         on failure
//
// It runs entirely inside StarlingMonkey: no Node, no esbuild at runtime. Dependency
// graph resolution + tree-shaking are offloaded to esm.sh (?bundle): the public
// https://esm.sh unless the `esm_base_url` variable names another instance. This component
// fetches those modules, substitutes curated shims for Node builtins, transpiles each
// with sucrase (ESM -> CJS) and links them with a URL-resolving require(). The sandbox's
// pre-bundled packages are left as bare require() calls so they resolve to the in-WASM
// copies, with no duplication and no version interference.

import * as variables from "@spinframework/spin-variables";
import { bundle, EsmConfigError } from "./bundler";

const MAX_SOURCE = 5 * 1024 * 1024; // reject source larger than this

const DEFAULT_ESM_BASE_URL = "https://esm.sh";

// Origin of the esm.sh server: `esm_base_url` if set, else the public esm.sh. Only the origin
// is used so it matches the manifest's allowed_outbound_hosts entry.
function esmBaseUrl(): string {
  let raw = "";
  try {
    raw = (variables.get("esm_base_url") ?? "").trim();
  } catch {
    // Variable not declared for this component: use the default.
  }
  if (!raw) return DEFAULT_ESM_BASE_URL;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new EsmConfigError(`esm_base_url is not a valid URL: ${raw}`);
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new EsmConfigError(`esm_base_url must be an http(s) URL: ${raw}`);
  }
  return url.origin;
}

function json(body: any, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

// Accept dependencies from a package.json object or its raw string form.
function normalizeDeps(pkg: any): Record<string, string> {
  if (!pkg) return {};
  if (typeof pkg === "string") {
    try { pkg = JSON.parse(pkg); } catch { return {}; }
  }
  const deps: Record<string, string> = {};
  for (const key of ["dependencies", "devDependencies", "peerDependencies"]) {
    if (pkg[key] && typeof pkg[key] === "object") Object.assign(deps, pkg[key]);
  }
  return deps;
}

async function handle(request: Request): Promise<Response> {
  if (request.method !== "POST") {
    return json({ error: "method_not_allowed", message: "POST { source, packageJson }" }, 405);
  }

  let parsed: any;
  try {
    parsed = await request.json();
  } catch {
    return json({ error: "invalid_json", message: "body must be JSON" }, 400);
  }

  const source = parsed && parsed.source;
  if (typeof source !== "string") {
    return json({ error: "invalid_request", message: "expected { source: string, packageJson?: object|string }" }, 400);
  }
  if (source.length > MAX_SOURCE) {
    return json({ error: "source_too_large", message: `source exceeds ${MAX_SOURCE} bytes` }, 413);
  }

  const deps = normalizeDeps(parsed.packageJson ?? parsed.package_json ?? parsed["package.json"]);

  try {
    const result = await bundle(source, deps, esmBaseUrl());
    return json({
      blob: result.blob,
      stats: { ms: result.ms, fetches: result.fetches, modules: result.modules, bytes: result.blob.length },
    });
  } catch (e: any) {
    if (e instanceof EsmConfigError) return json({ error: "esm_base_url_invalid", message: e.message }, 500);
    return json({ error: "bundle_error", message: String(e && e.message ? e.message : e) }, 500);
  }
}

//@ts-ignore - addEventListener/FetchEvent are provided by the Spin/StarlingMonkey runtime.
addEventListener("fetch", (event: any) => {
  event.respondWith(handle(event.request));
});
