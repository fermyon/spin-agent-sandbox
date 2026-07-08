# AGENTS.md — AI Code Executor example

A Spin app that puts a Claude tool-use loop in front of the Wasm code sandbox. See
[README.md](README.md) for the full picture; this covers the layout and the invariants.

## Components

Four components; only `ui` and `api` have public routes.

- **`api/`** (public `/api/...`) — a Hono component (TypeScript → Wasm via esbuild + `j2w`).
  It runs the agent loop in [`api/src/index.ts`](api/src/index.ts): one tool
  (`run_in_wasm_interpreter`), the system prompt, and the streaming NDJSON protocol. It
  depends on the sandbox client [`@spinframework/sandbox`](../../sdk) (a local `file:`
  dependency in [`api/package.json`](api/package.json)) and holds one `Interpreter` per
  language, each pointed at a private interpreter component's `spin.internal` URL.
- **`ui/`** (public `/...`) — a Nuxt SPA served by the Spin static fileserver. Adapted from
  the upstream example — trimmed to the interpreter-only surface (a filesystem-assuming
  prompt was swapped for an interpreter-friendly one).
- **`ts-sandbox` / `py-sandbox`** (**private**, `route = { private = true }`) — this repo's
  interpreter components, built in place from `../../ts-sandbox` and `../../py-sandbox`.
  They have **no public route** — reachable only from `api` via service chaining
  (`ts-sandbox.spin.internal` / `py-sandbox.spin.internal`), which the API lists in its
  `allowed_outbound_hosts`.

## Invariants

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
