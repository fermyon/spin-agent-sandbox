//! Implements the WASI interfaces the JS guest imports — guarded per-sandbox
//! `fermyon:spin/key-value`, captured `wasi:cli/stdout`/`stderr`, stubbed
//! `wasi:filesystem/*` — so the guest never reaches the real host directly.
//! Kept as a separate component from `guard` to avoid an instantiation cycle
//! (guard needs the guest's `executor` export; the guest needs this crate's
//! exports). Outbound HTTP is a transparent passthrough — see `outgoing.rs`.

mod bindings;
mod context;
mod filesystem;
mod http_types;
mod kv;
mod outgoing;
mod request_context;
mod stdio;

pub struct Component;

impl bindings::exports::fermyon::spin::key_value::Guest for Component {
    type Store = kv::PrefixingStore;
}

impl bindings::exports::wasi::http::outgoing_handler::Guest for Component {
    fn handle(
        request: bindings::exports::wasi::http::outgoing_handler::OutgoingRequest,
        options: Option<bindings::exports::wasi::http::outgoing_handler::RequestOptions>,
    ) -> Result<
        bindings::exports::wasi::http::outgoing_handler::FutureIncomingResponse,
        bindings::exports::wasi::http::outgoing_handler::ErrorCode,
    > {
        outgoing::handle(request, options)
    }
}

impl bindings::exports::sandbox::guard::context::Guest for Component {
    fn set_request_context(sandbox_id: String) {
        context::set_request_context(sandbox_id)
    }

    fn take_captured_output() -> (String, String) {
        context::take_captured_output()
    }
}

impl bindings::exports::wasi::io::streams::Guest for Component {
    type OutputStream = stdio::Stream;
    type InputStream = stdio::Stream;
}

impl bindings::exports::wasi::cli::stdout::Guest for Component {
    fn get_stdout() -> bindings::exports::wasi::io::streams::OutputStream {
        stdio::Stdout::get_stdout()
    }
}

impl bindings::exports::wasi::cli::stderr::Guest for Component {
    fn get_stderr() -> bindings::exports::wasi::io::streams::OutputStream {
        stdio::Stderr::get_stderr()
    }
}

impl bindings::exports::wasi::cli::stdin::Guest for Component {
    fn get_stdin() -> bindings::exports::wasi::io::streams::InputStream {
        stdio::GuestStdin::get_stdin()
    }
}

impl bindings::exports::wasi::filesystem::types::Guest for Component {
    type Descriptor = filesystem::Descriptor;
    type DirectoryEntryStream = filesystem::DirectoryEntryStream;

    fn filesystem_error_code(
        err: &bindings::wasi::io::error::Error,
    ) -> Option<bindings::exports::wasi::filesystem::types::ErrorCode> {
        filesystem::filesystem_error_code(err)
    }
}

impl bindings::exports::wasi::filesystem::preopens::Guest for Component {
    fn get_directories() -> Vec<(bindings::exports::wasi::filesystem::preopens::Descriptor, String)> {
        filesystem::Preopens::get_directories()
    }
}

impl bindings::exports::wasi::http::types::Guest for Component {
    type Fields = http_types::Fields;
    type IncomingRequest = http_types::IncomingRequest;
    type IncomingBody = http_types::IncomingBody;
    type OutgoingRequest = http_types::OutgoingRequest;
    type OutgoingBody = http_types::OutgoingBody;
    type ResponseOutparam = http_types::ResponseOutparam;
    type OutgoingResponse = http_types::OutgoingResponse;
    type IncomingResponse = http_types::IncomingResponse;
    type FutureIncomingResponse = http_types::FutureIncomingResponse;
    type RequestOptions = http_types::RequestOptions;
    type FutureTrailers = http_types::FutureTrailers;

    fn http_error_code(
        err: &bindings::wasi::io::error::Error,
    ) -> Option<bindings::exports::wasi::http::types::ErrorCode> {
        http_types::http_error_code(err)
    }
}

bindings::export!(Component with_types_in bindings);
