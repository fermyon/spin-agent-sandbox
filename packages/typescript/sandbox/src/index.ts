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

// The bundler prepends this marker to its output, which is already CommonJS, so the sucrase
// pass is skipped for it. This is not a trust boundary: any code that starts with the marker
// just runs untranspiled, with the same sandboxing.
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
