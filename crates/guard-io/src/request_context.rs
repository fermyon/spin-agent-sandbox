//! Per-request state (sandboxId) parsed from the envelope by `lib.rs` before
//! it ever calls into JS, and read by the guarded `kv` export while handling
//! that same request. Safe as plain thread-local state: Wasm components are
//! single-threaded, and Spin's HTTP trigger gives each request a fresh
//! component instance, so nothing here outlives — or leaks into — another
//! request.

use std::cell::RefCell;

thread_local! {
    static SANDBOX_ID: RefCell<String> = const { RefCell::new(String::new()) };
}

pub fn set(sandbox_id: &str) {
    SANDBOX_ID.with(|s| *s.borrow_mut() = sandbox_id.to_string());
}

pub fn sandbox_id() -> String {
    SANDBOX_ID.with(|s| s.borrow().clone())
}
