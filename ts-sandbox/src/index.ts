// ts-sandbox: executes dynamic JS/TS code received as a JSON envelope.
//
// Request (POST, body = strict JSON envelope):
//   { code: string, sandboxId: string, input?: {method?, headers?, query?, body?} }
//
// The user `code` is TypeScript/JS using ES modules. It is transpiled at runtime with
// sucrase (types stripped, `import`/`export default` -> CommonJS) and run via the
// AsyncFunction constructor with an injected `require` (a fixed module registry), a
// per-sandbox scoped KV, native `fetch`, and a capturing `console`.
//
// Two code shapes are supported:
//   - handler:  `export default { fetch(request) {...} }`  -> synthetic Request built
//               from `input`, awaited, its Response returned verbatim.
//   - main:     top-level script that prints                -> stdout/stderr captured,
//               returned as { stdout, stderr, error } JSON.
//
// This file is the orchestration layer; the logic lives in focused modules:
//   envelope.ts (validation + synthetic request), kv.ts (scoped store),
//   console.ts (capture), registry.ts (require),
//   runner.ts (execute + interpret result).

import { transform } from "sucrase";
import * as realKv from "@spinframework/spin-kv";
import { log, initLogger } from "./logger";
import { validateEnvelope, buildRequest, errorResponse, MAX_BODY } from "./envelope";
import { makeScopedKv } from "./kv";
import { makeConsole } from "./console";
import { makeRequire } from "./registry";
import { AsyncFunction, detectHandler, coerceUserResponse } from "./runner";

async function handle(request: Request): Promise<Response> {
  initLogger();

  if (request.method !== "POST") {
    return errorResponse(405, "method_not_allowed", "send the code envelope as a POST body");
  }

  let raw: string;
  try {
    raw = await request.text();
  } catch {
    return errorResponse(400, "invalid_json", "request body must be a JSON envelope");
  }
  if (raw.length > MAX_BODY) {
    return errorResponse(413, "body_too_large", `request body exceeds ${MAX_BODY} bytes`);
  }

  let parsed: any;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return errorResponse(400, "invalid_json", "request body must be a JSON envelope");
  }

  const envelope = validateEnvelope(parsed);
  if (!envelope.ok) {
    return errorResponse(envelope.status, envelope.kind, envelope.message);
  }
  const { code, sandboxId, input } = envelope;

  // A blob produced by the bundler is already CommonJS (no ESM imports, no TS) and carries this
  // marker on its first line. Skip the sucrase pass for it: re-transpiling only re-parses the whole
  // blob a second time (sucrase then AsyncFunction), which is the peak-memory step on large blobs.
  const PREBUNDLED_MARKER = "//__spin_bundled_cjs__";

  let transpiled: string;
  if (code.startsWith(PREBUNDLED_MARKER)) {
    transpiled = code;
  } else {
    try {
      transpiled = transform(code, {
        transforms: ["typescript", "imports"],
        preserveDynamicImport: false,
      }).code;
    } catch (e: any) {
      return errorResponse(400, "transpile_error", String(e && e.message ? e.message : e));
    }
  }

  const out: string[] = [];
  const err: string[] = [];
  const moduleObj: any = { exports: {} };
  const requireShim = makeRequire(makeScopedKv(realKv, sandboxId));
  const consoleShim = makeConsole(out, err);

  try {
    let fn: any;
    try {
      fn = new AsyncFunction("require", "module", "exports", "console", "fetch", transpiled);
    } catch (e: any) {
      return errorResponse(400, "compile_error", String(e && e.message ? e.message : e));
    }

    try {
      await fn(requireShim, moduleObj, moduleObj.exports, consoleShim, globalThis.fetch);
    } catch (e: any) {
      return Response.json({
        stdout: out.join("\n"),
        stderr: err.join("\n"),
        error: String(e && e.stack ? e.stack : e),
      });
    }

    const handler = detectHandler(moduleObj.exports);
    if (handler) {
      let synthReq: Request;
      try {
        synthReq = buildRequest(input);
      } catch (e: any) {
        // Malformed input (e.g. invalid header names/method) is a client error, not an
        // internal one: buildRequest's URL/Headers/Request constructors throw on bad input.
        return errorResponse(400, "invalid_input", String(e && e.message ? e.message : e));
      }
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
  }
}

//@ts-ignore - addEventListener/FetchEvent are provided by the Spin/StarlingMonkey runtime.
addEventListener("fetch", (event: any) => {
  event.respondWith(handle(event.request));
});
