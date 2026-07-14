# App Builder: an agent that writes web apps and runs them live

A Spin application: Claude writes a self-contained web app (an HTTP handler serving an
HTML UI plus a JSON API), stores the code with [`@spinframework/sandbox`](../../sdk),
and serves each stored app live at its own URL, executed on demand in a private Wasm
sandbox. Click any app to keep editing it by chatting; each change updates it in place
at the same URL.

```
   public routes                              private components (no public route)
┌────────────┐  POST /api/generate  ┌─────────────────────┐  ts-sandbox.spin.internal  ┌─────────────┐
│  Nuxt SPA  │ ───────────────────▶ │  api (Hono, Wasm)   │ ─────────────────────────▶ │  ts-sandbox │
│  /...      │ ◀─────────────────── │  Claude loop +      │  py-sandbox.spin.internal  │  py-sandbox │
│  /a/<id>/ ─┼──── live app ──────▶ │  code store + serve │ ─────────────────────────▶ └─────────────┘
└────────────┘                      └─────────────────────┘        (code stored in the sandbox KV)
```

## How it works

1. **You describe an app.** The SPA posts your prompt to `POST /api/generate`.
2. **Claude writes it and publishes it.** The model writes one HTTP handler (HTML UI
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
scoped KV (the code store), and per-language service chaining. Only the sandbox's
request `input.path` was added so a stored app can route on sub-paths.

Generated apps can persist state, too. Each runs with its own private, scoped
[Spin KV](https://spinframework.dev/v4/kv-store-api-guide): the `default` store, which
the sandbox scopes per app (`identity = code:<id>`), isolated from other apps and from
the code registry. So a counter or a saved list survives across requests. The model is
told to reach it via `openDefault()` (JS) / `key_value.open_default()` (Python).

## The two surfaces (one component)

The `api` component is bound to two HTTP triggers (the control plane and the live-app
surface) and routes internally with Hono:

| Route | Purpose |
|---|---|
| `POST /api/generate` | `{prompt, id?, history?}` runs the Claude loop, `create_app` saves via `store.save({id})`, and `{id, url}` streams back as NDJSON. An `id` means edit in place. |
| `GET /api/apps` | list stored apps (`store.list()`) |
| `GET /api/apps/<id>` | one app's record (source + saved conversation); backs the Code view and the restored chat |
| `PUT /api/apps/<id>/convo` | save an app's conversation (transcript + model history), so it survives reloads |
| `GET /a/<id>` | 302 to `/a/<id>/` (trailing slash so the app's relative URLs resolve) |
| `ALL /a/<id>/...` | load the app's code, run it in the sandbox, forward its `Response` |

A served app is mounted under `/a/<id>/`: the api strips that prefix and passes the
remainder as the request path. Generated apps use relative URLs (`fetch('data')`), and
the api also injects `<base href="/a/<id>/">` into served HTML as a backstop.

## Configuration (Spin application variables)

| Variable | Default | Notes |
|---|---|---|
| `anthropic_api_key` | (required, secret) | `SPIN_VARIABLE_ANTHROPIC_API_KEY=sk-ant-…` |
| `model` | `claude-opus-4-8` | any Claude model id |
| `ts_interpreter_url` | `http://ts-sandbox.spin.internal` | private JS/TS interpreter component |
| `py_interpreter_url` | `http://py-sandbox.spin.internal` | private Python interpreter component |
| `access_token` | empty = open | set `SPIN_VARIABLE_ACCESS_TOKEN=…` to gate the UI, API and live apps behind an access-token page |

## Run it

1. Init the submodule (the Python interpreter's prebuilt deps):
   ```bash
   (cd ../.. && git submodule update --init)
   ```
2. Build and run:
   ```bash
   SPIN_VARIABLE_ANTHROPIC_API_KEY=sk-ant-... spin up --build
   ```
3. Open the served URL, describe an app (e.g. "a click counter with a /data JSON
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
api/               Hono component: the Claude loop, the code store, and the live-serve routes
  src/index.ts     imports @spinframework/sandbox/{interpreter,store}
ui/                Nuxt SPA: build gallery + create flow
  pages/index.vue  the gallery + "describe an app" UI
../../ts-sandbox   private JS/TS interpreter, built in place, reached via ts-sandbox.spin.internal
../../py-sandbox   private Python interpreter, built in place, reached via py-sandbox.spin.internal
```
