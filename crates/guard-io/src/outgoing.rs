//! Exported `wasi:http/outgoing-handler` — what the guest's `fetch()` calls
//! into. A transparent forward to the real import; outbound-host policy is
//! Spin's `allowed_outbound_hosts` (see `spin.toml`), not this component's job.
//! Exists as an export only because `guard-io` must own all of `wasi:http/types`
//! (see `http_types.rs`), and this operates on that interface's resource types.

use crate::bindings::exports::wasi::http::outgoing_handler as guarded;
use crate::bindings::wasi::http::outgoing_handler as real;
use crate::http_types::{map_error_code, FutureIncomingResponse, OutgoingRequest, RequestOptions};

pub fn handle(
    request: guarded::OutgoingRequest,
    options: Option<guarded::RequestOptions>,
) -> Result<guarded::FutureIncomingResponse, guarded::ErrorCode> {
    let request: OutgoingRequest = request.into_inner();
    let options = options.map(|o| {
        let o: RequestOptions = o.into_inner();
        o.0
    });

    real::handle(request.0, options)
        .map(|f| guarded::FutureIncomingResponse::new(FutureIncomingResponse(f)))
        .map_err(map_error_code)
}
