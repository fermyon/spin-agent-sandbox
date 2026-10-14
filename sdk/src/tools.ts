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
    'Hosts this run may call over HTTP(S), e.g. ["api.github.com", "*.example.com"]. Required for any outbound request: ' +
    'absent or empty denies all, and a bare "*" grants nothing. Private, loopback, link-local, and internal hosts are always ' +
    "blocked, and the host app's own allow-list still applies.",
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
  const only = (on: boolean, text: string) => (on ? [text] : []);
  const httpContext = [
    ...only(supportsJavaScript, "JavaScript uses the standard `fetch`."),
    ...only(
      supportsPython,
      "Python uses `from spin_sdk.http import send, Request` and `send(Request(method, url, headers, body))`; urllib, http.client, and requests are not available.",
    ),
  ].join(" ");
  const kvContext = [
    ...only(supportsJavaScript, "JavaScript: `import { openDefault } from \"@spinframework/spin-kv\"`, then get/set or getJson/setJson."),
    ...only(supportsPython, "Python: `from spin_sdk import key_value`, then `key_value.open_default()` with get/set (values are bytes)."),
  ].join(" ");
  const libraryContext = [
    ...only(
      supportsPython,
      "Python includes numpy, pydantic, pyyaml, regex, beautifulsoup4, jinja2, markdown, tabulate, sqlalchemy, tiktoken, and the standard library except its networking modules.",
    ),
    ...only(
      supportsJavaScript,
      "JavaScript (TypeScript syntax is accepted) includes lodash, zod, date-fns, dayjs, cheerio, node-html-parser, js-yaml, uuid, ulidx, and nanoid. " +
        "For other npm packages, list them in dependencies as name -> semver ranges; they are bundled before the run. Use ESM import, never require().",
    ),
  ].join(" ");
  const codeDescription = supportsJavaScript
    ? "The complete program to run. Print results to stdout. JavaScript supports top-level await; await asynchronous work directly instead of using a floating async IIFE."
    : "The complete program to run. Print results to stdout.";
  return {
    name: "run_in_wasm_interpreter",
    description:
      `Run ${languageLabel} code in an isolated WebAssembly sandbox and get back its stdout, stderr, and error. ` +
      "Beyond computation, parsing, and data work, code can call external HTTP APIs, keep data across runs, and serve HTTP requests. " +
      `Outbound HTTP: list every host the code calls in allowedHosts (nothing is reachable otherwise). ${httpContext} ` +
      "Persistent storage: set kvEnabled and pass the same identity on every run that should share data. Runs with the same identity " +
      "read what earlier runs wrote (also across languages); different identities are isolated; without an identity each run gets a " +
      `fresh, empty store. ${kvContext} ` +
      "HTTP handlers: supply input to run a handler against that request and get its HTTP response. JavaScript exports " +
      "`default { async fetch(request) {} }`; Python defines `handle_request(request)` and may return an iterable of str or bytes chunks to stream the body. " +
      `${libraryContext} ` +
      "Each run is a fresh instance: variables and globals do not carry over, so persist state in the key-value store. " +
      "There is no filesystem, shell, subprocess, or raw socket, and no runtime pip install. stdout and stderr are each capped at 256 KB.",
    inputSchema: {
      type: "object",
      properties: {
        language: { type: "string", enum: languages },
        code: { type: "string", description: codeDescription },
        ...(supportsJavaScript ? { dependencies: DEPENDENCIES } : {}),
        allowedHosts: ALLOWED_HOSTS,
        input: HTTP_INPUT,
        identity: {
          type: "string",
          description:
            "Stable name for this sandbox's key-value namespace. Reuse it on every run that should share stored data; " +
            "runs with different identities are isolated. Omit it for a fresh, empty namespace each run.",
        },
        kvEnabled: {
          type: "boolean",
          description: "Enable the key-value store for this run (off by default). Combine with identity to keep data across runs.",
        },
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