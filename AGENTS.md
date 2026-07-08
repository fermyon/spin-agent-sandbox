# AGENTS.md — Wasm code sandbox

Guidance for AI agents (and humans) working in this repo. For the user-facing contract
and dependency list, read [README.md](README.md) first; this file covers how the code is
organized and the invariants you must not break.

## What this is

A [Spin](https://spinframework.dev) application that executes **untrusted, AI-generated
JS/TS and Python** sent over HTTP, inside WebAssembly. Each request carries the code to
run in a JSON envelope. There are two independent components:

| Component    | Route        | Source                    | Engine                                   |
| ------------ | ------------ | ------------------------- | ---------------------------------------- |
| `ts-sandbox` | `POST /ts/…` | `ts-sandbox/src/index.ts` | esbuild + `j2w` (StarlingMonkey)         |
| `py-sandbox` | `POST /py/…` | `py-sandbox/app.py`       | `componentize-py` (CPython 3.12 → wasi)  |

The manifest ([spin.toml](spin.toml)) wires the two routes to the two components.

## How each component runs user code

- **ts-sandbox** — transpiles the user's TS with `sucrase` (types stripped, ESM →
  CommonJS), then runs it via the `AsyncFunction` constructor with an injected `require`
  (a fixed module registry), a per-sandbox scoped KV, an allow-listed `fetch`, and a
  capturing `console`.
- **py-sandbox** — `exec()`s the user's Python in a fresh namespace. Pre-bundled
  dependencies are imported at module top so `componentize-py` freezes them into the
  component (it only bundles the static import closure). Per-request it monkeypatches
  `spin_sdk.http.send` and `spin_sdk.key_value.open*` to install the scoped KV and the
  egress guard, and restores them in a `finally`.

Both support two code shapes: an **HTTP handler** (`export default { fetch }` /
`def handle_request(request)`) whose `Response` is returned verbatim, and a **main
program** that prints, captured as `{ stdout, stderr, error }`.

## Security invariants — do not regress these

This is the whole point of the project. If you touch the relevant code, keep these true
and keep the tests in [tests/smoke.hurl](tests/smoke.hurl) green:

1. **Per-sandbox KV isolation.** Keys are namespaced `"{len}:{sandboxId}:{key}"`. The
   length prefix is load-bearing: a bare `"{sandboxId}-{key}"` separator collides (id
   `a` + key `b-k` == id `a-b` + key `k`), which would let one sandbox read/write/
   enumerate another's keys. Keep the namespace unambiguous in both components.
2. **Egress default-deny.** Empty `allowedHosts` denies all outbound. The per-request
   list may only *narrow* — a bare `"*"` must not grant all. Loopback / link-local /
   private / `.internal` targets are always refused, even if allow-listed (SSRF
   backstop). The TS `fetch` shim re-checks every redirect hop.
3. **No cross-request state leak.** Per-request scoping (KV prefix, allowedHosts, fetch
   shim, stdout/stderr) is installed before user code and restored in `finally`. This
   relies on Spin's fresh-instance-per-request model.
4. **Bounded input, structured errors.** Oversized bodies/code return 413; syntax/runtime
   errors and malformed envelopes return well-formed JSON, never a crash.

Known gap: there is **no in-component CPU/wall-clock timeout or memory limit** — a
non-terminating or memory-hungry program hangs/OOMs its instance. Enforce a request
deadline and memory cap at the host/deployment layer (Wasmtime epoch-interruption / fuel,
or the platform request timeout).

## Build

```bash
spin up --build          # builds both components, then serves on :3000
```

- ts-sandbox: `npm ci && npm run build` (esbuild bundle → `j2w` → `dist/ts-sandbox.wasm`).
- py-sandbox: `bash build.sh` — see [py-sandbox/README.md](py-sandbox/README.md). It needs
  the sibling `../../spin-python-deps` checkout for the prebuilt `wasm32-wasi` packages.

## Module layout

Each component's logic is split into small, single-purpose modules so the entry file stays
thin and the pure logic is unit-testable without the Spin runtime:

- **ts-sandbox/src/**: `index.ts` (orchestration), `envelope.ts`, `kv.ts`, `egress.ts`,
  `console.ts`, `registry.ts`, `runner.ts`, `logger.ts`.
- **py-sandbox/**: `app.py` (Spin glue + dependency freezing), `_kv.py`, `_egress.py`,
  `_envelope.py`. The `_`-prefixed modules import no `spin_sdk`, so they load under plain
  `python3` for tests and freeze cleanly as part of `app`'s static import closure.

## Test

Unit tests cover the pure logic and need **no build or server**:

```bash
cd ts-sandbox && npm test                                     # esbuild + node --test
cd py-sandbox && python3 -m unittest discover -s tests -t .   # stdlib unittest
```

Integration tests exercise the built components end-to-end and **require a running server**
(the security gates in `tests/smoke.hurl` — KV isolation, egress deny — only assert there):

```bash
spin up --listen 127.0.0.1:3007 &
hurl --variable base_url=http://127.0.0.1:3007 --test tests/smoke.hurl      # fixtures + security gates
BASE=http://127.0.0.1:3007 tests/run-examples.sh                            # every tests/examples/* file
```

`tests/examples/` is the single source of truth for example coverage; `tests/lib.sh` detects
language by **content**, not extension (some example files are intentionally mislabeled).

## Scope note

This file is intentionally specific to this repo. General Spin how-to (routing, variables,
KV, outbound config, deployment) lives in the official docs:
<https://spinframework.dev>.
