// AI Code Executor API, a Claude agent whose tool is a sandbox.
//
// The model is given one tool: it runs code in the fast Wasm interpreter. The
// model writes the code, we execute it through @spinframework/sandbox and feed
// the result back. The full transcript (reasoning + each tool call + output +
// answer) is streamed to the UI.

import { Hono } from "hono";
import { fire } from "hono/service-worker";
import { getCookie, setCookie } from "hono/cookie";
import type { Context } from "hono";
import Anthropic from "@anthropic-ai/sdk";
import * as variables from "@spinframework/spin-variables";

import { Interpreter, type Language } from "@spinframework/sandbox/interpreter";
import type { HttpInput } from "@spinframework/sandbox/core";
import { interpreterTool, toAnthropicTool } from "@spinframework/sandbox/tools";
import { log, initLogger } from "./logger";

const INTERPRETER_TOOL: Anthropic.Tool = toAnthropicTool(interpreterTool());

function systemPrompt(): string {
  return (
    "You are an AI code executor. When the user asks you to compute something, write the code and " +
    "RUN it in a sandbox using your tool, never compute by hand. After running, give a short, direct answer " +
    "with the result. Keep code minimal and print the result to stdout. " +
    "You have one sandbox: a fast Wasm interpreter. Use it for all code execution."
  );
}

type WireEvent =
  // An incremental slice of the model's text, streamed as it is generated.
  // `block` groups the deltas of one text block (unique within an assistant turn).
  | { t: "text_delta"; block: string; text: string }
  | {
      t: "tool_start";
      id: number;
      language: string;
      code: string;
      // Extra npm packages the model asked to bundle in (name -> semver), and the outbound
      // hosts it allow-listed for this run, shown in the UI alongside the code.
      packages?: Record<string, string>;
      allowedHosts?: string[];
      genMs: number;
    }
  | { t: "tool_end"; id: number; execMs: number; stdout: string; stderr: string; error: string | null }
  | { t: "done"; messages: Anthropic.MessageParam[] }
  | { t: "error"; error: string };

type Emit = (e: WireEvent) => void;

function clip(s: string, n: number): string {
  return s.length > n ? s.slice(0, n) + "…" : s;
}

function formatToolResult(stdout: string, stderr: string, error: string | null): string {
  const parts: string[] = [];
  if (stdout) parts.push("stdout:\n" + stdout);
  if (stderr) parts.push("stderr:\n" + stderr);
  if (error) parts.push("error: " + error);
  return parts.join("\n\n") || "(no output)";
}

// Runs the agentic loop, emitting each step as soon as it is available so the UI
// can render turn by turn (the code the moment the model writes it, then the
// output the moment the sandbox returns) instead of waiting for the whole
// transcript.
async function runAgent(prompt: string, history: Anthropic.MessageParam[], emit: Emit): Promise<void> {
  const apiKey = variables.get("anthropic_api_key") ?? "";
  const model = variables.get("model") ?? "claude-opus-4-8";
  const tsUrl = variables.get("ts_interpreter_url") ?? "http://ts-sandbox.spin.internal";
  const pyUrl = variables.get("py_interpreter_url") ?? "http://py-sandbox.spin.internal";
  const bundlerUrl = variables.get("bundler_url") ?? "http://bundler.spin.internal";

  const anthropic = new Anthropic({ apiKey });
  // The interpreter is two private, service-chained components, one per language, so pick
  // the client by the language the model chose. The JS interpreter also knows the bundler, so
  // model code can pull extra npm dependencies (see the tool's `dependencies` field).
  const interpreters: Record<Language, Interpreter> = {
    javascript: Interpreter.javascript({ baseUrl: tsUrl, bundlerUrl }),
    python: Interpreter.python({ baseUrl: pyUrl }),
  };

  log.info(`chat: model=${model} prompt=${JSON.stringify(clip(prompt, 80))}`);

  const tools: Anthropic.Tool[] = [INTERPRETER_TOOL];
  // Continue the conversation: prior turns + the new user message.
  const messages: Anthropic.MessageParam[] = [...history, { role: "user", content: prompt }];
  let toolId = 0;

  // Agentic loop: let the model call the sandbox tool until it produces a final answer.
  for (let turn = 0; turn < 8; turn++) {
    // Time the model "generating the code" (the latency of this Claude turn).
    const genStart = Date.now();
    // Stream the turn so the model's text appears token-by-token as it is
    // produced, instead of arriving in one buffered blob at the end of the turn.
    const stream = anthropic.messages.stream({
      model,
      max_tokens: 4096,
      system: systemPrompt(),
      tools,
      messages,
    });
    for await (const event of stream) {
      if (event.type === "content_block_delta" && event.delta.type === "text_delta" && event.delta.text) {
        emit({ t: "text_delta", block: `${turn}-${event.index}`, text: event.delta.text });
      }
    }
    const res = await stream.finalMessage();
    const genMs = Date.now() - genStart;
    log.info(
      `generate: turn=${turn} ${genMs}ms stop=${res.stop_reason} in=${res.usage.input_tokens} out=${res.usage.output_tokens}`,
    );

    const toolResults: Anthropic.ToolResultBlockParam[] = [];
    for (const block of res.content) {
      // Text blocks were already streamed above as text_delta events.
      if (block.type === "tool_use") {
        const input = block.input as {
          language: Language;
          code: string;
          dependencies?: Record<string, string>;
          allowedHosts?: string[];
          identity?: string;
          input?: HttpInput;
          kvEnabled?: boolean;
        };
        const id = toolId++;

        // Stream the code the moment the model produces it (before it runs), along with the
        // extra packages and allow-listed hosts it requested, so the UI can show them.
        emit({
          t: "tool_start",
          id,
          language: input.language,
          code: input.code,
          packages: input.language === "javascript" ? input.dependencies : undefined,
          allowedHosts: Array.isArray(input.allowedHosts) && input.allowedHosts.length ? input.allowedHosts : undefined,
          genMs,
        });

        let stdout = "";
        let stderr = "";
        let error: string | null = null;
        let execMs = 0;
        try {
          const t = Date.now();
          const runOpts = {
            allowedHosts: Array.isArray(input.allowedHosts) ? input.allowedHosts : [],
            identity: input.identity,
            kvEnabled: input.kvEnabled ?? false,
            packageJson:
              input.language === "javascript" && input.dependencies && Object.keys(input.dependencies).length
                ? { dependencies: input.dependencies }
                : undefined,
          };
          if (input.input) {
            const response = await interpreters[input.language].runHandler(input.code, input.input, runOpts);
            stdout = `HTTP ${response.status}\n${await response.text()}`;
          } else {
            const r = await interpreters[input.language].execute(input.code, runOpts);
            stdout = r.stdout;
            stderr = r.stderr;
            error = r.error ? `${r.error.name}: ${r.error.value}` : null;
          }
          execMs = Date.now() - t;
        } catch (e: any) {
          error = `sandbox error: ${String(e?.message ?? e)}`;
        }
        log.info(
          `execute: sandbox=wasm_interpreter lang=${input.language} exec=${execMs}ms ` +
          `${error ? "error=" + JSON.stringify(error) : "ok"} stdout=${stdout.length}b`,
        );

        // Stream the output the moment the sandbox returns.
        emit({ t: "tool_end", id, execMs, stdout, stderr, error });
        toolResults.push({
          type: "tool_result",
          tool_use_id: block.id,
          content: formatToolResult(stdout, stderr, error),
          is_error: error !== null,
        });
      }
    }

    messages.push({ role: "assistant", content: res.content });
    if (res.stop_reason !== "tool_use") {
      // Return the full updated history so the next turn continues the conversation.
      emit({ t: "done", messages });
      return;
    }
    messages.push({ role: "user", content: toolResults });
  }
  emit({ t: "done", messages });
}

const app = new Hono();

app.use(async (c: Context, next) => {
  initLogger();
  c.header("server", "ai-code-executor");
  await next();
});

// ---- access-token gate ----
// If the `access_token` variable is set, every route except health/auth requires a matching
// `app_token` cookie (set by POST /api/auth). An empty token disables the gate (local dev).
const AUTH_COOKIE = "app_token";
const accessToken = () => (variables.get("access_token") ?? "").trim();

app.use(async (c: Context, next) => {
  const path = new URL(c.req.url).pathname;
  if (path === "/api/health" || path === "/api/auth") return next();
  const token = accessToken();
  if (token && getCookie(c, AUTH_COOKIE) !== token) return c.text("Unauthorized", 401);
  return next();
});

app.get("/api/health", (c: Context) => {
  const token = accessToken();
  return c.json({
    ok: true,
    model: variables.get("model") ?? "claude-opus-4-8",
    authRequired: token !== "",
    authed: token === "" || getCookie(c, AUTH_COOKIE) === token,
  });
});

// Validate the access token and, on success, set the gate cookie.
app.post("/api/auth", async (c: Context) => {
  const token = accessToken();
  if (!token) return c.json({ ok: true }); // gate disabled
  let given = "";
  try {
    given = ((await c.req.json<{ token?: string }>()).token ?? "").trim();
  } catch {
    /* fall through to 401 */
  }
  if (given && given === token) {
    setCookie(c, AUTH_COOKIE, token, { path: "/", sameSite: "Lax", maxAge: 60 * 60 * 24 * 30 });
    return c.json({ ok: true });
  }
  return c.json({ ok: false, error: "invalid access token" }, 401);
});

app.post("/api/chat", async (c: Context) => {
  let prompt = "";
  let history: Anthropic.MessageParam[] = [];
  try {
    const body = await c.req.json<{
      prompt?: string;
      history?: Anthropic.MessageParam[];
    }>();
    prompt = (body.prompt ?? "").trim();
    if (Array.isArray(body.history)) history = body.history;
  } catch {
    return c.json({ error: "expected JSON body { prompt: string }" }, 400);
  }
  if (!prompt) return c.json({ error: "prompt is required" }, 400);

  // Stream the transcript as newline-delimited JSON: each event is flushed as
  // soon as it is produced, so the browser renders turn by turn.
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const emit: Emit = (e) => controller.enqueue(encoder.encode(JSON.stringify(e) + "\n"));
      try {
        await runAgent(prompt, history, emit);
      } catch (e: any) {
        log.error(`agent error: ${e?.stack ?? e}`);
        emit({ t: "error", error: String(e?.message ?? e) });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: { "content-type": "application/x-ndjson", "cache-control": "no-store" },
  });
});

fire(app);
