// Provider-neutral surface for the agent loop. Exactly one implementation is bundled per
// build (see build.mjs): `src/llm/anthropic.ts` by default, `src/llm/openai.ts` for the
// `openai` Spin build profile.

import type { ToolDefinition } from "@spinframework/sandbox/tools";

export type ProviderName = "anthropic" | "openai";

export interface ToolCall {
  id: string;
  name: string;
  input: Record<string, unknown>;
  /** Index of the output block that carried the call, matching the streaming handler ids. */
  block: number;
}

export interface ToolResult {
  id: string;
  content: string;
  isError?: boolean;
}

export interface TurnHandlers {
  onText?(block: number, delta: string): void;
  onToolStart?(block: number, name: string): void;
  onToolInput?(block: number, partialJson: string): void;
}

export interface TurnRequest {
  system: string;
  tools: ToolDefinition[];
  maxTokens: number;
}

export interface TurnResult {
  toolCalls: ToolCall[];
  stop: string;
  usage: { input: number; output: number };
}

export interface LlmProvider {
  readonly name: ProviderName;
  readonly model: string;
  /** Runs one streamed model turn over `history` and appends the model's output to it. */
  turn(history: unknown[], req: TurnRequest, on: TurnHandlers): Promise<TurnResult>;
  userMessage(text: string): unknown;
  toolResults(results: ToolResult[]): unknown[];
}

/** Conversation state round-tripped through the UI; only replayed by the provider that made it. */
export interface History {
  provider: ProviderName;
  items: unknown[];
}

export function historyFor(provider: LlmProvider, value: unknown): unknown[] {
  const h = value as Partial<History> | null;
  return h && h.provider === provider.name && Array.isArray(h.items) ? h.items : [];
}
