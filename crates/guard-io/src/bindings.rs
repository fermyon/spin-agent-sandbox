//! Bindings for `wit/guard-io/world.wit`, pinned to the guest ABI versions.

wit_bindgen::generate!({
    path: "../../wit/guard-io",
    world: "guard-io",
    generate_all,
});
