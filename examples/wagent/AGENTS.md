# AGENTS.md — Wagent example

A Spin app that puts a Claude tool-use loop in front of the Wasm code sandbox. See
[README.md](README.md) for the full picture; this covers the layout and the invariants.

## Components

Four components; only `ui` and `api` have public routes.

- **`api/`** (public `/api/...`) — a Hono component (TypeScript → Wasm via esbuild + `j2w`).
  It runs the agent loop in [`api/src/index.ts`](api/src/index.ts): one tool
  (`run_in_wasm_interpreter`), the system prompt, and the streaming NDJSON protocol. It
  imports the sandbox client from the repo's [`sdk/`](../../sdk) via a relative path
  (`../../../../sdk/src/...`) and holds one `Interpreter` per language, each pointed at a
  private interpreter component's `spin.internal` URL.
- **`ui/`** (public `/...`) — a Nuxt SPA served by the Spin static fileserver. Copied
  **verbatim** from the upstream example; backend-agnostic, and its container toggle stays
  hidden because `/api/health` reports `containerEnabled: false`.
- **`ts-sandbox` / `py-sandbox`** (**private**, `route = { private = true }`) — this repo's
  interpreter components, built in place from `../../ts-sandbox` and `../../py-sandbox`.
  They have **no public route** — reachable only from `api` via service chaining
  (`ts-sandbox.spin.internal` / `py-sandbox.spin.internal`), which the API lists in its
  `allowed_outbound_hosts`.

## Invariants

- **The wire protocol is a superset.** `tool_end` carries `startupMs` / `reused` / `kept`
  even though the interpreter always sends `null` / `false`. Keep them — the UI reads them,
  and a future container/microVM backend will populate them without a protocol change.
- **Streaming must stay incremental.** Every `emit()` is a flush point; don't buffer the
  transcript. `GET /api/stream-test` is the check.
- **Model output is untrusted.** The UI renders it with `html: false` + link-scheme
  allowlisting + registered-language-only highlighting. Don't loosen that.

## Build & run

Self-contained — the interpreters are components of this app, so nothing runs separately.

```bash
(cd ../.. && git submodule update --init)                    # py-sandbox's prebuilt deps
SPIN_VARIABLE_ANTHROPIC_API_KEY=sk-ant-... spin up --build   # builds all 4 components + serves
```

`ts_interpreter_url` / `py_interpreter_url` default to the components' `spin.internal` hosts.
Override only to point the API at an external sandbox instead.
