//! Exported `sandbox:guard/context@0.1.0` — guard-front calls
//! `set-request-context` once per request, before calling into ts-sandbox,
//! so `kv.rs` knows which sandboxId to prefix keys with, and `outgoing.rs`
//! knows which hosts the sandbox is allowed to reach, for that request.

pub fn set_request_context(sandbox_id: String, allowed_hosts: Option<Vec<String>>) {
    crate::request_context::set(&sandbox_id, allowed_hosts.unwrap_or_default());
}

pub fn take_captured_output() -> (String, String) {
    crate::stdio::take_captured()
}
