//! Hand-rolled bindings for this crate's `guard-io` world (see
//! `wit/world.wit`), pinned to the exact `@0.2.10`/`@2.0.0`/`@0.1.0` interface
//! versions the JS component's ABI uses. Separate `generate!` invocation from
//! spin-sdk's own internal one — see `README.md`.

wit_bindgen::generate!({
    path: "wit",
    world: "guard-io",
    generate_all,
});
