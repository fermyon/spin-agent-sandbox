//! Parses the sandbox's JSON request envelope.

use serde::Deserialize;

pub const MAX_BODY: usize = 8 * 1024 * 1024;
pub const MAX_CODE: usize = 5 * 1024 * 1024;

#[derive(Debug, Deserialize)]
pub struct RawInput {
    #[serde(default)]
    pub method: Option<String>,
    #[serde(default)]
    pub path: Option<String>,
    #[serde(default)]
    pub headers: Option<std::collections::BTreeMap<String, String>>,
    #[serde(default)]
    pub query: Option<std::collections::BTreeMap<String, String>>,
    #[serde(default)]
    pub body: Option<serde_json::Value>,
}

#[derive(Debug, Deserialize)]
pub struct RawEnvelope {
    pub code: String,
    #[serde(rename = "sandboxId")]
    pub sandbox_id: String,
    #[serde(default)]
    pub input: Option<RawInput>,
    // Per-request outbound allow-list, checked by guard-io's guarded
    // outgoing-handler (see crates/guard-io/src/egress.rs). Absent/empty means
    // default-deny for outbound HTTP.
    #[serde(rename = "allowedHosts", default)]
    pub allowed_hosts: Option<Vec<String>>,
    #[serde(rename = "kvEnabled", default)]
    pub kv_enabled: bool,
}

#[derive(Debug)]
pub struct Envelope {
    pub code: String,
    pub sandbox_id: String,
    pub input: Option<RawInput>,
    pub allowed_hosts: Option<Vec<String>>,
    pub kv_enabled: bool,
}

#[derive(Debug)]
pub enum EnvelopeError {
    /// 400: body isn't valid JSON, or is missing required fields.
    Invalid(String),
    /// 413: `code` exceeds MAX_CODE.
    CodeTooLarge,
    /// 413: request body exceeds MAX_BODY.
    BodyTooLarge,
}

pub fn validate(body: &[u8]) -> Result<Envelope, EnvelopeError> {
    if body.len() > MAX_BODY {
        return Err(EnvelopeError::BodyTooLarge);
    }
    let raw: RawEnvelope = serde_json::from_slice(body).map_err(|e| {
        EnvelopeError::Invalid(format!("request body must be a JSON envelope: {e}"))
    })?;
    if raw.code.len() > MAX_CODE {
        return Err(EnvelopeError::CodeTooLarge);
    }
    if raw.sandbox_id.trim().is_empty() {
        return Err(EnvelopeError::Invalid(
            "sandboxId must not be empty".to_string(),
        ));
    }
    Ok(Envelope {
        code: raw.code,
        sandbox_id: raw.sandbox_id,
        input: raw.input,
        allowed_hosts: raw.allowed_hosts,
        kv_enabled: raw.kv_enabled,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_a_full_envelope() {
        let body = br#"{
            "code": "console.log(1)",
            "sandboxId": "tenant-a",
            "input": {"method": "POST", "path": "/x", "body": "hi"},
            "allowedHosts": ["api.example.com"],
            "kvEnabled": true
        }"#;
        let env = validate(body).expect("valid envelope");
        assert_eq!(env.code, "console.log(1)");
        assert_eq!(env.sandbox_id, "tenant-a");
        let input = env.input.expect("input present");
        assert_eq!(input.method, Some("POST".to_string()));
        assert_eq!(input.path, Some("/x".to_string()));
        assert_eq!(env.allowed_hosts, Some(vec!["api.example.com".to_string()]));
        assert!(env.kv_enabled);
    }

    #[test]
    fn defaults_input_and_allowed_hosts_when_omitted() {
        let body = br#"{"code": "1", "sandboxId": "a"}"#;
        let env = validate(body).expect("valid envelope");
        assert!(env.input.is_none());
        // Absent allowedHosts means no outbound is permitted.
        assert_eq!(env.allowed_hosts, None);
        assert!(!env.kv_enabled);
    }

    #[test]
    fn rejects_malformed_json() {
        match validate(b"not json") {
            Err(EnvelopeError::Invalid(_)) => {}
            other => panic!("expected Invalid, got {other:?}"),
        }
    }

    #[test]
    fn rejects_missing_required_fields() {
        // `sandboxId` is missing entirely.
        match validate(br#"{"code": "1"}"#) {
            Err(EnvelopeError::Invalid(_)) => {}
            other => panic!("expected Invalid, got {other:?}"),
        }
    }

    #[test]
    fn rejects_empty_sandbox_id() {
        match validate(br#"{"code": "1", "sandboxId": ""}"#) {
            Err(EnvelopeError::Invalid(_)) => {}
            other => panic!("expected Invalid, got {other:?}"),
        }
    }

    #[test]
    fn rejects_whitespace_only_sandbox_id() {
        match validate(br#"{"code": "1", "sandboxId": "   "}"#) {
            Err(EnvelopeError::Invalid(_)) => {}
            other => panic!("expected Invalid, got {other:?}"),
        }
    }

    #[test]
    fn rejects_oversized_code() {
        let code = "a".repeat(MAX_CODE + 1);
        let body = serde_json::json!({"code": code, "sandboxId": "a"}).to_string();
        match validate(body.as_bytes()) {
            Err(EnvelopeError::CodeTooLarge) => {}
            other => panic!("expected CodeTooLarge, got {other:?}"),
        }
    }

    #[test]
    fn rejects_oversized_body() {
        let body = "x".repeat(MAX_BODY + 1);
        match validate(body.as_bytes()) {
            Err(EnvelopeError::BodyTooLarge) => {}
            other => panic!("expected BodyTooLarge, got {other:?}"),
        }
    }
}
