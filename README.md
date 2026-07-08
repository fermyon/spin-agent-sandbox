# Wasm code sandbox (Spin)

A Spin application that executes **dynamic, AI-generated JS/TS and Python code** received
over HTTP, inside WebAssembly. Each request carries the code to run; popular dependencies
are pre-bundled, a per-sandbox KV store is available, and outbound HTTP is allow-listed.

Two components:

| Component    | Route        | Engine                                                |
| ------------ | ------------ | ----------------------------------------------------- |
| `ts-sandbox` | `POST /ts/…` | `j2w` → componentize-js (StarlingMonkey/SpiderMonkey) |
| `py-sandbox` | `POST /py/…` | componentize-py (CPython 3.12 → wasm32-wasi)          |

> **Scaffold or extend an app:** this repo ships Spin templates that pull the sandbox
> components as prebuilt Wasm from GitHub releases. `spin templates install --dir .
> --upgrade`, then `spin new -t sandbox-app my-app` (both), or `spin new`/`spin add -t
> sandbox-ts` / `sandbox-py` for a single component. The release workflow
> ([.github/workflows/release.yml](.github/workflows/release.yml)) builds and publishes the
> components. See [templates/README.md](templates/README.md).

> **Deployment model:** the `POST /ts/…` and `/py/…` routes shown below are **public** in
> this standalone app — convenient for local dev/testing. In production the sandbox is meant
> to run as a **private component** (`route = { private = true }`) inside a consuming app and
> be reached only via local service chaining through [`@spinframework/sandbox`](sdk) — see
> [examples/wagent](examples/wagent).

## Request / response contract

POST a strict JSON **envelope** to `/ts/...` or `/py/...`:

```jsonc
{
  "code": "…source…",          // required — the JS/TS or Python to run
  "sandboxId": "abc123",        // required — scopes the KV store
  "input": {                     // optional — the request the user code sees
    "method": "POST",
    "headers": { "content-type": "application/json" },
    "query":   { "name": "ada" },
    "body":    { "values": [1, 2, 3] }   // string passed through; object → JSON
  },
  "allowedHosts": ["api.example.com"]    // optional — per-sandbox outbound allow-list
}
```

The code may be written in **either** of two shapes — both work:

- **HTTP handler** — Python defines `def handle_request(request) -> Response`; TS exports
  `default { async fetch(request) { … } }`. A synthetic request is built from `input` and
  passed in; the handler's `Response` is returned verbatim (status/headers/body).
- **Main program** — a plain script that prints (the common AI-generated case). It is run
  and its output is captured:

  ```json
  { "stdout": "…", "stderr": "…", "error": null }
  ```

Syntax/runtime errors and malformed envelopes always come back as well-formed JSON. That
covers *exceptions*, not resource exhaustion: there is no per-request CPU/wall-clock
timeout or memory bound, so a non-terminating or memory-hungry program can still hang or
OOM its instance — enforce a deadline and memory limit at the host/deployment layer
(handler errors return HTTP 500; oversized bodies/code return 413).

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

## Pre-installed dependencies

User code `import`s these directly (no install step). Anything outside the set raises a
clear "module not found" error.

- **TypeScript/JS**: `cheerio`, `node-html-parser`, `zod`, `js-yaml`, `nanoid`, `ulidx`,
  `uuid`, `lodash`, `date-fns`, `dayjs`, `@spinframework/spin-kv`. User TS is transpiled at
  runtime with `sucrase` (types stripped, ES `import`/`export` rewired to the bundled set).
- **Python**: `numpy`, `tabulate`, `markdown`, `jinja2`, `regex`, `beautifulsoup4`, plus
  popular extras proven to compile (`sqlalchemy`, `tiktoken`, `pydantic`, `pyyaml`,
  `charset_normalizer`, `yarl`, `multidict`, `frozenlist`, `wrapt`) and the standard library.
  Binary packages come prebuilt (`wasm32-wasi`) from the `py-sandbox/spin-python-deps`
  submodule; pure-python packages are pip-installed into `py-sandbox/vendor/`.

## Scoped key-value store

There is one shared `default` store; each `sandboxId` sees only its own keys, namespaced
with a length-prefixed separator (`"{len}:{sandboxId}:{key}"`) so that no sandbox id can be
a key-prefix of another's. The wrapper is a **faithful drop-in for the documented Spin
SDK**, so code generated from Spin docs works unmodified and scoped:

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

## Outbound HTTP

The Spin manifest grants a broad outer bound (`https://*:*`) for development. On top of it,
user code's `fetch`/`spin_sdk.http.send` is gated by the per-request `allowedHosts`
allow-list (default-deny when empty; the per-request list can only *narrow* egress, never
grant all — a bare `"*"` entry is ignored). Loopback / link-local / private / `.internal`
targets are always refused even if allow-listed (SSRF backstop), and the TS `fetch` shim
follows redirects manually so each hop is re-checked. Tighten `allowed_outbound_hosts` per
deployment.

## Build & run

The Python component's prebuilt `wasm32-wasi` packages come from the `spin-python-deps` git
submodule, so clone with `--recursive` (or initialise it after cloning):

```bash
git submodule update --init      # populates py-sandbox/spin-python-deps
spin up --build                  # builds both components, then serves on :3000
# or build the Python component alone:
cd py-sandbox && bash build.sh
```

The Python build (`py-sandbox/build.sh`) creates an isolated python3.12 venv with pinned
`spin-sdk`/`componentize-py`, populates `vendor/` via `setup-vendor.sh` (copying the prebuilt
packages from the submodule), and runs componentize-py. `vendor/` and `.venv/` are
regenerable and git-ignored.

## Testing

### Unit tests (no build or server needed)

The pure logic of each component — KV scoping, the egress allow-list, envelope validation,
request shaping — lives in small dependency-free modules that are unit-tested directly:

```bash
cd ts-sandbox && npm test                              # TS logic (esbuild + node --test)
cd py-sandbox && python3 -m unittest discover -s tests -t .   # Python logic (stdlib unittest)
```

### Integration tests (against a running server)

```bash
spin up --listen 127.0.0.1:3007 &
BASE=http://127.0.0.1:3007 tests/run-examples.sh          # every tests/examples/* file, via curl+jq
tests/gen-bodies.sh                                       # generate envelope bodies + examples.hurl
hurl --variable base_url=http://127.0.0.1:3007 --test tests/examples.hurl   # every example, via hurl
hurl --variable base_url=http://127.0.0.1:3007 --test tests/smoke.hurl      # fixtures + security gates
```

`tests/examples/` is the single source of truth. Routing/input logic is shared in `tests/lib.sh`
(language detected by **content**, not extension — some example files are intentionally
mislabeled). Three ways to run them:

- **`run-examples.sh`** — wraps each `tests/examples/*` into an envelope on the fly with `jq` and
  reports per-example pass/fail.
- **`gen-bodies.sh` + `examples.hurl`** — hurl can't wrap raw source into the JSON envelope
  itself, so the generator emits one envelope body per example (`tests/bodies/<name>.json`)
  and a matching `tests/examples.hurl` that POSTs each via hurl's `file,<path>;` keyword.
  Both are generated artifacts (git-ignored).
- **`smoke.hurl`** — a few hand-written fixtures (`tests/bodies/{ts,py}-*.json`,
  `bad-envelope.json`) for the code shapes, scoped-KV APIs, and the 400-on-bad-envelope case.

## Known limitations

- **Component sizes** — the engines + bundled deps are large (TS ≈ 30 MB, Python ≈ 85 MB
  after the build's debug-strip; `numpy` and `sqlalchemy` dominate the Python side). The
  Python build strips DWARF/name sections via `wasm-tools` (~2× smaller); it is skipped with
  a note if `wasm-tools` is not installed.
- **Trust boundary** is the Wasm component (no filesystem; egress gated by Spin), not the
  JS scope / Python namespace.
