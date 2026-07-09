# AI Code Executor — an agent whose tool is a sandbox

A Spin application: **Claude writes code and runs it in the fast Wasm interpreter**,
executes it through [`@spinframework/sandbox`](../../sdk), and streams the transcript
back to a chat UI.

```
      public routes                          private components (no public route)
┌──────────────┐  POST /api/chat  ┌─────────────────────┐  ts-sandbox.spin.internal  ┌─────────────┐
│  Nuxt SPA    │ ───────────────▶ │  api (Hono, Wasm)   │ ─────────────────────────▶ │  ts-sandbox │
│  /...        │ ◀─────────────── │  Claude tool loop   │  py-sandbox.spin.internal  │  py-sandbox │
└──────────────┘  NDJSON (live)   └─────────────────────┘ ─────────────────────────▶ └─────────────┘
```

The two interpreters (`ts-sandbox`, `py-sandbox`) are **private components of this app** —
`route = { private = true }`, so they have no public route and are reachable **only** from
the `api` component via local **service chaining** (`<component>.spin.internal`). The API
depends on the sandbox client from this repo ([`@spinframework/sandbox`](../../sdk), a local
`file:` dependency) and holds one `Interpreter` per language, each pointed at its component's
internal URL, calling `Interpreter.run()`.

## How it works — the CodeAct pattern

This example is a concrete **CodeAct** agent: the model's *action is code it writes and runs*,
not a call into a fixed tool set. It reasons, emits a program, runs it in a sandbox, observes
the real output, and repeats until it can answer — the standard agentic loop with dynamic code
execution as the action. (Background:
[Why: CodeAct](../../README.md#why-codeact).)

1. **You ask** a question in the chat.
2. **Claude writes code** — it picks Python or JavaScript and produces a small program,
   streamed into the UI as it is typed.
3. **A private Wasm sandbox runs it** — the code executes in an isolated WebAssembly
   interpreter (`ts-sandbox` / `py-sandbox`) with no filesystem, no shell, and default-deny
   egress. Because model-written code is untrusted, the sandbox is a **private component**
   reached only over internal service chaining — never a public endpoint.
4. **The output loops back** — stdout / stderr / errors return to Claude (the *observation*),
   which fixes-and-re-runs or, once satisfied, writes the final answer.

Why let the model write code instead of only calling fixed tools? An **open-ended action
space** (anything the sandbox can run, not just pre-bundled tools), **fewer model round-trips**
(control flow lives in one program, not N tool calls), and **verifiable, deterministic**
results (a real interpreter computes the answer; the model doesn't guess). The trade-off —
untrusted generated code — is contained by the **isolated, private sandbox**. The whole loop
streams live; the UI's **How it works** button shows the same flow as a diagram.

## The tool

The model is given one tool and calls it per task (it shows up in the UI as a badge on each
step):

- **`run_in_wasm_interpreter`** — fast, lightweight, pre-bundled libs, no filesystem/shell.
  Each call runs through `Interpreter.run()`; the `{stdout, stderr, error}` is fed back to
  the model, which loops until it has an answer.

## Streaming + timing

`/api/chat` responds with a **newline-delimited JSON (NDJSON) stream**, not one buffered
blob — the server flushes each event the moment it is produced, so the UI renders turn by
turn:

- `{"t":"text_delta", block, text}` — a slice of the model's text, so the answer types out
  token-by-token (a blinking cursor marks the block still being written).
- `{"t":"tool_start", id, language, code, genMs}` — the code, the moment the model
  writes it (the card appears with "running…").
- `{"t":"tool_end", id, execMs, stdout, stderr, error}` — the output,
  the moment the sandbox returns (`genMs` = the model turn latency that produced the code,
  `execMs` = the interpreter run).
- `{"t":"done"}` / `{"t":"error"}`.

The incremental flush is **verified**: `GET /api/stream-test` emits a line every 400 ms and
`curl -N` receives them spread over time, confirming Spin/StarlingMonkey forwards a guest
streaming body chunk-by-chunk. Each tool card shows **generated in** (`genMs`, the Claude
turn latency) and **ran in** (`execMs`, the interpreter request).

### Markdown + syntax highlighting

The model's text is rendered as **Markdown** with
[markdown-it](https://github.com/markdown-it/markdown-it) and every code block is
**syntax-highlighted** with [highlight.js](https://highlightjs.org/), incrementally as the
text streams in. Because the HTML comes from model output it is treated as untrusted:
`html: false` (raw HTML escaped), dangerous link schemes rejected, and a fenced block's
language is only echoed into the DOM when it matches a *registered* highlight.js language.

## Configuration (Spin application variables)

| Variable | Default | Notes |
|---|---|---|
| `anthropic_api_key` | — (**required, secret**) | `SPIN_VARIABLE_ANTHROPIC_API_KEY=sk-ant-…` |
| `model` | `claude-opus-4-8` | any Claude model id |
| `ts_interpreter_url` | `http://ts-sandbox.spin.internal` | the private JS/TS interpreter component |
| `py_interpreter_url` | `http://py-sandbox.spin.internal` | the private Python interpreter component |
| `access_token` | — *(empty = open)* | set `SPIN_VARIABLE_ACCESS_TOKEN=…` to gate the UI + API behind an access-token page |

The interpreter URLs default to service chaining, so nothing needs to run separately — the
interpreters are built and served as part of this app. Override them only to point at an
external sandbox instead.

## Run it

Everything is one app now — no separate interpreter to start.

1. **Init the submodule** (the Python interpreter's prebuilt deps):
   ```bash
   (cd ../.. && git submodule update --init)
   ```
2. **Build**: `spin build` — builds all four components: the API (esbuild → `j2w`), the UI
   (`nuxt generate`), and the two private interpreters (this repo's `ts-sandbox` and
   `py-sandbox`, built in place from `../../`).
3. **Run** (the API key comes from the environment):
   ```bash
   SPIN_VARIABLE_ANTHROPIC_API_KEY=sk-ant-... spin up
   ```
4. Open the served URL and click a prompt, e.g. *"What is the factorial of 15?"* — the model
   writes Python/JS and runs it in the matching private interpreter, then answers.

## Layout

```
spin.toml          wires 4 components: public ui + api, private ts-sandbox + py-sandbox
api/               Hono component — the Claude tool-use loop + the interpreter tool
  src/index.ts     the agent; imports @spinframework/sandbox; one Interpreter client per component
ui/                Nuxt SPA — chat (near-verbatim from upstream; one filesystem prompt swapped)
  pages/index.vue  the chat UI
../../ts-sandbox   PRIVATE JS/TS interpreter — built in place, reached via ts-sandbox.spin.internal
../../py-sandbox   PRIVATE Python interpreter — built in place, reached via py-sandbox.spin.internal
```
