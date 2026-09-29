//! Per-request sandbox ID and egress policy in fresh-instance thread-local state.

use std::cell::RefCell;

thread_local! {
    static SANDBOX_ID: RefCell<String> = const { RefCell::new(String::new()) };
    static ALLOWED_HOSTS: RefCell<Vec<String>> = const { RefCell::new(Vec::new()) };
}

pub fn set(sandbox_id: &str, allowed_hosts: Vec<String>) {
    SANDBOX_ID.with(|s| *s.borrow_mut() = sandbox_id.to_string());
    ALLOWED_HOSTS.with(|h| *h.borrow_mut() = allowed_hosts);
}

pub fn sandbox_id() -> String {
    SANDBOX_ID.with(|s| s.borrow().clone())
}

pub fn allowed_hosts() -> Vec<String> {
    ALLOWED_HOSTS.with(|h| h.borrow().clone())
}

