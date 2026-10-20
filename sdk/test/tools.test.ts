import assert from "node:assert/strict";
import { test } from "node:test";
import { z } from "zod";

import { interpreterTool, toAnthropicTool, toOpenAITool, toZodTool } from "../src/tools.ts";

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

test("toZodTool produces a validating Zod schema in the { name, description, parameters } shape", () => {
  const tool = interpreterTool({ languages: ["javascript"] });
  const zodTool = toZodTool(tool);
  assert.equal(zodTool.name, tool.name);
  assert.equal(zodTool.description, tool.description);
  // parameters is always a ZodObject, never a bare scalar/any schema.
  assert.ok(zodTool.parameters instanceof z.ZodObject);

  // Required fields are enforced and optional ones may be omitted.
  assert.deepEqual(zodTool.parameters.parse({ language: "javascript", code: "x" }), {
    language: "javascript",
    code: "x",
  });
  assert.throws(() => zodTool.parameters.parse({ code: "x" }));
  assert.throws(() => zodTool.parameters.parse({ language: "ruby", code: "x" }));

  // Nested shapes carry through: allowedHosts is an array of strings, kvEnabled a boolean.
  assert.throws(() =>
    zodTool.parameters.parse({ language: "javascript", code: "x", allowedHosts: "nope" }),
  );
  assert.throws(() =>
    zodTool.parameters.parse({ language: "javascript", code: "x", kvEnabled: "yes" }),
  );
  assert.deepEqual(
    zodTool.parameters.parse({
      language: "javascript",
      code: "x",
      allowedHosts: ["api.example.com"],
      kvEnabled: true,
    }),
    { language: "javascript", code: "x", allowedHosts: ["api.example.com"], kvEnabled: true },
  );
});