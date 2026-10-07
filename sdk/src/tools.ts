import type { Language } from "./core/index.ts";

export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: {
    type: "object";
    properties: Record<string, unknown>;
    required: string[];
  };
}

export interface InterpreterToolOptions {
  /** Languages served by this interpreter. Defaults to both sandbox languages. */
  languages?: readonly Language[];
}

const DEPENDENCIES = {
  type: "object",
  description:
    "JavaScript only. Extra npm dependencies as name -> semver ranges. Use ESM import; Python cannot add packages.",
  additionalProperties: { type: "string" },
};
const ALLOWED_HOSTS = {
  type: "array",
  items: { type: "string" },
  description:
    "Hosts allowed for server-side fetch. Default-deny; internal, loopback, and metadata hosts are always blocked.",
};
const HTTP_INPUT = {
  type: "object",
  description:
    "Mock HTTP request for handler code. Supplying it runs a JavaScript `export default { fetch(request) {} }` or Python `handle_request(request)` handler and returns its HTTP response.",
  properties: {
    method: { type: "string", description: "HTTP method; defaults to GET." },
    path: { type: "string", description: "Request path; defaults to /." },
    headers: { type: "object", additionalProperties: { type: "string" } },
    query: { type: "object", additionalProperties: { type: "string" } },
    body: { description: "Request body as a string or JSON value." },
  },
};

/** Returns tool metadata for the languages served by one interpreter endpoint. */
export function interpreterTool(options: InterpreterToolOptions = {}): ToolDefinition {
  const languages = options.languages ?? ["python", "javascript"];
  if (languages.length === 0) throw new Error("interpreterTool requires at least one language");
  const supportsJavaScript = languages.includes("javascript");
  const supportsPython = languages.includes("python");
  const languageLabel = languages.join(" or ");
  const libraryContext = [
    supportsPython && "Python includes numpy, pydantic, regex, beautifulsoup4, jinja2, markdown, tabulate, and tiktoken.",
    supportsJavaScript && "JavaScript includes lodash, zod, date-fns, dayjs, cheerio, uuid, and nanoid.",
    supportsJavaScript &&
      "For additional JavaScript packages, provide dependencies as name -> semver ranges; they are bundled before execution. Use ESM import, never require().",
  ]
    .filter(Boolean)
    .join(" ");
  const codeDescription = supportsJavaScript
    ? "The complete program to run. Print results to stdout. JavaScript supports top-level await; await asynchronous work directly instead of using a floating async IIFE."
    : "The complete program to run. Print results to stdout.";
  return {
    name: "run_in_wasm_interpreter",
    description:
      `Execute self-contained ${languageLabel} code in a fast WebAssembly sandbox. ` +
      "Use it for computations, data transformation, parsing, and string or JSON work. Print results to stdout. " +
      `${libraryContext} ` +
      "There is no filesystem or shell. Supply input to run an HTTP handler against a mock request: JavaScript exports `default { async fetch(request) {} }`; Python defines `handle_request(request)` and may return an iterable of string or bytes chunks to stream its body. " +
      "Set kvEnabled to use the isolated, durable default KV store. JavaScript imports `@spinframework/spin-kv` and calls `openDefault()`; Python imports `spin_sdk.key_value` and calls `open_default()`. " +
      "Set identity to keep related KV calls in one namespace. Network egress is denied by default; list every external fetch host in allowedHosts.",
    inputSchema: {
      type: "object",
      properties: {
        language: { type: "string", enum: languages },
        code: { type: "string", description: codeDescription },
        ...(supportsJavaScript ? { dependencies: DEPENDENCIES } : {}),
        allowedHosts: ALLOWED_HOSTS,
        input: HTTP_INPUT,
        identity: { type: "string", description: "Stable sandbox/KV namespace for related runs." },
        kvEnabled: { type: "boolean", description: "Enable the isolated default KV store for this run." },
      },
      required: ["language", "code"],
    },
  };
}

/** Adapts provider-neutral metadata to Anthropic's tool shape. */
export function toAnthropicTool(tool: ToolDefinition) {
  return { name: tool.name, description: tool.description, input_schema: tool.inputSchema };
}

/** Adapts provider-neutral metadata to OpenAI's function-tool shape. */
export function toOpenAITool(tool: ToolDefinition) {
  return {
    type: "function" as const,
    function: { name: tool.name, description: tool.description, parameters: tool.inputSchema },
  };
}