//! Exports request context for KV isolation and outbound egress checks.

pub fn set_request_context(sandbox_id: String, allowed_hosts: Option<Vec<String>>, kv_enabled: bool) {
    crate::request_context::set(&sandbox_id, allowed_hosts.unwrap_or_default(), kv_enabled);
}

pub fn take_captured_output() -> (String, String) {
    crate::stdio::take_captured()
}
