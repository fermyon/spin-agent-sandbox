# AGENTS.md: App Builder example

A Spin app where an LLM generates a self-contained web app (one HTTP handler), stores
the code via [`@spinframework/sandbox`](../../sdk), and serves each stored app live at
`/a/<id>/`. See [README.md](README.md) for the full picture; this covers the layout and
the invariants.

## Components

Five components; only `ui` and `api` have public routes.

- **`api/`**: a Hono component (TypeScript to Wasm via esbuild + `j2w`) bound to two
  HTTP triggers: `/api/...` (control plane) and `/a/...` (live apps). It runs the
  model loop (provider chosen at build time; see `src/llm/` and `build.mjs`), owns a
  `KvCodeStore` (from `@spinframework/sandbox/store`), and serves
  stored apps with `serveStoredCode` plus a presentation layer (`<base>` injection,
  crash page, hardening headers).
- **`ui/`** (public `/...`): a Nuxt SPA served by the Spin static fileserver: a gallery
  of stored apps and a "describe an app" create flow that streams the generation and
  links to the live URL.
- **`ts-sandbox` / `py-sandbox`** (private, `route = { private = true }`): this repo's
  interpreter components, built in place from `../../`. They execute the stored handler
  and hold the code store in their scoped `default` KV. Reachable only from `api` via
  service chaining.
- **`bundler`** (private): bundles a JS app's npm `dependencies` once at publish time;
  the store keeps both the editable source and the self-contained bundle.

## Invariants

- **Two triggers, one component.** `/api/...` and `/a/...` both target `api`. Spin
  matches the more specific route first (both beat the `ui` catch-all `/...`). If a
  Spin version rejects duplicate component targets, fall back to a single broad route
  or a second component.
- **The api holds no KV.** Code lives in the sandbox's KV via the SDK (`KvCodeStore`
  runs its ops as JS snippets on `ts-sandbox`). Only the sandboxes declare
  `key_value_stores`.
- **`serveStoredCode` forwards verbatim.** It returns the sandbox's raw `Response`
  (`Interpreter.runRaw`). All presentation (base tag, error page, headers) is added by
  the api, not the SDK, so the SDK stays reusable.
- **Served apps are mounted under `/a/<id>/`.** The api strips that prefix into the
  request `input.path`; generated apps must use relative URLs. The 302 on `/a/<id>`
  guarantees the trailing slash.
- **Apps get their own scoped KV for persistence.** `serveStoredCode` runs each app
  with `identity: code:<id>`, so its access to the Spin `default` KV store is scoped
  per app, isolated from other apps and from the `apps` code registry (length-prefix
  scoping prevents cross-app collisions). The generation prompt points apps at
  `openDefault()` / `key_value.open_default()`; see the
  [Spin KV guide](https://spinframework.dev/v4/kv-store-api-guide).
- **Model output is untrusted.** It runs same-origin in the browser (new-tab full
  page). The `/api/*` referer guard and `nosniff` are demo-grade; production must use
  a separate origin.
- **Streaming stays incremental.** `POST /api/generate` emits NDJSON
  `WireEvent`s flushed as produced, surfacing each intermediate step: `text_delta`
  (reasoning), `tool_start`, `tool_delta` (the app code streaming in, decoded live from
  the `create_app` tool call's partial JSON), `tool_saving`, `app_saved`, then `done`
  or `error`. It accepts `{prompt, id?, history?}`: an `id` edits that app in place
  (seeded with its current code when `history` is empty), `create_app` saves via
  `store.save({ id })` so the URL is stable, and `done` returns the updated history for
  the next turn.
