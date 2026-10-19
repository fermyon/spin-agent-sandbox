import { transform } from "sucrase";
import { buildRequest, toWireResponse, BodyStream, type RunInput } from "./requestResponse";
import { makeRequire } from "./registry";
import { AsyncFunction, detectHandler, coerceUserResponse } from "./runner";
import { errorMessage, errorText } from "./errors";

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
    } catch (e) {
      return { tag: "compile-error", val: errorMessage(e) };
    }
  }

  const moduleObj: any = { exports: {} };
  const requireShim = makeRequire();

  let fn: any;
  try {
    fn = new AsyncFunction("require", "module", "exports", transpiled);
  } catch (e) {
    return { tag: "compile-error", val: errorMessage(e) };
  }

  try {
    await fn(requireShim, moduleObj, moduleObj.exports);
  } catch (e) {
    return { tag: "main", val: errorText(e) };
  }

  // `module.exports` is user-controlled, so reading `default`/`fetch` can run getters
  // that throw.
  let handler: ReturnType<typeof detectHandler>;
  try {
    handler = detectHandler(moduleObj.exports);
  } catch (e) {
    return { tag: "main", val: errorText(e) };
  }
  if (handler) {
    let synthReq: Request;
    try {
      synthReq = buildRequest(input);
    } catch (e) {
      return { tag: "compile-error", val: `invalid input: ${errorMessage(e)}` };
    }
    // A Response subclass can override `status`/`headers`/`body` with throwing getters,
    // so converting it to the wire record is guarded too.
    try {
      const wire = await toWireResponse(coerceUserResponse(await handler(synthReq)));
      return { tag: "handler-response", val: wire };
    } catch (e) {
      return { tag: "handler-error", val: errorText(e) };
    }
  }

  return { tag: "main", val: undefined };
}

export const executor = { run, BodyStream };
