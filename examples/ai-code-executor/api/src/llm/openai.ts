// OpenAI Responses API, used statelessly (the full history is sent each turn) so it also works
// with compatible servers such as Ollama that do not support `previous_response_id`.

import OpenAI from "openai";
import * as variables from "@spinframework/spin-variables";

import type { LlmProvider, ToolCall } from "./types";

function parseArguments(args: string): Record<string, unknown> {
  try {
    const v = JSON.parse(args);
    return v && typeof v === "object" ? v : {};
  } catch {
    return {};
  }
}

export function createProvider(): LlmProvider {
  const baseUrl = (variables.get("openai_base_url") || "https://api.openai.com").replace(/\/+$/, "");
  const apiPath = variables.get("openai_api_path") || "/v1";
  const model = variables.get("model") || "gpt-5";
  const client = new OpenAI({
    // Local OpenAI-compatible servers ignore the key, but the SDK requires a value.
    apiKey: variables.get("openai_api_key") || "unset",
    baseURL: baseUrl + apiPath,
  });

  return {
    name: "openai",
    model,
    async turn(history, req, on) {
      const input = history as OpenAI.Responses.ResponseInputItem[];
      const stream = await client.responses.create({
        model,
        instructions: req.system,
        input,
        max_output_tokens: req.maxTokens,
        tools: req.tools.map((t) => ({
          type: "function" as const,
          name: t.name,
          description: t.description,
          parameters: t.inputSchema,
          strict: false,
        })),
        stream: true,
      });

      let response: OpenAI.Responses.Response | undefined;
      for await (const event of stream) {
        switch (event.type) {
          case "response.output_item.added":
            if (event.item.type === "function_call") on.onToolStart?.(event.output_index, event.item.name);
            break;
          case "response.output_text.delta":
            on.onText?.(event.output_index, event.delta);
            break;
          case "response.function_call_arguments.delta":
            on.onToolInput?.(event.output_index, event.delta);
            break;
          case "response.completed":
          case "response.incomplete":
            response = event.response;
            break;
          case "response.failed":
            throw new Error(event.response.error?.message ?? "model response failed");
          case "error":
            throw new Error(event.message);
        }
      }
      if (!response) throw new Error("model stream ended without a response");
      input.push(...(response.output as OpenAI.Responses.ResponseInputItem[]));

      const toolCalls: ToolCall[] = [];
      response.output.forEach((item, block) => {
        if (item.type === "function_call") {
          toolCalls.push({ id: item.call_id, name: item.name, input: parseArguments(item.arguments), block });
        }
      });
      return {
        toolCalls,
        stop: response.status ?? "",
        usage: { input: response.usage?.input_tokens ?? 0, output: response.usage?.output_tokens ?? 0 },
      };
    },
    userMessage: (text) => ({ role: "user", content: text }),
    toolResults: (results) =>
      results.map((r) => ({ type: "function_call_output", call_id: r.id, output: r.content })),
  };
}
