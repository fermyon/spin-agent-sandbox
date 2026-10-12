//! Pass-through `wasi:http/types` wrapper that converts stream resource types.

use crate::bindings::exports::wasi::http::types as guarded;
use crate::bindings::wasi::http::types as real;
use crate::stdio::Stream;

pub struct Fields(pub real::Fields);
pub struct IncomingRequest(pub real::IncomingRequest);
pub struct IncomingBody(pub real::IncomingBody);
pub struct OutgoingRequest(pub real::OutgoingRequest);
pub struct OutgoingBody(pub real::OutgoingBody);
pub struct ResponseOutparam(pub real::ResponseOutparam);
pub struct OutgoingResponse(pub real::OutgoingResponse);
pub struct IncomingResponse(pub real::IncomingResponse);
pub struct FutureIncomingResponse(pub real::FutureIncomingResponse);
pub struct RequestOptions(pub real::RequestOptions);
pub struct FutureTrailers(pub real::FutureTrailers);

impl guarded::GuestFields for Fields {
    fn new() -> Self {
        Fields(real::Fields::new())
    }

    fn from_list(
        entries: Vec<(String, Vec<u8>)>,
    ) -> Result<guarded::Fields, guarded::HeaderError> {
        real::Fields::from_list(&entries)
            .map(|f| guarded::Fields::new(Fields(f)))
            .map_err(map_header_error)
    }

    fn get(&self, name: String) -> Vec<Vec<u8>> {
        self.0.get(&name)
    }

    fn has(&self, name: String) -> bool {
        self.0.has(&name)
    }

    fn set(&self, name: String, value: Vec<Vec<u8>>) -> Result<(), guarded::HeaderError> {
        self.0.set(&name, &value).map_err(map_header_error)
    }

    fn delete(&self, name: String) -> Result<(), guarded::HeaderError> {
        self.0.delete(&name).map_err(map_header_error)
    }

    fn append(&self, name: String, value: Vec<u8>) -> Result<(), guarded::HeaderError> {
        self.0.append(&name, &value).map_err(map_header_error)
    }

    fn entries(&self) -> Vec<(String, Vec<u8>)> {
        self.0.entries()
    }

    fn clone(&self) -> guarded::Fields {
        guarded::Fields::new(Fields(self.0.clone()))
    }
}

fn map_header_error(e: real::HeaderError) -> guarded::HeaderError {
    match e {
        real::HeaderError::InvalidSyntax => guarded::HeaderError::InvalidSyntax,
        real::HeaderError::Forbidden => guarded::HeaderError::Forbidden,
        real::HeaderError::Immutable => guarded::HeaderError::Immutable,
    }
}

fn map_method(m: real::Method) -> guarded::Method {
    match m {
        real::Method::Get => guarded::Method::Get,
        real::Method::Head => guarded::Method::Head,
        real::Method::Post => guarded::Method::Post,
        real::Method::Put => guarded::Method::Put,
        real::Method::Delete => guarded::Method::Delete,
        real::Method::Connect => guarded::Method::Connect,
        real::Method::Options => guarded::Method::Options,
        real::Method::Trace => guarded::Method::Trace,
        real::Method::Patch => guarded::Method::Patch,
        real::Method::Other(s) => guarded::Method::Other(s),
    }
}

fn unmap_method(m: guarded::Method) -> real::Method {
    match m {
        guarded::Method::Get => real::Method::Get,
        guarded::Method::Head => real::Method::Head,
        guarded::Method::Post => real::Method::Post,
        guarded::Method::Put => real::Method::Put,
        guarded::Method::Delete => real::Method::Delete,
        guarded::Method::Connect => real::Method::Connect,
        guarded::Method::Options => real::Method::Options,
        guarded::Method::Trace => real::Method::Trace,
        guarded::Method::Patch => real::Method::Patch,
        guarded::Method::Other(s) => real::Method::Other(s),
    }
}

fn map_scheme(s: real::Scheme) -> guarded::Scheme {
    match s {
        real::Scheme::Http => guarded::Scheme::Http,
        real::Scheme::Https => guarded::Scheme::Https,
        real::Scheme::Other(s) => guarded::Scheme::Other(s),
    }
}

fn unmap_scheme(s: guarded::Scheme) -> real::Scheme {
    match s {
        guarded::Scheme::Http => real::Scheme::Http,
        guarded::Scheme::Https => real::Scheme::Https,
        guarded::Scheme::Other(s) => real::Scheme::Other(s),
    }
}

pub fn map_error_code(e: real::ErrorCode) -> guarded::ErrorCode {
    // error-code is a large, purely-structural enum (payload types don't
    // reference streams or anything else self-referential) — bytes/strings
    // round-trip untouched, so this is a mechanical variant-to-variant copy.
    use real::ErrorCode as R;
    use guarded::ErrorCode as G;
    match e {
        R::DnsTimeout => G::DnsTimeout,
        R::DnsError(p) => G::DnsError(guarded::DnsErrorPayload { rcode: p.rcode, info_code: p.info_code }),
        R::DestinationNotFound => G::DestinationNotFound,
        R::DestinationUnavailable => G::DestinationUnavailable,
        R::DestinationIpProhibited => G::DestinationIpProhibited,
        R::DestinationIpUnroutable => G::DestinationIpUnroutable,
        R::ConnectionRefused => G::ConnectionRefused,
        R::ConnectionTerminated => G::ConnectionTerminated,
        R::ConnectionTimeout => G::ConnectionTimeout,
        R::ConnectionReadTimeout => G::ConnectionReadTimeout,
        R::ConnectionWriteTimeout => G::ConnectionWriteTimeout,
        R::ConnectionLimitReached => G::ConnectionLimitReached,
        R::TlsProtocolError => G::TlsProtocolError,
        R::TlsCertificateError => G::TlsCertificateError,
        R::TlsAlertReceived(p) => {
            G::TlsAlertReceived(guarded::TlsAlertReceivedPayload { alert_id: p.alert_id, alert_message: p.alert_message })
        }
        R::HttpRequestDenied => G::HttpRequestDenied,
        R::HttpRequestLengthRequired => G::HttpRequestLengthRequired,
        R::HttpRequestBodySize(v) => G::HttpRequestBodySize(v),
        R::HttpRequestMethodInvalid => G::HttpRequestMethodInvalid,
        R::HttpRequestUriInvalid => G::HttpRequestUriInvalid,
        R::HttpRequestUriTooLong => G::HttpRequestUriTooLong,
        R::HttpRequestHeaderSectionSize(v) => G::HttpRequestHeaderSectionSize(v),
        R::HttpRequestHeaderSize(v) => G::HttpRequestHeaderSize(v.map(map_field_size_payload)),
        R::HttpRequestTrailerSectionSize(v) => G::HttpRequestTrailerSectionSize(v),
        R::HttpRequestTrailerSize(v) => G::HttpRequestTrailerSize(map_field_size_payload(v)),
        R::HttpResponseIncomplete => G::HttpResponseIncomplete,
        R::HttpResponseHeaderSectionSize(v) => G::HttpResponseHeaderSectionSize(v),
        R::HttpResponseHeaderSize(v) => G::HttpResponseHeaderSize(map_field_size_payload(v)),
        R::HttpResponseBodySize(v) => G::HttpResponseBodySize(v),
        R::HttpResponseTrailerSectionSize(v) => G::HttpResponseTrailerSectionSize(v),
        R::HttpResponseTrailerSize(v) => G::HttpResponseTrailerSize(map_field_size_payload(v)),
        R::HttpResponseTransferCoding(v) => G::HttpResponseTransferCoding(v),
        R::HttpResponseContentCoding(v) => G::HttpResponseContentCoding(v),
        R::HttpResponseTimeout => G::HttpResponseTimeout,
        R::HttpUpgradeFailed => G::HttpUpgradeFailed,
        R::HttpProtocolError => G::HttpProtocolError,
        R::LoopDetected => G::LoopDetected,
        R::ConfigurationError => G::ConfigurationError,
        R::InternalError(v) => G::InternalError(v),
    }
}

fn map_field_size_payload(p: real::FieldSizePayload) -> guarded::FieldSizePayload {
    guarded::FieldSizePayload { field_name: p.field_name, field_size: p.field_size }
}

fn unmap_field_size_payload(p: guarded::FieldSizePayload) -> real::FieldSizePayload {
    real::FieldSizePayload { field_name: p.field_name, field_size: p.field_size }
}

/// The reverse of `map_error_code` — needed only by `response-outparam.set`,
/// which is unreachable in practice (the guests never handle incoming HTTP;
/// guard-front does), but must still type-check since the whole
/// `wasi:http/types` interface is exported as one unit.
pub fn unmap_error_code(e: guarded::ErrorCode) -> real::ErrorCode {
    use guarded::ErrorCode as G;
    use real::ErrorCode as R;
    match e {
        G::DnsTimeout => R::DnsTimeout,
        G::DnsError(p) => R::DnsError(real::DnsErrorPayload { rcode: p.rcode, info_code: p.info_code }),
        G::DestinationNotFound => R::DestinationNotFound,
        G::DestinationUnavailable => R::DestinationUnavailable,
        G::DestinationIpProhibited => R::DestinationIpProhibited,
        G::DestinationIpUnroutable => R::DestinationIpUnroutable,
        G::ConnectionRefused => R::ConnectionRefused,
        G::ConnectionTerminated => R::ConnectionTerminated,
        G::ConnectionTimeout => R::ConnectionTimeout,
        G::ConnectionReadTimeout => R::ConnectionReadTimeout,
        G::ConnectionWriteTimeout => R::ConnectionWriteTimeout,
        G::ConnectionLimitReached => R::ConnectionLimitReached,
        G::TlsProtocolError => R::TlsProtocolError,
        G::TlsCertificateError => R::TlsCertificateError,
        G::TlsAlertReceived(p) => {
            R::TlsAlertReceived(real::TlsAlertReceivedPayload { alert_id: p.alert_id, alert_message: p.alert_message })
        }
        G::HttpRequestDenied => R::HttpRequestDenied,
        G::HttpRequestLengthRequired => R::HttpRequestLengthRequired,
        G::HttpRequestBodySize(v) => R::HttpRequestBodySize(v),
        G::HttpRequestMethodInvalid => R::HttpRequestMethodInvalid,
        G::HttpRequestUriInvalid => R::HttpRequestUriInvalid,
        G::HttpRequestUriTooLong => R::HttpRequestUriTooLong,
        G::HttpRequestHeaderSectionSize(v) => R::HttpRequestHeaderSectionSize(v),
        G::HttpRequestHeaderSize(v) => R::HttpRequestHeaderSize(v.map(unmap_field_size_payload)),
        G::HttpRequestTrailerSectionSize(v) => R::HttpRequestTrailerSectionSize(v),
        G::HttpRequestTrailerSize(v) => R::HttpRequestTrailerSize(unmap_field_size_payload(v)),
        G::HttpResponseIncomplete => R::HttpResponseIncomplete,
        G::HttpResponseHeaderSectionSize(v) => R::HttpResponseHeaderSectionSize(v),
        G::HttpResponseHeaderSize(v) => R::HttpResponseHeaderSize(unmap_field_size_payload(v)),
        G::HttpResponseBodySize(v) => R::HttpResponseBodySize(v),
        G::HttpResponseTrailerSectionSize(v) => R::HttpResponseTrailerSectionSize(v),
        G::HttpResponseTrailerSize(v) => R::HttpResponseTrailerSize(unmap_field_size_payload(v)),
        G::HttpResponseTransferCoding(v) => R::HttpResponseTransferCoding(v),
        G::HttpResponseContentCoding(v) => R::HttpResponseContentCoding(v),
        G::HttpResponseTimeout => R::HttpResponseTimeout,
        G::HttpUpgradeFailed => R::HttpUpgradeFailed,
        G::HttpProtocolError => R::HttpProtocolError,
        G::LoopDetected => R::LoopDetected,
        G::ConfigurationError => R::ConfigurationError,
        G::InternalError(v) => R::InternalError(v),
    }
}

impl guarded::GuestIncomingRequest for IncomingRequest {
    fn method(&self) -> guarded::Method {
        map_method(self.0.method())
    }
    fn path_with_query(&self) -> Option<String> {
        self.0.path_with_query()
    }
    fn scheme(&self) -> Option<guarded::Scheme> {
        self.0.scheme().map(map_scheme)
    }
    fn authority(&self) -> Option<String> {
        self.0.authority()
    }
    fn headers(&self) -> guarded::Fields {
        guarded::Fields::new(Fields(self.0.headers()))
    }
    fn consume(&self) -> Result<guarded::IncomingBody, ()> {
        self.0.consume().map(|b| guarded::IncomingBody::new(IncomingBody(b)))
    }
}

impl guarded::GuestIncomingBody for IncomingBody {
    fn stream(&self) -> Result<guarded::InputStream, ()> {
        self.0.stream().map(Stream::wrap_real_input)
    }

    fn finish(this: guarded::IncomingBody) -> guarded::FutureTrailers {
        let inner: IncomingBody = this.into_inner();
        guarded::FutureTrailers::new(FutureTrailers(real::IncomingBody::finish(inner.0)))
    }
}

impl guarded::GuestOutgoingRequest for OutgoingRequest {
    fn new(headers: guarded::Fields) -> Self {
        let headers: Fields = headers.into_inner();
        OutgoingRequest(real::OutgoingRequest::new(headers.0))
    }

    fn body(&self) -> Result<guarded::OutgoingBody, ()> {
        self.0.body().map(|b| guarded::OutgoingBody::new(OutgoingBody(b)))
    }
    fn method(&self) -> guarded::Method {
        map_method(self.0.method())
    }
    fn set_method(&self, method: guarded::Method) -> Result<(), ()> {
        self.0.set_method(&unmap_method(method))
    }
    fn path_with_query(&self) -> Option<String> {
        self.0.path_with_query()
    }
    fn set_path_with_query(&self, path_with_query: Option<String>) -> Result<(), ()> {
        self.0.set_path_with_query(path_with_query.as_deref())
    }
    fn scheme(&self) -> Option<guarded::Scheme> {
        self.0.scheme().map(map_scheme)
    }
    fn set_scheme(&self, scheme: Option<guarded::Scheme>) -> Result<(), ()> {
        self.0.set_scheme(scheme.map(unmap_scheme).as_ref())
    }
    fn authority(&self) -> Option<String> {
        self.0.authority()
    }
    fn set_authority(&self, authority: Option<String>) -> Result<(), ()> {
        self.0.set_authority(authority.as_deref())
    }
    fn headers(&self) -> guarded::Fields {
        guarded::Fields::new(Fields(self.0.headers()))
    }
}

impl guarded::GuestOutgoingBody for OutgoingBody {
    fn write(&self) -> Result<guarded::OutputStream, ()> {
        self.0.write().map(Stream::wrap_real_output)
    }

    fn finish(this: guarded::OutgoingBody, trailers: Option<guarded::Fields>) -> Result<(), guarded::ErrorCode> {
        let inner: OutgoingBody = this.into_inner();
        let trailers = trailers.map(|t| {
            let t: Fields = t.into_inner();
            t.0
        });
        real::OutgoingBody::finish(inner.0, trailers).map_err(map_error_code)
    }
}

impl guarded::GuestResponseOutparam for ResponseOutparam {
    fn set(param: guarded::ResponseOutparam, response: Result<guarded::OutgoingResponse, guarded::ErrorCode>) {
        let param: ResponseOutparam = param.into_inner();
        let response = response.map(|r| {
            let r: OutgoingResponse = r.into_inner();
            r.0
        });
        real::ResponseOutparam::set(param.0, response.map_err(unmap_error_code));
    }
}

impl guarded::GuestOutgoingResponse for OutgoingResponse {
    fn new(headers: guarded::Fields) -> Self {
        let headers: Fields = headers.into_inner();
        OutgoingResponse(real::OutgoingResponse::new(headers.0))
    }
    fn status_code(&self) -> u16 {
        self.0.status_code()
    }
    fn set_status_code(&self, status_code: u16) -> Result<(), ()> {
        self.0.set_status_code(status_code)
    }
    fn headers(&self) -> guarded::Fields {
        guarded::Fields::new(Fields(self.0.headers()))
    }
    fn body(&self) -> Result<guarded::OutgoingBody, ()> {
        self.0.body().map(|b| guarded::OutgoingBody::new(OutgoingBody(b)))
    }
}

impl guarded::GuestIncomingResponse for IncomingResponse {
    fn status(&self) -> u16 {
        self.0.status()
    }
    fn headers(&self) -> guarded::Fields {
        guarded::Fields::new(Fields(self.0.headers()))
    }
    fn consume(&self) -> Result<guarded::IncomingBody, ()> {
        self.0.consume().map(|b| guarded::IncomingBody::new(IncomingBody(b)))
    }
}

impl guarded::GuestFutureIncomingResponse for FutureIncomingResponse {
    fn subscribe(&self) -> crate::bindings::wasi::io::poll::Pollable {
        self.0.subscribe()
    }

    fn get(&self) -> Option<Result<Result<guarded::IncomingResponse, guarded::ErrorCode>, ()>> {
        self.0.get().map(|outer| {
            outer.map(|inner| {
                inner
                    .map(|resp| guarded::IncomingResponse::new(IncomingResponse(resp)))
                    .map_err(map_error_code)
            })
        })
    }
}

impl guarded::GuestRequestOptions for RequestOptions {
    fn new() -> Self {
        RequestOptions(real::RequestOptions::new())
    }
    fn connect_timeout(&self) -> Option<u64> {
        self.0.connect_timeout()
    }
    fn set_connect_timeout(&self, duration: Option<u64>) -> Result<(), ()> {
        self.0.set_connect_timeout(duration)
    }
    fn first_byte_timeout(&self) -> Option<u64> {
        self.0.first_byte_timeout()
    }
    fn set_first_byte_timeout(&self, duration: Option<u64>) -> Result<(), ()> {
        self.0.set_first_byte_timeout(duration)
    }
    fn between_bytes_timeout(&self) -> Option<u64> {
        self.0.between_bytes_timeout()
    }
    fn set_between_bytes_timeout(&self, duration: Option<u64>) -> Result<(), ()> {
        self.0.set_between_bytes_timeout(duration)
    }
}

impl guarded::GuestFutureTrailers for FutureTrailers {
    fn subscribe(&self) -> crate::bindings::wasi::io::poll::Pollable {
        self.0.subscribe()
    }

    fn get(&self) -> Option<Result<Result<Option<guarded::Fields>, guarded::ErrorCode>, ()>> {
        self.0.get().map(|outer| {
            outer.map(|inner| {
                inner
                    .map(|opt| opt.map(|f| guarded::Fields::new(Fields(f))))
                    .map_err(map_error_code)
            })
        })
    }
}

pub fn http_error_code(err: &crate::bindings::wasi::io::error::Error) -> Option<guarded::ErrorCode> {
    real::http_error_code(err).map(map_error_code)
}
