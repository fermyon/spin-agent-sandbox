// OpenAI Chat Completions API, used statelessly (the full message history is sent each turn)
// so it works with OpenAI and with compatible servers such as Ollama and vLLM.

import OpenAI from "openai";
import * as variables from "@spinframework/spin-variables";

import type { LlmProvider, ToolCall } from "./types";

type Message = OpenAI.Chat.ChatCompletionMessageParam;

function parseArguments(args: string): Record<string, unknown> {
  try {
    const v = JSON.parse(args);
    return v && typeof v === "object" ? v : {};
  } catch {
    return {};
  }
}

function validArguments(args: string): string {
  try {
    const v = JSON.parse(args);
    if (v && typeof v === "object") return args;
  } catch {}
  return "{}";
}

// A tool call being assembled from streamed deltas, keyed by the delta's `index`.
interface PendingCall {
  id: string;
  name: string;
  args: string;
}

// Streamed block ids: the assistant text is block 0 and tool call `i` is block `i + 1`, so
// the ids stay unique within a turn.
const TEXT_BLOCK = 0;
const toolBlock = (index: number) => index + 1;

export function createProvider(): LlmProvider {
  // model_base_url is an origin (it doubles as the outbound allow-list entry, which takes no
  // path); the Chat Completions API lives under /v1 on OpenAI and compatible servers.
  const baseUrl = (variables.get("model_base_url") ?? "").replace(/\/+$/, "");
  const model = variables.get("model") || "gpt-5";
  const client = new OpenAI({
    // Local OpenAI-compatible servers ignore the key, but the SDK requires a value.
    apiKey: variables.get("model_api_key") || "unset",
    baseURL: baseUrl + "/v1",
  });

  return {
    name: "openai",
    model,
    async turn(history, req, on) {
      const messages = history as Message[];
      const stream = await client.chat.completions.create({
        model,
        messages: [{ role: "system", content: req.system }, ...messages],
        max_completion_tokens: req.maxTokens,
        tools: req.tools.map((t) => ({
          type: "function" as const,
          function: { name: t.name, description: t.description, parameters: t.inputSchema },
        })),
        stream: true,
        stream_options: { include_usage: true },
      });

      let text = "";
      let finishReason = "";
      let usage = { input: 0, output: 0 };
      const calls = new Map<number, PendingCall>();

      for await (const chunk of stream) {
        if (chunk.usage) {
          usage = { input: chunk.usage.prompt_tokens ?? 0, output: chunk.usage.completion_tokens ?? 0 };
        }
        const choice = chunk.choices[0];
        if (!choice) continue; // the final usage-only chunk has no choices
        if (choice.finish_reason) finishReason = choice.finish_reason;

        const delta = choice.delta;
        if (delta.content) {
          text += delta.content;
          on.onText?.(TEXT_BLOCK, delta.content);
        }
        for (const d of delta.tool_calls ?? []) {
          let call = calls.get(d.index);
          if (!call) {
            // Some compatible servers omit the id, so fall back to a stable one.
            call = { id: d.id || `call_${d.index}`, name: "", args: "" };
            calls.set(d.index, call);
          }
          if (d.function?.name && !call.name) {
            call.name = d.function.name;
            on.onToolStart?.(toolBlock(d.index), call.name);
          }
          if (d.function?.arguments) {
            call.args += d.function.arguments;
            on.onToolInput?.(toolBlock(d.index), d.function.arguments);
          }
        }
      }

      const ordered = [...calls.entries()].sort(([a], [b]) => a - b);
      const assistant: Message = { role: "assistant", content: text || null };
      if (ordered.length > 0) {
        assistant.tool_calls = ordered.map(([, c]) => ({
          id: c.id,
          type: "function" as const,
          // Replay valid JSON only: some servers reject a history that holds malformed arguments.
          function: { name: c.name, arguments: validArguments(c.args) },
        }));
      }
      messages.push(assistant);

      const toolCalls: ToolCall[] = ordered.map(([index, c]) => ({
        id: c.id,
        name: c.name,
        input: parseArguments(c.args),
        block: toolBlock(index),
      }));
      return { toolCalls, stop: finishReason, usage };
    },
    userMessage: (text) => ({ role: "user", content: text }),
    toolResults: (results) =>
      results.map((r) => ({ role: "tool", tool_call_id: r.id, content: r.content })),
  };
}
