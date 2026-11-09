import assert from "node:assert/strict";
import { test } from "node:test";

import { interpreterTool, toAnthropicTool, toOpenAITool, toToolDefinition, type ToolDefinition } from "../src/tools.ts";

const jsonTool = (options?: Parameters<typeof interpreterTool>[0]) => toToolDefinition(interpreterTool(options));

test("interpreterTool scopes its schema to the configured language", () => {
  const tool = jsonTool({ languages: ["python"] });
  assert.equal(tool.name, "run_in_wasm_interpreter");
  assert.deepEqual(tool.inputSchema.properties.language, { type: "string", enum: ["python"] });
  assert.equal("dependencies" in tool.inputSchema.properties, false);
  assert.ok("input" in tool.inputSchema.properties);
  assert.deepEqual(Object.keys(tool.inputSchema.properties), ["language", "code", "input"]);
});

test("interpreterTool leaves execution policy to the application", () => {
  for (const languages of [undefined, ["python"] as const, ["javascript"] as const]) {
    const tool = jsonTool({ languages });
    for (const field of ["allowedHosts", "kvEnabled", "identity"]) {
      assert.equal(field in tool.inputSchema.properties, false);
      assert.equal(tool.description.includes(field), false);
    }
    assert.deepEqual(tool.inputSchema.required, ["language", "code"]);
    assert.equal(tool.inputSchema.additionalProperties, false);
    assert.match(tool.description, /configured by the application/);
  }
});

test("the Zod schema rejects policy fields and unknown arguments", () => {
  const { inputSchema } = interpreterTool();
  for (const field of ["allowedHosts", "kvEnabled", "identity", "extra"]) {
    const result = inputSchema.safeParse({ language: "python", code: "print(1)", [field]: true });
    assert.equal(result.success, false, field);
  }
});

test("the Zod schema validates and types model arguments", () => {
  const { inputSchema } = interpreterTool();
  const args = {
    language: "javascript",
    code: "console.log(1)",
    dependencies: { marked: "^11.0.0" },
    input: { method: "POST", path: "/x", body: { a: 1 } },
  };
  assert.deepEqual(inputSchema.parse(args), args);
  assert.equal(inputSchema.safeParse({ language: "ruby", code: "puts 1" }).success, false);
  assert.equal(inputSchema.safeParse({ language: "python" }).success, false);
  assert.equal(inputSchema.safeParse({ language: "python", code: 1 }).success, false);
  assert.equal(inputSchema.safeParse({ language: "javascript", code: "", dependencies: { x: 1 } }).success, false);
});

test("Python-only tools reject JavaScript-only arguments", () => {
  const { inputSchema } = interpreterTool({ languages: ["python"] });
  assert.equal(inputSchema.safeParse({ language: "javascript", code: "1" }).success, false);
  assert.equal(inputSchema.safeParse({ language: "python", code: "1", dependencies: {} }).success, false);
});

test("JavaScript tools retain program inputs and asynchronous execution guidance", () => {
  const tool = jsonTool({ languages: ["javascript"] });
  assert.deepEqual(Object.keys(tool.inputSchema.properties), ["language", "code", "dependencies", "input"]);
  assert.match(JSON.stringify(tool.inputSchema.properties.code), /Never leave floating promises/);
});

test("KV guidance describes sharing between runs rather than language or client reuse", () => {
  for (const languages of [undefined, ["python"] as const, ["javascript"] as const]) {
    const tool = interpreterTool({ languages });
    assert.match(tool.description, /same language or different languages/);
    assert.match(tool.description, /not on reusing an Interpreter client object/);
    assert.match(tool.description, /variables and globals do not carry over/);
  }
});

test("HTTP guidance explains denied destinations using the runtime's actual errors", () => {
  const python = interpreterTool({ languages: ["python"] });
  assert.match(python.description, /destination is not allowed/);
  assert.match(python.description, /guard returns HttpRequestDenied/);
  const javascript = interpreterTool({ languages: ["javascript"] });
  assert.match(javascript.description, /destination is not allowed, fetch rejects/);
  assert.match(javascript.description, /runtime may report the generic error/);
});

test("the derived JSON Schema carries no $schema keyword", () => {
  assert.equal("$schema" in jsonTool().inputSchema, false);
});

test("tool adapters support Anthropic and OpenAI shapes", () => {
  const tool = interpreterTool({ languages: ["javascript"] });
  const json = toToolDefinition(tool);
  assert.deepEqual(toAnthropicTool(tool), { name: json.name, description: json.description, input_schema: json.inputSchema });
  assert.deepEqual(toOpenAITool(tool), {
    type: "function",
    function: { name: json.name, description: json.description, parameters: json.inputSchema },
  });
});

test("tool adapters pass hand-written JSON Schema tools through unchanged", () => {
  const custom: ToolDefinition = {
    name: "create_app",
    description: "Publish an app.",
    inputSchema: { type: "object", properties: { code: { type: "string" } }, required: ["code"], additionalProperties: false },
  };
  assert.equal(toToolDefinition(custom), custom);
  assert.equal(toAnthropicTool(custom).input_schema, custom.inputSchema);
  assert.equal(toOpenAITool(custom).function.parameters, custom.inputSchema);
});

test("the derived JSON Schema and description match the pre-Zod hand-written output", async () => {
  // Captured from the JSON Schema version of tools.ts. Any drift in what the model sees fails here.
  const { default: golden } = await import("./fixtures/interpreter-tool.json", { with: { type: "json" } });
  const configs = {
    default: undefined,
    python: { languages: ["python"] },
    javascript: { languages: ["javascript"] },
    "javascript,python": { languages: ["javascript", "python"] },
  } as const;
  for (const [key, options] of Object.entries(configs)) {
    assert.deepStrictEqual(jsonTool(options), (golden as Record<string, unknown>)[key], key);
  }
});
