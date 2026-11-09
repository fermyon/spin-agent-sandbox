# @spinframework/sandbox

An extensible TypeScript client for sandboxed code execution, consumed from a Spin
application. It ships one backend today, the Wasm code interpreter (this repo's
`ts-sandbox` / `py-sandbox` components), and is built so another backend can be added
later without changing the portable surface.

## The portable contract

Author a tool against the `CodeRunner` interface and it runs unchanged on any backend;
the host injects the concrete client at the edge.

```ts
import type { CodeRunner } from "@spinframework/sandbox/core";
import { Interpreter } from "@spinframework/sandbox/interpreter";

// A tool depends only on the interface, so the backend can be swapped without touching it.
async function compute(runner: CodeRunner, code: string) {
  const r = await runner.run(code, { lang: "python", allowedHosts: [] });
  if (r.error) throw new Error(`${r.error.name}: ${r.error.value}`);
  return r.stdout;
}

const runner = Interpreter.python({ baseUrl: "http://py-sandbox.spin.internal" });
console.log(await compute(runner, "print(6 * 7)"));
```

`run()` returns data (`{ stdout, stderr, results, error? }`): an exception inside the
sandbox is `Result.error`, not a thrown error. `run()` only throws for transport, auth,
or validation failures.

## Agent tools

`interpreterTool()` returns `{ name, description, inputSchema }` for the languages served
by one interpreter endpoint. `inputSchema` is a strict [Zod](https://zod.dev) schema, which
is the single source of truth: frameworks that take Zod (such as the Vercel AI SDK) use it
directly, and the Anthropic and OpenAI adapters derive JSON Schema from it.

Every agent setup has the same three parts: the `Interpreter` clients, the tool, and an
`execute` function where the developer sets execution policy.

```ts
import { Interpreter } from "@spinframework/sandbox/interpreter";
import { interpreterTool, type InterpreterToolInput } from "@spinframework/sandbox/tools";

// One client per private sandbox component.
const interpreters = {
  javascript: Interpreter.javascript({ baseUrl: "http://ts-sandbox.spin.internal" }),
  python: Interpreter.python({ baseUrl: "http://py-sandbox.spin.internal" }),
};

// A Zod-backed tool, limited to the languages you serve.
export const sandboxTool = interpreterTool({ languages: ["javascript", "python"] });

// Agent system prompt. Keep the floating-promise rule: un-awaited work is discarded silently.
export const SYSTEM_PROMPT =
  "Write code and run it in the sandbox; never compute by hand. Print results to stdout. " +
  "In JavaScript, await all asynchronous work: never leave floating promises (an un-awaited " +
  "async call, IIFE, or timer), because work still running when the program ends is discarded.";

// The developer sets execution policy; model arguments never reach these options.
export async function runSandbox(args: InterpreterToolInput, sessionId: string): Promise<string> {
  const opts = {
    allowedHosts: ["https://api.example.com"],
    kvEnabled: true,
    identity: sessionId,
    packageJson: args.language === "javascript" && args.dependencies ? { dependencies: args.dependencies } : undefined,
  };
  const runner = interpreters[args.language];
  if (args.input) {
    const res = await runner.runHandler(args.code, args.input, opts);
    return `HTTP ${res.status}\n${await res.text()}`;
  }
  const r = await runner.execute(args.code, opts);
  return r.error ? `${r.stdout}\n${r.stderr}\nerror: ${r.error.name}: ${r.error.value}` : r.stdout;
}
```

The input type narrows to the configured languages: with `languages: ["python"]`, `language`
is `"python"` and `dependencies` does not exist, matching the schema.

The model supplies `language`, `code`, optional HTTP `input`, and JavaScript `dependencies`. The developer sets `allowedHosts`, `kvEnabled`, and `identity` in execution options. Validate tool arguments with `inputSchema.safeParse(args)`. The schema is strict, so it rejects unknown fields such as `allowedHosts`. Never spread model arguments into those options. Keep sandbox endpoints private.

### Vercel AI SDK

Pass the Zod schema as-is. The AI SDK validates the model's arguments with it, and `execute`
receives them typed.

```ts
import { ToolLoopAgent, tool, stepCountIs } from "ai";
import { anthropic } from "@ai-sdk/anthropic";

const sessionId = crypto.randomUUID();
const agent = new ToolLoopAgent({
  model: anthropic("claude-sonnet-5-5"),
  instructions: SYSTEM_PROMPT,
  tools: {
    [sandboxTool.name]: tool({
      description: sandboxTool.description,
      inputSchema: sandboxTool.inputSchema,
      execute: (args) => runSandbox(args, sessionId),
    }),
  },
  stopWhen: stepCountIs(10),
});

const { text } = await agent.generate({ prompt: "What is the 50th Fibonacci number?" });
```

### Anthropic SDK

`toAnthropicTool()` derives the JSON Schema from the Zod schema. Validate each `tool_use`
with the same Zod schema before running it.

```ts
import Anthropic from "@anthropic-ai/sdk";
import { toAnthropicTool } from "@spinframework/sandbox/tools";

const client = new Anthropic();
const sessionId = crypto.randomUUID();
const tools = [toAnthropicTool(sandboxTool)];
const messages: Anthropic.MessageParam[] = [{ role: "user", content: "What is the 50th Fibonacci number?" }];

for (let step = 0; step < 10; step++) {
  const res = await client.messages.create({
    model: "claude-sonnet-5-5",
    max_tokens: 4096,
    system: SYSTEM_PROMPT,
    tools,
    messages,
  });
  messages.push({ role: "assistant", content: res.content });
  if (res.stop_reason !== "tool_use") break;

  const results: Anthropic.ToolResultBlockParam[] = [];
  for (const block of res.content) {
    if (block.type !== "tool_use") continue;
    const parsed = sandboxTool.inputSchema.safeParse(block.input); // rejects allowedHosts and other unknown fields
    results.push(
      parsed.success
        ? { type: "tool_result", tool_use_id: block.id, content: await runSandbox(parsed.data, sessionId) }
        : { type: "tool_result", tool_use_id: block.id, content: parsed.error.message, is_error: true },
    );
  }
  messages.push({ role: "user", content: results });
}
```

### OpenAI and plain JSON Schema

`toOpenAITool(sandboxTool)` returns OpenAI's function-tool shape, and `toToolDefinition()`
returns the provider-neutral JSON Schema form. The adapters also accept a hand-written
`ToolDefinition` with a JSON Schema `inputSchema`.

### Identity and session isolation

An `identity` selects a KV namespace, shared across languages when KV is enabled. Omit it for a new ID per call; reuse it for shared storage. Every execution is a fresh Wasm instance: variables and globals never persist. The model never sees or chooses the identity. To let an agent keep state across calls, generate one ID per conversation and pass it with `kvEnabled: true`:

```ts
const sessionId = crypto.randomUUID();

await runner.run(args.code, {
  lang: args.language,
  input: args.input,
  allowedHosts: ["https://api.example.com"],
  kvEnabled: true,
  identity: sessionId,
});
```

For reuse across chat turns, store the UUID server-side with its owner and check ownership on every request. IDs select namespaces; they are not authorization. Never accept raw IDs from model output or unchecked client input. Use separate IDs for separate users/conversations, and define quotas and cleanup: abandoning an ID does not delete its KV data. Resumable side tracks and KV cloning are not provided.

## Backends

- **`interpreter`**: a thin client over a sandbox component's `POST /ts/run`
  (JS/TS) and `/py/run` (Python) routes. Single-shot, buffered, default-deny egress,
  plus a scoped KV store (`Interpreter.kv(namespace)`).

  The intended deployment is two private components (ts-sandbox, py-sandbox) reached
  via service chaining. `.spin.internal` resolves to a component id, so each language
  has its own host: use one `Interpreter` per language, each `baseUrl` pointed at its
  component:

  ```ts
  const js = Interpreter.javascript({ baseUrl: "http://ts-sandbox.spin.internal" });
  const py = Interpreter.python({ baseUrl: "http://py-sandbox.spin.internal" });
  await js.execute(code); // ts-sandbox
  await py.execute(code); // py-sandbox
  ```

  `Interpreter.javascript({ baseUrl })` is shorthand for `new Interpreter({ baseUrl,
  lang: "javascript" })`. Language-bound clients reject a mismatched `lang` option. Create an unbound
  `new Interpreter({ baseUrl })` only when one endpoint really serves both `/ts` and
  `/py`; scoped KV and npm bundling require that unbound client or a JavaScript client.

  To invoke an HTTP handler, use `runHandler()` rather than manually constructing an
  envelope. It returns the handler's `Response`, including a streamed response body:

  ```ts
  const response = await py.runHandler(
    `def handle_request(request): return (200, {}, "hello")`,
    { path: "/hello" },
  );
  console.log(await response.text());
  ```

  See [`examples/ai-code-executor`](../examples/ai-code-executor). (A single combined
  app that routes both `/ts` and `/py` by path also works; then one `baseUrl` at the
  app suffices.)

## Extending it

The library ships no other-backend types, but it is designed to gain them:

- **`core`** (`./core`) is the only shared surface: `CodeRunner`, `RunOpts`, `Result`,
  and `Caps`. It carries no transport and nothing interpreter-specific.
- **`Backend`** is a widenable union (`"interpreter" | (string & {})`), so a new
  backend names itself without a breaking change.
- **`Caps`** already describes capabilities a heavier backend would light up
  (`filesystem`, `sessions`, `exec`, `lifecycle`, `arbitraryImage`, `realTimeout`), so
  a tool can branch on them at runtime; native TypeScript tools rely on compile-time
  method absence instead.

To add one: create a module under `src/`, implement `CodeRunner`, declare its `Caps`,
and export it from `src/index.ts`. Nothing in `core` or `interpreter` has to change.

## Develop

```bash
npm install
npm run typecheck    # tsc, incl. the compile-time contract assertions in test/types.assert.ts
npm test             # node --test (runs the .ts tests directly)
npm run check        # both
```

`npm test` runs the TypeScript tests through Node's built-in runner with no build step, so
it needs Node 24+ (native type stripping, plus `--test` glob support).

To test the SDK against real sandbox components, first start the root application, then run:

```bash
SANDBOX_BASE_URL=http://127.0.0.1:3007 npm run test:components
```
