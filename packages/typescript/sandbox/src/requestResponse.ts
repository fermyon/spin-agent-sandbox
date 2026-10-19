// Envelope parsing lives in the Rust guard component. This file is only the JS side
// of the `executor.run(code, input)` boundary: building a synthetic Request from the
// guard's parsed `run-input`, and converting a handler's Response to the wire record.

import { errorMessage } from "./errors";

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

export type BodyChunk =
  | { tag: "chunk"; val: Uint8Array }
  | { tag: "done" }
  | { tag: "error"; val: string };

// Implements the WIT `body-stream` resource: guard-front owns one instance
// per handler-response and calls `read()` repeatedly until `done`, driving
// this reader forward one `ReadableStream` chunk per call.
export class BodyStream {
  #reader: ReadableStreamDefaultReader<Uint8Array> | null;

  constructor(body: ReadableStream<Uint8Array> | null) {
    this.#reader = body ? body.getReader() : null;
  }

  async read(): Promise<BodyChunk> {
    if (!this.#reader) return { tag: "done" };
    try {
      const { done, value } = await this.#reader.read();
      if (done) {
        this.#reader = null;
        return { tag: "done" };
      }
      // A user-constructed ReadableStream can enqueue anything; only bytes can be
      // lowered to the WIT `list<u8>`.
      if (!(value instanceof Uint8Array)) {
        this.#reader = null;
        return { tag: "error", val: "response body stream chunks must be Uint8Array" };
      }
      return { tag: "chunk", val: value };
    } catch (e) {
      this.#reader = null;
      return { tag: "error", val: errorMessage(e) };
    }
  }
}

export interface WireResponse {
  status: number;
  headers: [string, string][];
  body: BodyStream;
}

export async function toWireResponse(resp: Response): Promise<WireResponse> {
  const headers: [string, string][] = [...resp.headers.entries()];
  return { status: resp.status, headers, body: new BodyStream(resp.body) };
}
