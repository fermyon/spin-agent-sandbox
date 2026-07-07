# Wasm code sandbox (Spin)

A Spin application that executes **dynamic, AI-generated JS/TS and Python code** received
over HTTP, inside WebAssembly. Each request carries the code to run; popular dependencies
are pre-bundled, a per-sandbox KV store is available, and outbound HTTP is allow-listed.

Two components:

| Component    | Route        | Engine                                                |
| ------------ | ------------ | ----------------------------------------------------- |
| `ts-sandbox` | `POST /ts/…` | `j2w` → componentize-js (StarlingMonkey/SpiderMonkey) |
| `py-sandbox` | `POST /py/…` | componentize-py (CPython 3.12 → wasm32-wasi)          |

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

Syntax/runtime errors and malformed envelopes always come back as well-formed JSON; the
component never crashes.

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
  Binary packages come prebuilt (`wasm32-wasi`) from `../spin-python-deps`; pure-python
  packages are pip-installed into `py-sandbox/vendor/`.

## Scoped key-value store

There is one shared `default` store; each `sandboxId` sees only its own keys (transparently
namespaced `"{sandboxId}-{key}"`). The wrapper is a **faithful drop-in for the documented
Spin SDK**, so code generated from Spin docs works unmodified and scoped:

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
allow-list (default-deny when empty). Tighten `allowed_outbound_hosts` per deployment.

## Build & run

```bash
spin up --build          # builds both components, then serves on :3000
# or build the Python component alone:
cd py-sandbox && bash build.sh
```

The Python build (`py-sandbox/build.sh`) creates an isolated python3.12 venv with pinned
`spin-sdk`/`componentize-py`, populates `vendor/` via `setup-vendor.sh`, and runs
componentize-py. `vendor/` and `.venv/` are regenerable and git-ignored.

## Testing

```bash
spin up --listen 127.0.0.1:3007 &
BASE=http://127.0.0.1:3007 tests/run-examples.sh          # every examples/* file, via curl+jq
tests/gen-bodies.sh                                       # generate envelope bodies + examples.hurl
hurl --variable base_url=http://127.0.0.1:3007 --test tests/examples.hurl   # every example, via hurl
hurl --variable base_url=http://127.0.0.1:3007 --test tests/smoke.hurl      # hand-written fixtures
```

`examples/` is the single source of truth. Routing/input logic is shared in `tests/lib.sh`
(language detected by **content**, not extension — some example files are intentionally
mislabeled). Three ways to run them:

- **`run-examples.sh`** — wraps each `examples/*` into an envelope on the fly with `jq` and
  reports per-example pass/fail.
- **`gen-bodies.sh` + `examples.hurl`** — hurl can't wrap raw source into the JSON envelope
  itself, so the generator emits one envelope body per example (`tests/bodies/<name>.json`)
  and a matching `tests/examples.hurl` that POSTs each via hurl's `file,<path>;` keyword.
  Both are generated artifacts (git-ignored).
- **`smoke.hurl`** — a few hand-written fixtures (`tests/bodies/{ts,py}-*.json`,
  `bad-envelope.json`) for the code shapes, scoped-KV APIs, and the 400-on-bad-envelope case.

## Known limitations

- **plotly is pinned** (partially supported). componentize-py freezes Python modules but exposes no
  readable filesystem, and resolves only statically-imported modules.
- **Component sizes** — the engines + bundled deps are large (TS ≈ 30 MB, Python ≈ 130 MB).
- **Trust boundary** is the Wasm component (no filesystem; egress gated by Spin), not the
  JS scope / Python namespace.
