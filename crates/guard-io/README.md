# guard-io

Implements the WASI interfaces `ts-sandbox` imports — `fermyon:spin/key-value`,
`wasi:http/outgoing-handler`, `wasi:cli/{stdin,stdout,stderr}`,
`wasi:filesystem/*` — so the guest never talks to the real host directly. See
the module doc in `src/lib.rs` for what each export enforces; this file
covers one build-specific gotcha.

## Why this crate builds via wasip1 + an adapter, not native wasip2

`spin.toml` builds this crate for `wasm32-wasip1` and turns it into a
component with `wasm-tools component new` plus the vendored preview1 adapter
(`adapters/wasi_snapshot_preview1.reactor.wasm`), instead of targeting
`wasm32-wasip2` directly the way `guard` does. This is a workaround for a
confirmed rustc bug, not a style choice.

`wit/world.wit` exports several interfaces that all reference the same
`wasi:io/streams` resource type: `wasi:cli/stdin`, `wasi:cli/stdout`,
`wasi:cli/stderr`, `wasi:http/types`, and (transitively, via `descriptor`)
`wasi:filesystem/types`/`preopens`. wit-bindgen requires the component that
mints a *new* concrete instance of a shared resource type to own every
interface that references it — that's why this one crate ends up exporting
all of them, including the filesystem stubs it has no real use for.

Building that shape directly for `wasm32-wasip2` produces an invalid
component: `wasi:cli/stdin`'s exported `input-stream` gets encoded as a
distinct, non-aliased type from `wasi:io/streams`' own `input-stream`, even
though both come from the same Rust `Stream` type and the same
`wit_bindgen::generate!` invocation. Inspecting the output with
`wasm-tools print` showed the streams shim instantiation using type `#38
input-stream` while the stdin shim instantiation used a different `#42
input-stream` — `wasm-tools validate` and Wasmtime both correctly reject
this as structurally invalid; it isn't a lint that can be waived with
`--no-validate`. Only the trivial single-function `wasi:cli/stdin` interface
triggers it — `wasi:http/types`' own `input-stream` usage (via
`incoming-body.stream()`) was never affected — suggesting a narrow bug in
rustc's wasip2 shim generator for that specific shape, not a general
shared-resource-type limitation.

The wasm32-wasip1 + `wasm-tools component new` pipeline sidesteps it because
wit-bindgen embeds the component type directly from its own generated
section, rather than rustc deriving one via per-interface "shim components"
— which is where the aliasing gets lost.

## Two `wit_bindgen::generate!` blocks in one crate

`src/bindings.rs` has its own `wit_bindgen::generate!` call, separate from
spin-sdk's internal one (used by `#[http_component]` in `guard`, and by
`spin_sdk::key_value`/`variables` calls here). Two independent `generate!`
invocations coexisting in a crate is an established pattern — spin-sdk does
the same for its own `experimental` module — since each targets a different
WIT world and there's no way to merge them into a single invocation.
