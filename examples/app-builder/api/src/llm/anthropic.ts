import Anthropic from "@anthropic-ai/sdk";
import * as variables from "@spinframework/spin-variables";

import type { LlmProvider, ToolCall } from "./types";

export function createProvider(): LlmProvider {
  const baseURL = variables.get("model_base_url");
  const model = variables.get("model") || "claude-opus-4-8";
  // Local Anthropic-compatible servers (e.g. Ollama) ignore the key, but the SDK requires a value.
  const client = new Anthropic({ apiKey: variables.get("model_api_key") || "unset", baseURL });

  return {
    name: "anthropic",
    model,
    async turn(history, req, on) {
      const messages = history as Anthropic.MessageParam[];
      const stream = client.messages.stream({
        model,
        max_tokens: req.maxTokens,
        system: req.system,
        tools: req.tools.map((t) => ({
          name: t.name,
          description: t.description,
          input_schema: t.inputSchema as Anthropic.Tool.InputSchema,
        })),
        messages,
      });
      for await (const event of stream) {
        if (event.type === "content_block_start" && event.content_block.type === "tool_use") {
          on.onToolStart?.(event.index, event.content_block.name);
        } else if (event.type === "content_block_delta") {
          if (event.delta.type === "text_delta" && event.delta.text) on.onText?.(event.index, event.delta.text);
          else if (event.delta.type === "input_json_delta") on.onToolInput?.(event.index, event.delta.partial_json);
        }
      }
      const res = await stream.finalMessage();
      messages.push({ role: "assistant", content: res.content });

      const toolCalls: ToolCall[] = [];
      res.content.forEach((b, block) => {
        if (b.type === "tool_use") toolCalls.push({ id: b.id, name: b.name, input: b.input as Record<string, unknown>, block });
      });
      return {
        toolCalls,
        stop: res.stop_reason ?? "",
        usage: { input: res.usage.input_tokens, output: res.usage.output_tokens },
      };
    },
    userMessage: (text) => ({ role: "user", content: text }),
    toolResults: (results) => [
      {
        role: "user",
        content: results.map((r) => ({ type: "tool_result", tool_use_id: r.id, content: r.content, is_error: r.isError })),
      },
    ],
  };
}
