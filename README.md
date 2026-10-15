# Spin Sandbox

Run untrusted JavaScript/TypeScript and Python in isolated WebAssembly components on
[Spin](https://spinframework.dev). This repository includes the sandboxes, an npm
[bundler](packages/typescript/bundler), the [`@spinframework/sandbox`](sdk) client,
and [examples](examples).

## What this repository contains

- [`ts-sandbox`](packages/typescript/sandbox) and [`py-sandbox`](py-sandbox): run code over HTTP.
- [`bundler`](packages/typescript/bundler): bundle extra npm dependencies for TypeScript.
- [`sdk`](sdk) and [`examples`](examples): embed a sandbox in an agent or Spin app.

## Why CodeAct

A powerful way to use a model is CodeAct: rather than only calling a fixed set of
tools, let its action be code it writes and runs. The model generates a program, runs
it, reads the output, and repeats.

CodeAct's hard requirement is an untrusted code sandbox, which is what this repo provides.
[examples/ai-code-executor](examples/ai-code-executor) is a complete CodeAct agent
built on it.

> **References:** [ReAct](https://arxiv.org/pdf/2210.03629) (ICLR 2023) ·
> [CodeAct](https://machinelearning.apple.com/research/codeact) (Apple, 2024;
> [arXiv](https://arxiv.org/pdf/2402.01030)).

## Prerequisites

- [Spin](https://spinframework.dev) CLI;
- Rust and the Preview 2 target: `rustup target add wasm32-wasip2`;
- Node.js and npm;
- Python 3.12;
- Bytecode Alliance [`wac`](https://github.com/bytecodealliance/wac) `>= 0.12.0` and
  [`wasm-tools`](https://github.com/bytecodealliance/wasm-tools) `>= 1.246.1` on `PATH`.

## Quick start

Build and serve all components:

```bash
spin up --build
```

## How it works

An agent or application sends code and a `sandboxId` to either the JavaScript or Python sandbox. The sandbox runs either a script or HTTP handler, returning captured output or the handler response. Use the SDK or Spin service chaining to keep sandbox endpoints private.

## Architecture

Each deployed sandbox composes `guard` (HTTP entry), `guard-io` (capability guard),
and its language guest. `guard-io` scopes KV data, captures stdio, filters egress,
and stubs unsupported interfaces. Canonical WIT definitions live in [`wit/`](wit);
each sandbox's `build-composed.sh` produces the deployment artifact.

## API

| Component | Route | Purpose |
| --- | --- | --- |
| `ts-sandbox` | `POST /ts/...` | Run JavaScript or TypeScript |
| `py-sandbox` | `POST /py/...` | Run Python |
| `bundler` (experimental) | `POST /bundle/...` | Bundle extra npm dependencies |

POST this envelope to `/ts/...` or `/py/...`:

```json
{
  "code": "print(6 * 7)",
  "sandboxId": "demo",
  "allowedHosts": ["api.example.com"],
  "kvEnabled": true,
  "input": { "method": "GET", "path": "/" }
}
```

`code` and `sandboxId` are required. `allowedHosts` narrows egress for outbound HTTP;
missing or empty denies it. `kvEnabled` is `false` by default; set it to `true` to
allow access to the scoped key-value store. `input` creates the request delivered to
an HTTP handler.

Code can be either a script or a handler. A script returns captured output:

```json
{ "stdout": "42\n", "stderr": "", "error": null }
```

For a handler, TypeScript exports `default { async fetch(request) {} }` and Python
defines `handle_request(request) -> Response`; its response is returned directly.
A Python handler can stream its body by returning `(status, headers, chunks)`, where
`chunks` is an iterable of `bytes` or `str`; a generator failure truncates the response
after its headers.

```bash
# Python script
curl -s localhost:3000/py/run -d '{"code":"print(6 * 7)","sandboxId":"demo"}'

# TypeScript handler with input
curl -s localhost:3000/ts/run -d '{
  "code":"export default { async fetch(r) { return new Response(r.url) } }",
  "sandboxId":"demo", "input":{"path":"/hello"}}'
```

### Dependencies Included in the sandbox

TypeScript includes `cheerio`, `node-html-parser`, `zod`, `js-yaml`, `nanoid`,
`ulidx`, `uuid`, `lodash`, `date-fns`, `dayjs`, and `@spinframework/spin-kv`.

Python includes `numpy`, `tabulate`, `markdown`, `jinja2`, `regex`, `beautifulsoup4`,
`sqlalchemy`, `tiktoken`, `pydantic`, `pyyaml`, and the standard library. The
[bundler](packages/typescript/bundler) (experimental) packages additional npm dependencies; the
component READMEs list the complete language-specific sets.

### Bundler (experimental)

The bundler resolves npm packages through the [esm.sh](https://github.com/esm-dev/esm.sh/) project, which allows it to download and use packages without an installation or build step. This is an experimental integration: some packages may not bundle or run. See the [compatibility report](packages/typescript/bundler/test/compat/COMPATIBILITY.md) for the packages tested in the integration suite.

By default, the bundler uses the publicly hosted and rate-limited [https://esm.sh](https://esm.sh) server. If you require higher limits or more control, you can also use a self-hosted mirror (see [esm.sh HOSTING.md](https://github.com/esm-dev/esm.sh/blob/main/HOSTING.md) for instructions). For this, point the `esm_base_url` variable at your own instance, for example via `SPIN_VARIABLE_ESM_BASE_URL=https://esm.example.com`.

### Scoped key-value store

When `kvEnabled` is true, each `sandboxId` sees a private view of the shared `default`
store. Keys use an unambiguous length-prefixed namespace, and both runtimes expose the
standard Spin KV API:

```python
from spin_sdk import key_value
store = key_value.open_default()
store.set("k", b"v"); store.get("k")
```

```ts
import * as kv from "@spinframework/spin-kv";
const store = kv.openDefault();
store.setJson("k", { v: 1 }); store.getJson("k");
```

## Deployment model

In production, run sandboxes as private components and reach them through Spin service
chaining or the [`@spinframework/sandbox`](sdk) client library. The
[AI code executor](examples/ai-code-executor) shows the complete wiring.

## Testing

Run unit tests with:

```bash
cargo test --workspace --locked
cd packages/typescript/sandbox && npm test
cd py-sandbox && python3 -m unittest discover -s tests -t .
```

Run the end-to-end suites, including the security gates, against both sandboxes:

```bash
spin up --build --listen 127.0.0.1:3007 &
hurl --variable base_url=http://127.0.0.1:3007 --test tests/smoke.hurl
BASE=http://127.0.0.1:3007 tests/run-examples.sh
```

See [RELEASES.md](RELEASES.md) for CI, the on-demand bundler gates, publishing, and
template updates.

## Limitations

- **No time or memory limits.** The sandbox enforces no per-request CPU, wall-clock, or
  memory limits for the code it executes, beyond what Spin already enforces. The only
  built-in caps are on size: code over 5 MB (or an oversized request body) is rejected
  with `413`, and captured stdout/stderr is truncated at 256 KB.
- **Stateless.** Each `run` is single-shot. Only the scoped KV store persists.
- **Fixed capabilities.** No filesystem, shell, or subprocess, and no `pip`/`npm`
  install at runtime. The pre-bundled dependency set (plus, for JS, whatever the bundler can package) is the whole toolbox.
- **Egress DNS.** Private IP literals and local/internal names are denied by the
  component, but deployment networking or Spin must deny allow-listed hostnames
  that resolve to private addresses.
- **Component sizes.** The engines plus bundled deps are large (TS ≈ 30 MB, Python
  ≈ 85 MB).
