//! Enforces per-request egress policy before forwarding guest outbound HTTP requests.

use crate::bindings::exports::wasi::http::outgoing_handler as guarded;
use crate::bindings::wasi::http::outgoing_handler as real;
use crate::bindings::wasi::http::types::Scheme;
use crate::http_types::{map_error_code, FutureIncomingResponse, OutgoingRequest, RequestOptions};

/// The scheme string `egress::host_allowed` matches allow-list entries
/// against. It must be the scheme the host will actually use: wasmtime-wasi-http
/// sends a request with no scheme as `https` (`req.scheme.unwrap_or(Scheme::Https)`),
/// so checking it as `http` would let `http://host` or `host:80` entries admit a
/// TLS request to port 443.
fn scheme_str(scheme: Option<Scheme>) -> String {
    match scheme {
        Some(Scheme::Http) => "http".to_string(),
        Some(Scheme::Https) | None => "https".to_string(),
        Some(Scheme::Other(s)) => s,
    }
}

pub fn handle(
    request: guarded::OutgoingRequest,
    options: Option<guarded::RequestOptions>,
) -> Result<guarded::FutureIncomingResponse, guarded::ErrorCode> {
    let request: OutgoingRequest = request.into_inner();

    let scheme = scheme_str(request.0.scheme());
    let authority = request.0.authority().unwrap_or_default();
    let allowed = crate::request_context::allowed_hosts();
    if !crate::egress::host_allowed(&scheme, &authority, &allowed) {
        return Err(guarded::ErrorCode::HttpRequestDenied);
    }

    let options = options.map(|o| {
        let o: RequestOptions = o.into_inner();
        o.0
    });

    real::handle(request.0, options)
        .map(|f| guarded::FutureIncomingResponse::new(FutureIncomingResponse(f)))
        .map_err(map_error_code)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn an_absent_scheme_is_checked_as_https_like_the_host_sends_it() {
        assert_eq!(scheme_str(None), "https");
        let http_only = vec!["http://example.com".to_string()];
        assert!(!crate::egress::host_allowed(&scheme_str(None), "example.com", &http_only));
        let port_80 = vec!["example.com:80".to_string()];
        assert!(!crate::egress::host_allowed(&scheme_str(None), "example.com", &port_80));
        let https = vec!["https://example.com".to_string()];
        assert!(crate::egress::host_allowed(&scheme_str(None), "example.com", &https));
    }

    #[test]
    fn explicit_schemes_are_passed_through() {
        assert_eq!(scheme_str(Some(Scheme::Http)), "http");
        assert_eq!(scheme_str(Some(Scheme::Https)), "https");
        assert_eq!(scheme_str(Some(Scheme::Other("ftp".to_string()))), "ftp");
    }
}
