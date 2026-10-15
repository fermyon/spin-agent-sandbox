# App Builder: an agent that writes web apps and runs them live

A Spin application: an LLM (via the Anthropic Messages API by default, or the OpenAI Responses API) writes a
self-contained web app (an HTTP handler serving an
HTML UI plus a JSON API), stores the code with [`@spinframework/sandbox`](../../sdk),
and serves each stored app live at its own URL, executed on demand in a private Wasm
sandbox. Click any app to keep editing it by chatting; each change updates it in place
at the same URL.

```
   public routes                              private components (no public route)
┌────────────┐  POST /api/generate  ┌─────────────────────┐  ts-sandbox.spin.internal  ┌─────────────┐
│  Nuxt SPA  │ ───────────────────▶ │  api (Hono, Wasm)   │ ─────────────────────────▶ │  ts-sandbox │
│  /...      │ ◀─────────────────── │  LLM loop +         │  py-sandbox.spin.internal  │  py-sandbox │
│  /a/<id>/ ─┼──── live app ──────▶ │  code store + serve │ ─────────────────────────▶ └─────────────┘
└────────────┘                      └─────────────────────┘        (code stored in the sandbox KV)
```

## How it works

1. **You describe an app.** The SPA posts your prompt to `POST /api/generate`.
2. **The model writes it and publishes it.** It writes one HTTP handler (HTML UI
   plus JSON API) and calls the `create_app` tool. The api stores the code via the
   SDK's `KvCodeStore` (persisted in the sandbox's scoped KV) and streams back the new
   app's URL. A JavaScript app that lists npm `dependencies` is bundled once here, at
   publish time, by the private bundler component.
3. **The app runs live at `/a/<id>/`.** Opening that URL loads the stored code, runs it
   in the matching private sandbox (`serveStoredCode`, then `Interpreter.runRaw`), and
   returns the handler's `Response` verbatim: HTML for the page, JSON for its API
   sub-paths.
4. **Keep editing (vibe coding).** Click an app to reopen it in Chat, with its saved
   conversation restored and its source in the Code tab, both loaded from the backend
   (`GET /api/apps/<id>`), so they survive switching apps and reloads. Describe
   changes; each `create_app` updates the app in place (`store.save({ id })`), so the
   live URL never changes, and the conversation is re-saved after every turn
   (`PUT /api/apps/<id>/convo`). The appbar's Chat / Code toggle flips between the
   conversation (with a per-edit diff on each turn) and the current full source.

Everything reuses the repo's primitives: the sandbox's HTTP-handler execution, its
scoped KV (the code store), and per-language service chaining. The sandbox's request
`input.path` lets a stored app route on sub-paths.

Generated apps can persist state, too. Each runs with its own private, scoped
[Spin KV](https://spinframework.dev/v4/kv-store-api-guide): the `default` store, which
the sandbox scopes per app (`identity = code:<id>`), isolated from other apps and from
the code registry. So a counter or a saved list survives across requests. The model is
told to reach it via `openDefault()` (JS) / `key_value.open_default()` (Python) and to
set `kvEnabled: true` in `create_app`; KV is off for apps that don't.

## The two surfaces (one component)

The `api` component is bound to two HTTP triggers (the control plane and the live-app
surface) and routes internally with Hono:

| Route | Purpose |
|---|---|
| `POST /api/generate` | `{prompt, id?, history?}` runs the model loop, `create_app` saves via `store.save({id})`, and `{id, url}` streams back as NDJSON. An `id` means edit in place. |
| `GET /api/apps` | list stored apps (`store.list()`) |
| `GET /api/apps/<id>` | one app's record (source + saved conversation); backs the Code view and the restored chat |
| `PUT /api/apps/<id>/convo` | save an app's conversation (transcript + model history), so it survives reloads |
| `GET /a/<id>` | 302 to `/a/<id>/` (trailing slash so the app's relative URLs resolve) |
| `ALL /a/<id>/...` | load the app's code, run it in the sandbox, forward its `Response` |

A served app is mounted under `/a/<id>/`: the api strips that prefix and passes the
remainder as the request path. Generated apps use relative URLs (`fetch('data')`), and
the api also injects `<base href="/a/<id>/">` into served HTML as a backstop.

## Choosing the LLM provider

The provider is fixed at build time with a [Spin build
profile](https://spinframework.dev/v4/build#building-with-profiles), so only its SDK is
bundled into the `api` component: the default build uses the Anthropic Messages API
(`api/dist/api-anthropic.wasm`), and `--profile openai` uses the OpenAI Responses API,
statelessly (`api/dist/api-openai.wasm`). The provider code lives in
[`api/src/llm/`](api/src/llm). Both builds read the same variables: the profile picks the API
format, `model_base_url` picks the server and is also the `api` component's outbound
allow-list entry.

Saved conversations are tagged with the provider that produced them. Reopening an app
under the other build starts a fresh edit session from the app's current code.

## Configuration (Spin application variables)

| Variable | Default | Notes |
|---|---|---|
| `model_base_url` | (required) | origin (no path) of the model server, `SPIN_VARIABLE_MODEL_BASE_URL=<model-base-url>`; also the `api` component's outbound allow-list entry |
| `model_api_key` | empty (secret) | `SPIN_VARIABLE_MODEL_API_KEY=<api-key>`, the key for the model server |
| `model` | empty | empty = `claude-opus-4-8` (Anthropic) or `gpt-5` (OpenAI) |
| `ts_interpreter_url` | `http://ts-sandbox.spin.internal` | private JS/TS interpreter component |
| `py_interpreter_url` | `http://py-sandbox.spin.internal` | private Python interpreter component |
| `bundler_url` | `http://bundler.spin.internal` | private experimental bundler component |
| `log_level` | `info` | `error`, `warn`, `info`, `debug`, or `trace` |
| `access_token` | empty = open | set `SPIN_VARIABLE_ACCESS_TOKEN=…` to gate the UI, API and live apps behind an access-token page |
| `esm_base_url` | `https://esm.sh` | origin of the esm.sh server used by the experimental bundler when an app lists npm `dependencies`; point it at a [self-hosted instance](https://github.com/esm-dev/esm.sh/blob/main/HOSTING.md) if you prefer |

## Run it

1. Build and run:
   ```bash
   export SPIN_VARIABLE_MODEL_BASE_URL=<model-base-url> SPIN_VARIABLE_MODEL_API_KEY=<api-key>
   spin up --build                    # Anthropic Messages API
   spin up --profile openai --build   # OpenAI Responses API
   ```
   For a local model, run [Ollama](https://ollama.com) (it serves both APIs and ignores
   the key) and point either build at it, e.g. `spin up --profile openai --build
   --variable model_base_url=http://localhost:11434 --variable model=qwen3:4b`.
2. Open the served URL, describe an app (e.g. "a click counter with a /data JSON
   endpoint"), then click "Open live". It opens the generated app in a new tab,
   running in the sandbox.

## Security: read before deploying

Generated code is untrusted, and a stored app is served same-origin at `/a/<id>`. For a
local demo this is fine and hardened lightly: served responses get
`X-Content-Type-Options: nosniff`, and `/api/*` rejects requests whose referer is
inside a live app (so an app's JS can't drive the control plane). The sandbox denies
the app all network egress unless the app declared `allowedHosts` at publish time.

In production, serve apps from a separate origin or subdomain (e.g.
`*.apps.example.com`) so the browser's same-origin policy isolates them from the
control-plane API. Do not rely on the referer guard alone.

## Layout

```
spin.toml          5 components: public ui + api (two triggers), private ts-sandbox + py-sandbox + bundler
api/               Hono component: the LLM loop, the code store, and the live-serve routes
  src/index.ts     imports @spinframework/sandbox/{interpreter,store}
  src/llm/         provider interface + Anthropic and OpenAI implementations (one bundled per build)
ui/                Nuxt SPA: build gallery + create flow
  pages/index.vue  the gallery + "describe an app" UI
../../packages/typescript/sandbox   private JS/TS interpreter, built in place, reached via ts-sandbox.spin.internal
../../py-sandbox   private Python interpreter, built in place, reached via py-sandbox.spin.internal
../../packages/typescript/bundler   experimental private npm bundler, built in place, reached via bundler.spin.internal
```
