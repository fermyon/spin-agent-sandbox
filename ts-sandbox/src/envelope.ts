// Request envelope: validation and the synthetic Request built for the handler shape.
// Pure logic (no Spin imports); uses only web globals (URL/Request/Headers/Response).

export const MAX_BODY = 8 * 1024 * 1024; // reject request bodies larger than this
export const MAX_CODE = 5 * 1024 * 1024; // reject user code larger than this

export interface ValidEnvelope {
  ok: true;
  code: string;
  sandboxId: string;
  input: any;
  allowedHosts: string[];
}
export interface InvalidEnvelope {
  ok: false;
  status: number;
  kind: string;
  message: string;
}

// Validate an already-parsed envelope object. The method check and JSON parsing stay
// with the caller (they need the raw Request); this covers shape and size.
export function validateEnvelope(parsed: any): ValidEnvelope | InvalidEnvelope {
  if (!parsed || typeof parsed.code !== "string" || typeof parsed.sandboxId !== "string") {
    return {
      ok: false,
      status: 400,
      kind: "invalid_envelope",
      message: "expected { code: string, sandboxId: string, input?, allowedHosts? }",
    };
  }
  if (parsed.code.length > MAX_CODE) {
    return { ok: false, status: 413, kind: "code_too_large", message: `code exceeds ${MAX_CODE} bytes` };
  }
  return {
    ok: true,
    code: parsed.code,
    sandboxId: parsed.sandboxId,
    input: parsed.input,
    allowedHosts: Array.isArray(parsed.allowedHosts) ? parsed.allowedHosts : [],
  };
}

// Build the synthetic Request passed to a handler-shape export, from envelope.input.
export function buildRequest(input: any): Request {
  input = input || {};
  const method = String(input.method || "GET").toUpperCase();
  // Path the handler sees; defaults to "/". Lets a stored app route on sub-paths.
  const rawPath = typeof input.path === "string" && input.path ? input.path : "/";
  const url = new URL(rawPath.startsWith("/") ? rawPath : "/" + rawPath, "http://sandbox.localhost");
  for (const [k, v] of Object.entries(input.query || {})) url.searchParams.set(k, String(v));
  const init: any = { method, headers: new Headers(input.headers || {}) };
  if (input.body !== undefined && method !== "GET" && method !== "HEAD") {
    init.body = typeof input.body === "string" ? input.body : JSON.stringify(input.body);
  }
  return new Request(url.toString(), init);
}

export function errorResponse(status: number, kind: string, message: string): Response {
  return Response.json({ error: kind, message }, { status });
}
