// Envelope parsing lives in the Rust guard component now. This keeps only the JS side
// of the `executor.run(code, input)` boundary: building a synthetic Request from the
// guard's parsed `run-input`, and converting a handler's Response to the wire record.

export interface RunInput {
  method: string;
  path: string;
  headers: [string, string][];
  query: [string, string][];
  body?: Uint8Array;
}

export function buildRequest(input: RunInput | undefined): Request {
  const method = (input?.method ?? "GET").toUpperCase();
  const path = input?.path ?? "/";
  const qs = new URLSearchParams(input?.query ?? []).toString();
  const url = `http://sandbox.local${path}${qs ? `?${qs}` : ""}`;
  const headers = new Headers(input?.headers ?? []);
  const canHaveBody = method !== "GET" && method !== "HEAD";
  return new Request(url, {
    method,
    headers,
    body: canHaveBody ? input?.body : undefined,
  });
}

export interface WireResponse {
  status: number;
  headers: [string, string][];
  body: Uint8Array;
}

export async function toWireResponse(resp: Response): Promise<WireResponse> {
  const body = new Uint8Array(await resp.arrayBuffer());
  const headers: [string, string][] = [...resp.headers.entries()];
  return { status: resp.status, headers, body };
}
