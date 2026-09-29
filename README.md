# Sandboxes for AI-generated code

Fast, isolated WebAssembly sandboxes for running untrusted, AI-generated JS/TS and
Python. Secure by default and quick to start, built on [Spin](https://spinframework.dev).

This repository contains three composable layers: the sandbox components, a client
library that turns a sandbox into an agent tool, and examples that wire them together.
See [ARCHITECTURE.md](ARCHITECTURE.md) for how the components are composed.

## What's in this repo

1. **Sandboxes**: [`ts-sandbox/`](packages/typescript/sandbox) and [`py-sandbox/`](py-sandbox) are Spin
   WebAssembly components that execute untrusted JS/TS and Python received over HTTP.
   Popular dependencies are pre-bundled, each run gets a scoped KV store, and outbound
   HTTP is possible behind an allow-list. A third component, the
   [bundler](packages/typescript/bundler), lets JS code pull extra npm packages at publish time.
2. **A client library**: [`@spinframework/sandbox`](sdk) is a small TypeScript client
   that consumes a sandbox and exposes it as an agent tool behind a portable
   `CodeRunner` contract.
3. **Examples**: [`examples/`](examples) contains complete agents built on the layers
   above. [`ai-code-executor`](examples/ai-code-executor) is a Claude CodeAct agent
   whose only tool is a sandbox, streaming its generate-run-observe loop to a chat UI.
   [`app-builder`](examples/app-builder) has Claude generate small web apps, stores them
   with the code store, and serves each live at its own URL.

## Why: CodeAct

A powerful way to use a model is CodeAct: rather than only calling a fixed set of
tools, let its action be code it writes and runs. The model generates a program, runs
it, reads the output, and repeats.

CodeAct's hard requirement is an untrusted code sandbox, which is what this repo provides.
[examples/ai-code-executor](examples/ai-code-executor) is a complete CodeAct agent
built on it.

> **References:** [ReAct](https://arxiv.org/pdf/2210.03629) (ICLR 2023) ·
> [CodeAct](https://machinelearning.apple.com/research/codeact) (Apple, 2024;
> [arXiv](https://arxiv.org/pdf/2402.01030)).

## Quick start

The Python component's prebuilt `wasm32-wasi` packages come from the `spin-python-deps`
git submodule, so clone with `--recursive` (or initialise it after cloning):

```bash
git submodule update --init      # populates py-sandbox/spin-python-deps
spin up --build                  # builds the three components, then serves on :3000
# or build the Python component alone:
cd py-sandbox && bash build.sh
```

Note: Building the above requires [`wac`](https://github.com/bytecodealliance/wac)

## The sandbox HTTP API

Each sandbox is a Spin component that accepts code over HTTP, runs it, and returns the
result. `ts-sandbox` serves `POST /ts/…`; `py-sandbox` serves `POST /py/…`. The manifest
also wires the [bundler](packages/typescript/bundler) at `POST /bundle`.

| Component    | Route        | Engine                                                |
| ------------ | ------------ | ----------------------------------------------------- |
| `ts-sandbox` | `POST /ts/…` | `j2w` → componentize-js (StarlingMonkey/SpiderMonkey) |
| `py-sandbox` | `POST /py/…` | componentize-py (CPython 3.12 → wasm32-wasi)          |

### Request / response contract

POST a strict JSON envelope to `/ts/...` or `/py/...`:

```jsonc
{
  "code": "…source…",          // required: the JS/TS or Python to run
  "sandboxId": "abc123",        // required: scopes the KV store
  "allowedHosts": ["api.example.com"],  // optional: outbound HTTP allow-list (ts-sandbox
                                          // only today, see Limitations); absent/empty denies all
  "input": {                     // optional: the request the user code sees
    "method": "POST",
    "path":    "/api/data",       // handler request path (default "/")
    "headers": { "content-type": "application/json" },
    "query":   { "name": "ada" },
    "body":    { "values": [1, 2, 3] }   // string passed through; object → JSON
  },
}
```

The code may be written in either of two shapes:

- **HTTP handler**: Python defines `def handle_request(request) -> Response`; TS exports
  `default { async fetch(request) { … } }`. A synthetic request is built from `input`
  and passed in (its path is `input.path`, default `/`, so a handler can route on
  sub-paths); the handler's `Response` is returned verbatim (status/headers/body).
- **Main program**: a plain script that prints (the common AI-generated case). It is
  run and its output is captured:

  ```json
  { "stdout": "…", "stderr": "…", "error": null }
  ```

Syntax and runtime errors, and malformed envelopes, always come back as well-formed
JSON.

```bash
# main-program (Python)
curl -s localhost:3000/py/run -d '{"code":"print(6*7)","sandboxId":"demo"}'
# {"stdout": "42\n", "stderr": "", "error": null}

# HTTP handler (TypeScript) with input
curl -s localhost:3000/ts/run -d '{
  "code":"export default { async fetch(r){ const u=new URL(r.url); return new Response(\"hi \"+u.searchParams.get(\"n\")); } }",
  "sandboxId":"demo", "input":{"query":{"n":"ada"}} }'
# hi ada
```

### Pre-installed dependencies

User code `import`s these directly, with no install step. Anything outside the set
raises a "module not found" error.

- **TypeScript/JS**: `cheerio`, `node-html-parser`, `zod`, `js-yaml`, `nanoid`, `ulidx`,
  `uuid`, `lodash`, `date-fns`, `dayjs`, `@spinframework/spin-kv`. User TS is transpiled
  at runtime with `sucrase` (types stripped, ES `import`/`export` rewired to the bundled
  set). For anything beyond this set, the [bundler](packages/typescript/bundler) component turns
  source plus a package.json into one self-contained blob the sandbox runs unchanged.
- **Python**: `numpy`, `tabulate`, `markdown`, `jinja2`, `regex`, `beautifulsoup4`, plus
  popular extras proven to compile (`sqlalchemy`, `tiktoken`, `pydantic`, `pyyaml`,
  `charset_normalizer`, `yarl`, `multidict`, `frozenlist`, `wrapt`) and the standard
  library. Binary packages come prebuilt (`wasm32-wasi`) from the
  `py-sandbox/spin-python-deps` submodule; pure-python packages are pip-installed into
  `py-sandbox/vendor/`.

### Scoped key-value store

There is one shared `default` store; each `sandboxId` sees only its own keys,
namespaced with `"{len}:{sandboxId}:{key}"`. The wrappers for both TS/JS and Python are
compatible with the Spin KV API:

```python
from spin_sdk import key_value           # canonical Spin Python API
store = key_value.open_default()
store.set("k", b"v"); store.get("k")     # get/set/delete/exists/get_keys (+ get_json/set_json)
```
```ts
import * as kv from "@spinframework/spin-kv";   // canonical Spin TS API
const store = kv.openDefault();
store.setJson("k", { v: 1 }); store.getJson("k");
```

## Deployment model

The `POST /ts/…` and `/py/…` routes are public in the example, which is convenient for
local dev and testing. In production a sandbox runs untrusted, model-generated code, so
it should never be a public endpoint: run it as a private component
(`route = { private = true }`) inside your app and reach it only over local service
chaining, or through the SDK [`@spinframework/sandbox`](sdk).

[`examples/ai-code-executor`](examples/ai-code-executor) shows the full
private-component wiring end to end.

## Scaffolding new apps

Spin templates pull the sandbox components as prebuilt Wasm from GitHub releases, so
you can add them to an app without building from source:

```bash
spin templates install --dir . --upgrade
spin new -t sandbox-app my-app     # a new app wired with both sandboxes
spin add -t sandbox-ts             # add the JS/TS sandbox (with its bundler) to an existing app
spin add -t sandbox-py             # or the Python sandbox
```

The release workflow ([.github/workflows/release.yml](.github/workflows/release.yml))
runs the CI gates before publishing. It reuses the tested TypeScript artifacts,
including the composed `dist/ts-sandbox.wasm` (guard + guard-io + JS guest), then
builds the Python sandbox and publishes all three components with SHA-256 checksums.
Each release also includes the compatibility reports and logs from its tested run.
Push a `v*` tag for a versioned release, or dispatch the workflow from a branch for
the rolling `canary` prerelease. See [templates/README.md](templates/README.md).

## Testing

GitHub Actions runs the unit suites on every pull request and push to `main`.
Bundler integration tests, the full library compatibility sweep, and tool-installer
checks run on demand through the `tests` workflow's **Run workflow** action, and
before every release. The release workflow runs only for `v*` tags or manual
dispatch, so a push to `main` does not also start release tests. The compatibility gate
requires all libraries marked required in the compact `baseline.json` to keep passing
and checks that the sweep is complete; known unsupported libraries remain recorded.
Full reports are generated artifacts, not tracked files. Local runs retain separate
timestamped directories under ignored `test-results/bundler-compat/`; CI uploads
reports and logs even when tests fail and retains them for 90 days.
Configure the `ci` status check as required in branch protection to gate merges on
the unit suites. Manual and release runs also require the live suites to pass.

CI installs the latest stable `wasm-tools` and `wac` releases directly from the
Bytecode Alliance repositories, plus both Rust Wasm targets needed for composition.
To run the bundler's integration and compatibility gates locally:

```bash
cd packages/typescript/bundler && npm run test:ci
```

See [the bundler test guide](packages/typescript/bundler/test/README.md) for baseline
maintenance and report locations.

### Unit tests (no Wasm build or server needed)

The pure logic of each component (KV scoping, envelope validation, request shaping)
lives in small dependency-free modules that are unit-tested directly. ts-sandbox's
egress allow-list is enforced in Rust by `guard-io` (`crates/guard-io/src/egress.rs`),
not in JS:

```bash
cargo test --workspace --locked                                       # Rust guard + guard-io
cd packages/typescript/sandbox && npm test                              # TS logic (esbuild + node --test)
cd py-sandbox && python3 -m unittest discover -s tests -t .   # Python logic (stdlib unittest)
cargo test -p guard-io -p guard                                          # guard/guard-io logic, incl. egress
```

### Integration tests (against a running server)

```bash
spin up --listen 127.0.0.1:3007 &
BASE=http://127.0.0.1:3007 tests/run-examples.sh          # every tests/examples/* file, via curl+jq
tests/gen-bodies.sh                                       # generate envelope bodies + examples.hurl
hurl --variable base_url=http://127.0.0.1:3007 --test tests/examples.hurl   # every example, via hurl
hurl --variable base_url=http://127.0.0.1:3007 --test tests/smoke.hurl      # fixtures + security gates
```

`tests/examples/` is the single source of truth. Routing and input logic are shared in
`tests/lib.sh` (language detected by content, not extension; some example files are
intentionally mislabeled). Three ways to run them:

- **`run-examples.sh`** wraps each `tests/examples/*` into an envelope on the fly with
  `jq` and reports per-example pass/fail.
- **`gen-bodies.sh` + `examples.hurl`**: hurl can't wrap raw source into the JSON
  envelope itself, so the generator emits one envelope body per example
  (`tests/bodies/<name>.json`) and a matching `tests/examples.hurl` that POSTs each via
  hurl's `file,<path>;` keyword. Both are generated artifacts (git-ignored).
- **`smoke.hurl`**: a few hand-written fixtures (`tests/bodies/{ts,py}-*.json`,
  `bad-envelope.json`) for the code shapes, scoped-KV APIs, and the 400-on-bad-envelope
  case.

## Limitations

- **No time or memory limits.** The sandbox enforces no per-request CPU, wall-clock, or
  memory limits for the code it executes, beyond what Spin already enforces. The only
  built-in caps are on size: code over 5 MB (or an oversized request body) is rejected
  with `413`, and captured stdout/stderr is truncated at 256 KB.
- **Stateless.** Each `run` is single-shot and buffered: no streaming output, no
  execution context between runs. Only the scoped KV store persists.
- **Fixed capabilities.** No filesystem, shell, or subprocess, and no `pip`/`npm`
  install at runtime. The pre-bundled dependency set (plus, for JS, whatever the bundler
  can package) is the whole toolbox.
- **Trust boundary is the Wasm component.** For ts-sandbox, per-sandbox egress
  (`allowedHosts`) and KV isolation are enforced by `guard`/`guard-io`, composed in
  front of the untrusted guest — not by the guest's own code. **py-sandbox does not
  enforce `allowedHosts` yet**: it calls Spin's HTTP client directly, so its outbound
  HTTP is unfiltered beyond whatever `allowed_outbound_hosts`/runtime-config the host
  sets (see AGENTS.md).
- **Component sizes.** The engines plus bundled deps are large (TS ≈ 30 MB, Python
  ≈ 85 MB).
