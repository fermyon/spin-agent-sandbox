//! Exported `sandbox:guard/context@0.1.0` — guard-front calls
//! `set-request-context` once per request, before calling into ts-sandbox,
//! so `kv.rs` knows which sandboxId to prefix keys with for that request.

pub fn set_request_context(sandbox_id: String) {
    crate::request_context::set(&sandbox_id);
}

pub fn take_captured_output() -> (String, String) {
    crate::stdio::take_captured()
}
