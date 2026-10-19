# AGENTS.md: Spin Sandbox

Guidance for AI agents (and humans) working in this repo. Read [README.md](README.md)
for the user-facing contract and component overview. This file covers the invariants you
must not break.

## Security invariants (do not regress these)

This is the whole point of the project. If you touch the relevant code, keep these true
and keep the tests in [tests/smoke.hurl](tests/smoke.hurl) green:

1. **Per-sandbox KV isolation.** Keys are namespaced `"{len}:{sandboxId}:{key}"`.
   Length-prefixing avoids collisions: a bare `"{sandboxId}-{key}"` separator collides
   (id `a` + key `b-k` == id `a-b` + key `k`), which would let one sandbox read, write,
   or enumerate another's keys. Keep the namespace unambiguous in both components.
   KV is also default-off: it is denied unless the request sets `kvEnabled: true`.
2. **Egress default-deny.** Absent/empty `allowedHosts` denies all outbound. The
   per-request list may only narrow: a bare `"*"` must not grant all. Loopback,
   link-local, private IP literals, and `.internal` targets are always refused.
   The host/deployment network must also refuse DNS names resolving to private IPs.
3. **No cross-request state leak.** The `guard` front component validates the envelope
   and sets the per-request context (sandbox ID, `allowedHosts`, `kvEnabled`) in
   `guard-io` before the guest runs; `guard-io` applies it to every KV, egress, and stdio
   call. Nothing is reset afterwards: this relies on Spin's fresh-instance-per-request
   model. The guest must never import `sandbox:guard/context`, so user code cannot change
   its own scope. `tests/check-imports.mjs` asserts this, and allowlists every host
   capability each built sandbox can reach.
4. **Bounded input, structured errors.** Oversized bodies/code return 413; syntax and
   runtime errors and malformed envelopes return well-formed JSON, never a crash.

Known gap: there is no in-component CPU/wall-clock timeout or memory limit, so a
non-terminating or memory-hungry program hangs or OOMs its instance. Enforce a request
deadline and memory cap at the host/deployment layer (Wasmtime epoch-interruption or
fuel, or the platform request timeout).

## Build

```bash
spin up --build               # builds the three components, then serves on :3000
```

Building needs Rust with the `wasm32-wasip2` target, `wasm-tools`, `wac`, Node, and
Python 3.12.

- ts-sandbox: `packages/typescript/sandbox/build-composed.sh` builds the `guard` and
  `guard-io` crates, bundles the guest (esbuild, then `j2w`), and composes the three
  into `dist/ts-sandbox.wasm`.
- py-sandbox: `py-sandbox/build-composed.sh` does the same with the Python guest
  (`build.sh`, componentize-py) into `dist/py-sandbox.wasm`; see
  [py-sandbox/README.md](py-sandbox/README.md). Its prebuilt `wasm32-wasi` packages are
  committed in `py-sandbox/wasi-deps`.
- bundler: `npm ci && npm run build` in `packages/typescript/bundler`
  (`dist/bundler.wasm`). It is a plain component, not composed with the guards.
- sdk: `npm ci && npm run build` in `sdk` (plain `tsc`, into the git-ignored `sdk/dist`). The
  example APIs import its built output, so their Spin build runs `npm run build:sdk` first.

## Module layout

Each sandbox is three components composed with `wac` (see `crates/guard/compose.wac`
and `compose-py.wac`):

- `crates/guard` (front): the HTTP entry point. Validates and size-limits the envelope,
  sets the request context, calls the guest, and shapes the JSON response.
- `crates/guard-io`: sits between the guest and the host. Scopes KV keys, enforces the
  egress policy, and captures stdout/stderr. The Python composition also plugs stub
  components (`wit/guard-io` worlds `dummy-sockets` and `dummy-capabilities`) into the
  host capabilities the sandbox does not expose.
- The language guest (`packages/typescript/sandbox` or `py-sandbox`): runs the user code.

## Test

Unit tests cover the pure logic and need no build or server:

```bash
cd packages/typescript/sandbox && npm test                    # esbuild + node --test
cd py-sandbox && python3 -m unittest discover -s tests -t .   # stdlib unittest
```

Integration tests exercise the built components end-to-end and require a running
server; the security gates in `tests/smoke.hurl` (KV isolation and egress deny, for both
sandboxes) and the log-escaping gate in `tests/check-log-escaping.mjs` only assert there. CI runs them on every pull request:

```bash
spin up --build --listen 127.0.0.1:3007 > spin.log 2>&1 &
node tests/check-imports.mjs                                                 # host imports of the built components
hurl --variable base_url=http://127.0.0.1:3007 --test tests/smoke.hurl      # fixtures + security gates
node tests/check-log-escaping.mjs spin.log                                  # error text is escaped in the app log
BASE=http://127.0.0.1:3007 tests/run-examples.sh                            # every tests/examples/* file
```

`node scripts/check-npm-audit.mjs` runs `npm audit` on every tracked npm project and
fails unless each result is clean or exactly matches a reviewed exception in that script;
CI runs it on every pull request.

The bundler's live suites reach esm.sh and are slower, so CI runs them only on demand;
run them locally with `cd packages/typescript/bundler && npm run test:ci`.

`tests/examples/` is the single source of truth for example coverage; `tests/lib.sh`
detects language by content, not extension (some example files are intentionally
mislabeled).

## Scope note

This file is intentionally specific to this repo. General Spin how-to (routing,
variables, KV, outbound config, deployment) lives in the official docs:
<https://spinframework.dev>.
