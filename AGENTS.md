# AGENTS.md: Wasm code sandbox

Guidance for AI agents (and humans) working in this repo. For the user-facing contract
and dependency list, read [README.md](README.md) first; for how the code is organized
(components, composition, module layout), read [ARCHITECTURE.md](ARCHITECTURE.md). This
file covers the invariants you must not break.

## Security invariants (do not regress these)

This is the whole point of the project. If you touch the relevant code, keep these true
and keep the tests in [tests/smoke.hurl](tests/smoke.hurl) green:

1. **Per-sandbox KV isolation.** Keys are namespaced `"{len}:{sandboxId}:{key}"`.
   Length-prefixing avoids collisions: a bare `"{sandboxId}-{key}"` separator collides
   (id `a` + key `b-k` == id `a-b` + key `k`), which would let one sandbox read, write,
   or enumerate another's keys. Keep the namespace unambiguous in both components.
2. **Egress default-deny.** Empty `allowedHosts` denies all outbound. The per-request
   list may only narrow: a bare `"*"` must not grant all. Loopback, link-local,
   private, and `.internal` targets are always refused, even if allow-listed (the SSRF
   backstop). The TS `fetch` shim re-checks every redirect hop.
3. **No cross-request state leak.** Per-request scoping (KV prefix, allowedHosts, fetch
   shim, stdout/stderr) is installed before user code and restored in `finally`. This
   relies on Spin's fresh-instance-per-request model.
4. **Bounded input, structured errors.** Oversized bodies/code return 413; syntax and
   runtime errors and malformed envelopes return well-formed JSON, never a crash.

Known gap: there is no in-component CPU/wall-clock timeout or memory limit, so a
non-terminating or memory-hungry program hangs or OOMs its instance. Enforce a request
deadline and memory cap at the host/deployment layer (Wasmtime epoch-interruption or
fuel, or the platform request timeout).

## Build

```bash
spin up --build          # builds the three components, then serves on :3000
```

- ts-sandbox: `npm ci && npm run build` (esbuild bundle, then `j2w` produces
  `dist/ts-sandbox.wasm`).
- bundler: same toolchain, in `packages/typescript/bundler` (`dist/bundler.wasm`).
- py-sandbox: `bash build.sh`; see [py-sandbox/README.md](py-sandbox/README.md). It
  needs the `spin-python-deps` submodule checkout for the prebuilt `wasm32-wasi`
  packages.

## Module layout

See [ARCHITECTURE.md](ARCHITECTURE.md#module-layout).

## Test

Unit tests cover the pure logic and need no build or server:

```bash
cd packages/typescript/sandbox && npm test                    # esbuild + node --test
cd py-sandbox && python3 -m unittest discover -s tests -t .   # stdlib unittest
```

Integration tests exercise the built components end-to-end and require a running
server; the security gates in `tests/smoke.hurl` (KV isolation and egress deny) only
assert there:

```bash
spin up --listen 127.0.0.1:3007 &
hurl --variable base_url=http://127.0.0.1:3007 --test tests/smoke.hurl      # fixtures + security gates
BASE=http://127.0.0.1:3007 tests/run-examples.sh                            # every tests/examples/* file
```

`tests/examples/` is the single source of truth for example coverage; `tests/lib.sh`
detects language by content, not extension (some example files are intentionally
mislabeled).

## Scope note

This file is intentionally specific to this repo. General Spin how-to (routing,
variables, KV, outbound config, deployment) lives in the official docs:
<https://spinframework.dev>.
