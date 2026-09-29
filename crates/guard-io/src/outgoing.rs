//! Exported `wasi:http/outgoing-handler` — what the guest's `fetch()` calls
//! into. Enforces the per-request `allowedHosts` egress policy (see
//! `egress.rs`) before forwarding to the real import.

use crate::bindings::exports::wasi::http::outgoing_handler as guarded;
use crate::bindings::wasi::http::outgoing_handler as real;
use crate::bindings::wasi::http::types::Scheme;
use crate::http_types::{map_error_code, FutureIncomingResponse, OutgoingRequest, RequestOptions};

/// The scheme string `egress::host_allowed` matches allow-list entries
/// against. `wasi:http/types` defaults an absent scheme to `http`.
fn scheme_str(scheme: Option<Scheme>) -> String {
    match scheme {
        Some(Scheme::Http) | None => "http".to_string(),
        Some(Scheme::Https) => "https".to_string(),
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
