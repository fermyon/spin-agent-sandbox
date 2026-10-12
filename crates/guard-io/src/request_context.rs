//! Per-request sandbox ID, egress allow-list, and KV flag in fresh-instance thread-local state.

use std::cell::{Cell, RefCell};

thread_local! {
    static SANDBOX_ID: RefCell<String> = const { RefCell::new(String::new()) };
    static ALLOWED_HOSTS: RefCell<Vec<String>> = const { RefCell::new(Vec::new()) };
    static KV_ENABLED: Cell<bool> = const { Cell::new(false) };
}

pub fn set(sandbox_id: &str, allowed_hosts: Vec<String>, kv_enabled: bool) {
    SANDBOX_ID.with(|s| *s.borrow_mut() = sandbox_id.to_string());
    ALLOWED_HOSTS.with(|h| *h.borrow_mut() = allowed_hosts);
    KV_ENABLED.with(|enabled| enabled.set(kv_enabled));
}

pub fn sandbox_id() -> String {
    SANDBOX_ID.with(|s| s.borrow().clone())
}

pub fn allowed_hosts() -> Vec<String> {
    ALLOWED_HOSTS.with(|h| h.borrow().clone())
}

pub fn kv_enabled() -> bool {
    KV_ENABLED.with(Cell::get)
}
