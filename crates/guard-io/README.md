# guard-io

Implements the guarded WASI interfaces consumed by sandbox guests: scoped
`fermyon:spin/key-value`, filtered `wasi:http/outgoing-handler`, captured stdio,
and stubbed filesystem interfaces. It builds as a native `wasm32-wasip2` component.

## Two `wit_bindgen::generate!` blocks in one crate

`src/bindings.rs` generates this crate's WIT bindings separately from spin-sdk's
internal bindings because they target different worlds.
