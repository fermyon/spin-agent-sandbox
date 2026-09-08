// ts-sandbox: transpiles and runs untrusted JS/TS, exporting `sandbox:guard/executor`
// (see ../wit/executor.wit) instead of raw HTTP. KV isolation, egress, and stdout/stderr
// capture are enforced by the guard/guard-io components this is composed with, not here
// — see ARCHITECTURE.md for the full architecture.
//
// Two code shapes: a handler (`export default { fetch(request) {...} }`) whose
// Response is returned verbatim, or a main script that prints, reported as a plain
// success/failure (guard reads the captured stdout/stderr back from guard-io itself).

import { transform } from "sucrase";
import { buildRequest, toWireResponse, BodyStream, type RunInput } from "./requestResponse";
import { makeRequire } from "./registry";
import { AsyncFunction, detectHandler, coerceUserResponse } from "./runner";

// V8's `.stack` starts with "Error: <message>"; SpiderMonkey's (this
// component runs on StarlingMonkey) is frames-only, so relying on `.stack`
// alone silently drops the actual error text on this engine.
function errorText(e: any): string {
  const message = e?.message ?? String(e);
  return e?.stack ? `${message}\n${e.stack}` : message;
}

// Bundler-produced code (out of scope for this rewrite) would be pre-transpiled CommonJS
// and skip the sucrase pass; kept as a marker for forward compatibility.
const PREBUNDLED_MARKER = "//__spin_bundled_cjs__";

type Outcome =
  | { tag: "handler-response"; val: { status: number; headers: [string, string][]; body: BodyStream } }
  | { tag: "main"; val: string | undefined }
  | { tag: "compile-error"; val: string }
  | { tag: "handler-error"; val: string };

async function run(code: string, input: RunInput | undefined): Promise<Outcome> {
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
      return { tag: "compile-error", val: String(e?.message ?? e) };
    }
  }

  const moduleObj: any = { exports: {} };
  const requireShim = makeRequire();

  let fn: any;
  try {
    fn = new AsyncFunction("require", "module", "exports", transpiled);
  } catch (e: any) {
    return { tag: "compile-error", val: String(e?.message ?? e) };
  }

  try {
    await fn(requireShim, moduleObj, moduleObj.exports);
  } catch (e: any) {
    return { tag: "main", val: errorText(e) };
  }

  const handler = detectHandler(moduleObj.exports);
  if (handler) {
    let synthReq: Request;
    try {
      synthReq = buildRequest(input);
    } catch (e: any) {
      return { tag: "compile-error", val: `invalid input: ${String(e?.message ?? e)}` };
    }
    let userResp: Response;
    try {
      userResp = coerceUserResponse(await handler(synthReq));
    } catch (e: any) {
      return { tag: "handler-error", val: errorText(e) };
    }
    const wire = await toWireResponse(userResp);
    return { tag: "handler-response", val: wire };
  }

  return { tag: "main", val: undefined };
}

export const executor = { run, BodyStream };
