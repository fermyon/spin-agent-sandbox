import assert from "node:assert/strict";
import { test } from "node:test";

import { interpreterTool, toAnthropicTool, toOpenAITool } from "../src/tools.ts";

test("interpreterTool scopes its schema to the configured language", () => {
  const tool = interpreterTool({ languages: ["python"] });
  assert.equal(tool.name, "run_in_wasm_interpreter");
  assert.deepEqual(tool.inputSchema.properties.language, { type: "string", enum: ["python"] });
  assert.equal("dependencies" in tool.inputSchema.properties, false);
  assert.ok("input" in tool.inputSchema.properties);
  assert.ok("kvEnabled" in tool.inputSchema.properties);
});

test("tool adapters support Anthropic and OpenAI shapes", () => {
  const tool = interpreterTool({ languages: ["javascript"] });
  assert.deepEqual(toAnthropicTool(tool).input_schema, tool.inputSchema);
  assert.deepEqual(toOpenAITool(tool), {
    type: "function",
    function: { name: tool.name, description: tool.description, parameters: tool.inputSchema },
  });
});