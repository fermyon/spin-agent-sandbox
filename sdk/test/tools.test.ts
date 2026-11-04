import assert from "node:assert/strict";
import { test } from "node:test";

import { interpreterTool, toAnthropicTool, toOpenAITool } from "../src/tools.ts";

test("interpreterTool scopes its schema to the configured language", () => {
  const tool = interpreterTool({ languages: ["python"] });
  assert.equal(tool.name, "run_in_wasm_interpreter");
  assert.deepEqual(tool.inputSchema.properties.language, { type: "string", enum: ["python"] });
  assert.equal("dependencies" in tool.inputSchema.properties, false);
  assert.ok("input" in tool.inputSchema.properties);
  assert.deepEqual(Object.keys(tool.inputSchema.properties), ["language", "code", "input"]);
});

test("interpreterTool leaves execution policy to the application", () => {
  for (const languages of [undefined, ["python"] as const, ["javascript"] as const]) {
    const tool = interpreterTool({ languages });
    for (const field of ["allowedHosts", "kvEnabled", "identity"]) {
      assert.equal(field in tool.inputSchema.properties, false);
      assert.equal(tool.description.includes(field), false);
    }
    assert.deepEqual(tool.inputSchema.required, ["language", "code"]);
    assert.equal(tool.inputSchema.additionalProperties, false);
    assert.match(tool.description, /configured by the application/);
  }
});

test("JavaScript tools retain program inputs and asynchronous execution guidance", () => {
  const tool = interpreterTool({ languages: ["javascript"] });
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

test("tool adapters support Anthropic and OpenAI shapes", () => {
  const tool = interpreterTool({ languages: ["javascript"] });
  assert.deepEqual(toAnthropicTool(tool).input_schema, tool.inputSchema);
  assert.deepEqual(toOpenAITool(tool), {
    type: "function",
    function: { name: tool.name, description: tool.description, parameters: tool.inputSchema },
  });
});