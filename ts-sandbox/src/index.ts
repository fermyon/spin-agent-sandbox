// ts-sandbox — executes dynamic JS/TS code received as a JSON envelope.
//
// Request (POST, body = strict JSON envelope):
//   { code: string, sandboxId: string, input?: {method?, headers?, query?, body?}, allowedHosts?: string[] }
//
// The user `code` is TypeScript/JS using ES modules. It is transpiled at runtime with
// sucrase (types stripped, `import`/`export default` -> CommonJS) and run via the
// AsyncFunction constructor with an injected `require` (a fixed module registry), a
// per-sandbox scoped KV, an allow-listed `fetch`, and a capturing `console`.
//
// Two code shapes are supported:
//   - handler:  `export default { fetch(request) {...} }`  -> synthetic Request built
//               from `input`, awaited, its Response returned verbatim.
//   - main:     top-level script that prints                -> stdout/stderr captured,
//               returned as { stdout, stderr, error } JSON.
//
// This file is the orchestration layer; the logic lives in focused modules:
//   envelope.ts (validation + synthetic request), kv.ts (scoped store),
//   egress.ts (allow-list + fetch), console.ts (capture), registry.ts (require),
//   runner.ts (execute + interpret result).

import { transform } from "sucrase";
import * as realKv from "@spinframework/spin-kv";
import { log, initLogger } from "./logger";
import { validateEnvelope, buildRequest, errorResponse } from "./envelope";
import { makeScopedKv } from "./kv";
import { makeFetch } from "./egress";
import { makeConsole } from "./console";
import { makeRequire } from "./registry";
import { AsyncFunction, detectHandler, coerceUserResponse } from "./runner";

async function handle(request: Request): Promise<Response> {
  initLogger();

  if (request.method !== "POST") {
    return errorResponse(405, "method_not_allowed", "send the code envelope as a POST body");
  }

  let parsed: any;
  try {
    parsed = await request.json();
  } catch {
    return errorResponse(400, "invalid_json", "request body must be a JSON envelope");
  }

  const envelope = validateEnvelope(parsed);
  if (!envelope.ok) {
    return errorResponse(envelope.status, envelope.kind, envelope.message);
  }
  const { code, sandboxId, allowedHosts, input } = envelope;

  let transpiled: string;
  try {
    transpiled = transform(code, {
      transforms: ["typescript", "imports"],
      preserveDynamicImport: false,
    }).code;
  } catch (e: any) {
    return errorResponse(400, "transpile_error", String(e && e.message ? e.message : e));
  }

  const out: string[] = [];
  const err: string[] = [];
  const moduleObj: any = { exports: {} };
  const requireShim = makeRequire(makeScopedKv(realKv, sandboxId));
  const fetchShim = makeFetch(allowedHosts);
  const consoleShim = makeConsole(out, err);

  // Gate globalThis.fetch too, so user code can't bypass the shim. Restore after.
  const savedFetch = globalThis.fetch;
  (globalThis as any).fetch = fetchShim;

  try {
    let fn: any;
    try {
      fn = new AsyncFunction("require", "module", "exports", "console", "fetch", transpiled);
    } catch (e: any) {
      return errorResponse(400, "compile_error", String(e && e.message ? e.message : e));
    }

    try {
      await fn(requireShim, moduleObj, moduleObj.exports, consoleShim, fetchShim);
    } catch (e: any) {
      return Response.json({
        stdout: out.join("\n"),
        stderr: err.join("\n"),
        error: String(e && e.stack ? e.stack : e),
      });
    }

    const handler = detectHandler(moduleObj.exports);
    if (handler) {
      const synthReq = buildRequest(input);
      let userResp: any;
      try {
        userResp = await handler(synthReq);
      } catch (e: any) {
        return errorResponse(500, "handler_error", String(e && e.stack ? e.stack : e));
      }
      return coerceUserResponse(userResp);
    }

    // main shape
    return Response.json({ stdout: out.join("\n"), stderr: err.join("\n"), error: null });
  } catch (e: any) {
    log.error(`sandbox internal error: ${e}`);
    return errorResponse(500, "internal", String(e && e.stack ? e.stack : e));
  } finally {
    (globalThis as any).fetch = savedFetch;
  }
}

//@ts-ignore - addEventListener/FetchEvent are provided by the Spin/StarlingMonkey runtime.
addEventListener("fetch", (event: any) => {
  event.respondWith(handle(event.request));
});
