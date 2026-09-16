# Overrides spin_sdk/http.py (a package dir in the real spin-sdk PyPI package)
# after build.sh installs spin-sdk into vendor/. The real http.py assumes the
# component itself exports wasi:http/incoming-handler (a full Spin HTTP app),
# which doesn't fit this pure-executor component (guard:front owns the real
# HTTP entry point) — `from spin_sdk.wit import exports` fails to import at
# build time otherwise, since our targeted world exports nothing wasi:http-shaped.
# Everything else (key_value.py, __init__.py, the WIT itself) is the real,
# unmodified spin-sdk package.
from spin_sdk.wit.imports import types as wasi_http_types, outgoing_handler


class Request:
    """Compatibility Request for user code (matches spin_sdk.http.Request)."""

    def __init__(self, method: str = "GET", uri: str = "/", headers: dict | None = None, body: bytes | None = None):
        self.method = method.upper()
        self.uri = uri
        self.headers = headers or {}
        self.body = body


class Response:
    """Compatibility Response for user code (matches spin_sdk.http.Response)."""

    def __init__(self, status: int = 200, headers: dict | None = None, body: bytes | None = None):
        self.status = status
        self.headers = headers or {}
        self.body = body


def send(request: Request) -> wasi_http_types.IncomingResponse:
    """Send an outbound HTTP request (forwarded through guard-io)."""
    fields = wasi_http_types.Fields()
    for k, v in (request.headers or {}).items():
        if isinstance(v, list):
            for item in v:
                fields.append(str(k), str(item).encode())
        else:
            fields.set(str(k), [str(v).encode()])

    out_req = wasi_http_types.OutgoingRequest(fields)
    out_req.set_method(_method_variant(request.method))
    out_req.set_path_with_query(request.uri)

    body_bytes = request.body
    if body_bytes and isinstance(body_bytes, str):
        body_bytes = body_bytes.encode()

    future = outgoing_handler.handle(out_req, None)

    result = future.get()
    if result is None:
        raise RuntimeError("HTTP request failed")
    return result.ok()


def _method_variant(method: str):
    """Convert method string to wasi_http_types.Method variant."""
    variants = {
        "GET": wasi_http_types.MethodGet,
        "HEAD": wasi_http_types.MethodHead,
        "POST": wasi_http_types.MethodPost,
        "PUT": wasi_http_types.MethodPut,
        "DELETE": wasi_http_types.MethodDelete,
        "CONNECT": wasi_http_types.MethodConnect,
        "OPTIONS": wasi_http_types.MethodOptions,
        "TRACE": wasi_http_types.MethodTrace,
        "PATCH": wasi_http_types.MethodPatch,
    }
    ctor = variants.get(method.upper())
    if ctor:
        return ctor()
    return wasi_http_types.MethodOther(method)
