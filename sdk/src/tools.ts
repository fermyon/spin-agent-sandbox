import * as z from "zod";

import type { HttpInput, Language } from "./core/index.ts";

/**
 * A tool whose input is described by a Zod schema. This is the shape the SDK returns by
 * default: `{ description, inputSchema }` is what the Vercel AI SDK's `tool()` expects, and
 * `inputSchema.safeParse(args)` validates model-supplied arguments before they are used.
 * Convert it with `toAnthropicTool()`, `toOpenAITool()`, or `toToolDefinition()` for
 * providers that take JSON Schema.
 */
export interface StructuredTool<Input = unknown> {
  name: string;
  description: string;
  inputSchema: z.ZodType<Input>;
}

/** A JSON Schema object describing tool arguments, as Anthropic and OpenAI accept it. */
export interface JsonSchemaObject {
  type: "object";
  properties: Record<string, unknown>;
  required?: string[];
  additionalProperties?: boolean;
  [keyword: string]: unknown;
}

/** Provider-neutral tool metadata with a plain JSON Schema for its input. */
export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: JsonSchemaObject;
}

/** Either kind of tool the adapters accept. */
export type AnyTool = StructuredTool<any> | ToolDefinition;

/**
 * Arguments the model supplies to `run_in_wasm_interpreter`, narrowed to the configured
 * languages: `dependencies` exists only when JavaScript is served, matching the schema.
 */
export type InterpreterToolInput<L extends Language = Language> = {
  language: L;
  code: string;
  input?: HttpInput;
} & ("javascript" extends L
  ? {
      /** JavaScript only: extra npm dependencies as name -> semver range. */
      dependencies?: Record<string, string>;
    }
  : {});

export interface InterpreterToolOptions<L extends Language = Language> {
  /** Languages served by this interpreter. Defaults to both sandbox languages. */
  languages?: readonly L[];
}

const stringMap = () => z.record(z.string(), z.string());

const HTTP_INPUT = z
  .object({
    method: z.string().optional().describe("HTTP method; defaults to GET."),
    path: z.string().optional().describe("Request path; defaults to /."),
    headers: stringMap().optional(),
    query: stringMap().optional(),
    body: z.unknown().optional().describe("Request body as a string or JSON value."),
  })
  .describe(
    "Mock HTTP request for handler code. Supplying it runs a JavaScript `export default { fetch(request) {} }` or Python `handle_request(request)` handler and returns its HTTP response.",
  );

const DEPENDENCIES = stringMap().describe(
  "JavaScript only. Extra npm dependencies as name -> semver ranges. Use ESM import; Python cannot add packages.",
);

/**
 * Returns the `run_in_wasm_interpreter` tool for the languages served by one interpreter
 * endpoint. Its `inputSchema` is a strict Zod object: unknown fields (such as
 * `allowedHosts`, `kvEnabled`, or `identity`) are rejected, so execution policy stays with
 * the application.
 */
export function interpreterTool<const L extends Language = Language>(
  options: InterpreterToolOptions<L> = {},
): StructuredTool<InterpreterToolInput<L>> {
  const languages: readonly Language[] = options.languages ?? ["python", "javascript"];
  if (languages.length === 0) throw new Error("interpreterTool requires at least one language");
  const supportsJavaScript = languages.includes("javascript");
  const supportsPython = languages.includes("python");
  const languageLabel = languages.join(" or ");
  const only = (on: boolean, text: string) => (on ? [text] : []);
  const httpContext = [
    ...only(
      supportsJavaScript,
      "JavaScript uses the standard `fetch`. If the destination is not allowed, fetch rejects; the runtime may report the generic error \"An error occurred while using the host API\".",
    ),
    ...only(
      supportsPython,
      "Python uses `from spin_sdk.http import send, Request` and `send(Request(method, url, headers, body))`; urllib, http.client, and requests are not available. " +
        "If the destination is not allowed, the guard returns HttpRequestDenied, surfaced as `Err(ErrorCode_HttpRequestDenied())`.",
    ),
    "Network permissions are configured by the application and cannot be changed through tool arguments.",
  ].join(" ");
  const kvContext = [
    ...only(supportsJavaScript, "JavaScript: `import { openDefault } from \"@spinframework/spin-kv\"`, then get/set or getJson/setJson."),
    ...only(supportsPython, "Python: `from spin_sdk import key_value`, then `key_value.open_default()` with get/set (values are bytes)."),
  ].join(" ");
  const libraryContext = [
    ...only(
      supportsPython,
      "Python includes numpy, pydantic, pyyaml, regex, beautifulsoup4, jinja2, markdown, tabulate, sqlalchemy, tiktoken (no built-in encodings: get_encoding() fails, so pass your own mergeable_ranks to tiktoken.Encoding), and the standard library except its networking modules.",
    ),
    ...only(
      supportsJavaScript,
      "JavaScript (TypeScript syntax is accepted) includes lodash, zod, date-fns, dayjs, cheerio, node-html-parser, js-yaml, uuid, ulidx, and nanoid. " +
        "For other npm packages, list them in dependencies as name -> semver ranges; they are bundled before the run. Use ESM import, never require().",
    ),
  ].join(" ");
  const codeDescription = supportsJavaScript
    ? "The complete program to run. Print results to stdout. JavaScript supports top-level await: await all asynchronous work directly. Never leave floating promises (an un-awaited async IIFE, main() call, or timer); work still running when the program ends is discarded without any output or error."
    : "The complete program to run. Print results to stdout.";
  const inputSchema = z.strictObject({
    language: z.enum(languages as [Language, ...Language[]]),
    code: z.string().describe(codeDescription),
    ...(supportsJavaScript ? { dependencies: DEPENDENCIES.optional() } : {}),
    input: HTTP_INPUT.optional(),
  }) as unknown as z.ZodType<InterpreterToolInput<L>>;
  return {
    name: "run_in_wasm_interpreter",
    description:
      `Run ${languageLabel} code in an isolated WebAssembly sandbox and get back its stdout, stderr, and error. ` +
      "Beyond computation, parsing, and data work, code can call external HTTP APIs, keep data across runs, and serve HTTP requests. " +
      `Outbound HTTP is denied unless the application permits the destination. ${httpContext} ` +
      "Persistent storage is available only when enabled by the application, which also controls the storage namespace. " +
      "Runs in the same namespace share stored KV data, whether they use the same language or different languages. " +
      `Sharing depends on the namespace, not on reusing an Interpreter client object; different namespaces are isolated. ${kvContext} ` +
      "HTTP handlers: supply input to run a handler against that request and get its HTTP response. JavaScript exports " +
      "`default { async fetch(request) {} }`, awaiting all async work before it returns the Response; Python defines `handle_request(request)` and may return an iterable of str or bytes chunks to stream the body. " +
      `${libraryContext} ` +
      "Each run is a fresh instance: variables and globals do not carry over. When storage is enabled, persist state in the key-value store. " +
      "There is no filesystem, shell, subprocess, or raw socket, and no runtime pip install. stdout and stderr are each capped at 256 KB.",
    inputSchema,
  };
}

function isStructured(tool: AnyTool): tool is StructuredTool<any> {
  // Duck-typed instead of `instanceof` so schemas from another copy of zod v4 still work.
  return typeof tool.inputSchema === "object" && tool.inputSchema !== null && "_zod" in tool.inputSchema;
}

/** Returns the tool with a plain JSON Schema input, converting a Zod schema if needed. */
export function toToolDefinition(tool: AnyTool): ToolDefinition {
  if (!isStructured(tool)) return tool;
  const { $schema: _, ...schema } = z.toJSONSchema(tool.inputSchema, {
    io: "input",
    // Zod emits `propertyNames: { type: "string" }` for string-keyed records. It is redundant
    // (JSON object keys are always strings) and OpenAI's strict mode rejects the keyword.
    override: ({ jsonSchema }) => {
      const names = jsonSchema.propertyNames;
      if (names && typeof names === "object" && names.type === "string" && Object.keys(names).length === 1) {
        delete jsonSchema.propertyNames;
      }
    },
  });
  if (schema.type !== "object") throw new Error(`tool ${tool.name} must take an object input`);
  return {
    name: tool.name,
    description: tool.description,
    inputSchema: { properties: {}, ...schema } as JsonSchemaObject,
  };
}

/** Adapts a tool to Anthropic's tool shape. */
export function toAnthropicTool(tool: AnyTool) {
  const { name, description, inputSchema } = toToolDefinition(tool);
  return { name, description, input_schema: inputSchema };
}

/** Adapts a tool to OpenAI's function-tool shape. */
export function toOpenAITool(tool: AnyTool) {
  const { name, description, inputSchema } = toToolDefinition(tool);
  return {
    type: "function" as const,
    function: { name, description, parameters: inputSchema },
  };
}
