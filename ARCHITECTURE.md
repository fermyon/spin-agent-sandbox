# Architecture

A [Spin](https://spinframework.dev) application that executes untrusted, AI-generated
JS/TS and Python sent over HTTP, inside WebAssembly. Each request carries the code to
run in a JSON envelope. There are two independent sandbox components, plus a bundler
component that packages extra npm dependencies for the TS sandbox:

| Component    | Route           | Source                        | Engine                                   |
| ------------ | --------------- | ----------------------------- | ---------------------------------------- |
| `ts-sandbox` | `POST /ts/…`    | `packages/typescript/sandbox/`, `crates/guard`, `crates/guard-io` | esbuild + `j2w` (StarlingMonkey), composed with two Rust components via `wac` |
| `py-sandbox` | `POST /py/…`    | `py-sandbox/app.py`           | `componentize-py` (CPython 3.12 → wasi)  |
| `bundler`    | `POST /bundle`  | `packages/typescript/bundler/src/` | esbuild + `j2w` (StarlingMonkey)         |

The manifest ([spin.toml](spin.toml)) wires the routes to the components.

## TS sandbox: three components composed into one

Unlike py-sandbox (below), the deployed `ts-sandbox` component isn't just the JS
engine. It's three components composed at build time with `wac` (see
`crates/guard/compose.wac` and `spin.toml`'s `component.ts-sandbox.build`):

- **`guard`** (`crates/guard`) is the real Spin HTTP entry point: parses the JSON
  envelope, enforces size limits, then calls the JS guest through the custom
  `sandbox:guard/executor` WIT interface.
- **`guard-io`** (`crates/guard-io`) implements every WASI interface the JS guest
  imports — guarded `fermyon:spin/key-value` (per-sandbox key prefixing), captured
  `wasi:cli/stdout`/`stderr`, and stubbed `wasi:filesystem/*` (no preopens, ever) —
  so the guest never reaches the real host directly for any of them.
- **`packages/typescript/sandbox`** is the untrusted guest: transpiles and runs the
  submitted code, exporting `sandbox:guard/executor` instead of raw HTTP.

They can't be fewer components: `guard` needs `packages/typescript/sandbox`'s
exported `executor`, and the guest needs `guard-io`'s exports satisfied — the
Component Model requires instantiation to be a DAG, so `guard` and `guard-io` can't
be the same component (that would make the guest's dependency on `guard-io` and
`guard`'s dependency on the guest a cycle).

**WASI version pinning gotcha**: `crates/guard-io/wit/**/*.wit` pins exact wasi
interface versions (e.g. `wasi:cli/stdout@0.2.10`) that must match whatever the
current JS toolchain (`@spinframework/build-tools`/`componentize-js`/`j2w`) emits for
the guest's imports — check with `wasm-tools component wit
packages/typescript/sandbox/dist/ts-sandbox.wasm`. A mismatch doesn't fail the
`wac compose`; it silently leaves that import/export pair unconnected, and it falls
through to the real host instead of `guard-io`'s guarded implementation (symptom:
guest `console.log` output leaks to the real process stdout instead of being
captured in the JSON `stdout` field). Bump `guard-io`'s pinned versions to match
whenever the JS build tooling is upgraded.

## How each component runs user code

- **The TS guest** transpiles the user's TS with `sucrase` (types stripped, ESM to
  CommonJS), then runs it via the `AsyncFunction` constructor with an injected `require`
  (a fixed module registry). KV scoping, egress, and stdout/stderr capture are enforced
  by `guard-io` at the component boundary, not by JS code. A blob that carries the
  bundler's first-line marker is already CommonJS and skips the sucrase pass.
- **py-sandbox** `exec()`s the user's Python in a fresh namespace. Pre-bundled
  dependencies are imported at module top so `componentize-py` freezes them into the
  component (it only bundles the static import closure). Per-request it monkeypatches
  `spin_sdk.http.send` and `spin_sdk.key_value.open*` to install the scoped KV and the
  egress guard, and restores them in a `finally`.

Both support two code shapes: an HTTP handler (`export default { fetch }` /
`def handle_request(request)`) whose `Response` is returned verbatim, and a main
program that prints, captured as `{ stdout, stderr, error }`.

## Module layout

Each component's logic is split into small, single-purpose modules so the entry file
stays thin and the pure logic is unit-testable without the Spin runtime:

- **packages/typescript/sandbox/src/**: `index.ts` (orchestration), `requestResponse.ts`
  (envelope-to-Request/Response shaping), `registry.ts` (bundled `require()` targets),
  `runner.ts` (handler-shape detection).
- **crates/guard/src/**: `lib.rs` (HTTP entry), `envelope.rs`, `logging.rs`.
- **crates/guard-io/src/**: `kv.rs`, `stdio.rs`, `filesystem.rs`, `http_types.rs`,
  `outgoing.rs`, `context.rs`, `request_context.rs` — one module per guarded WASI
  interface.
- **py-sandbox/**: `app.py` (Spin glue + dependency freezing), `_kv.py`, `_egress.py`,
  `_envelope.py`. The `_`-prefixed modules import no `spin_sdk`, so they load under
  plain `python3` for tests and freeze cleanly as part of `app`'s static import closure.
- **packages/typescript/bundler/src/**: `index.ts` (HTTP entry), `bundler.ts` (the
  linker), `shims.ts` (curated Node-builtin shims).
