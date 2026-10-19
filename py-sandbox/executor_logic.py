"""Pure executor logic kept free of generated bindings for unit tests."""

import traceback
from collections.abc import Iterable, Iterator, Mapping, Set as AbstractSet
from typing import Any, Dict, List, Optional, Tuple, Union


ResponseBody = Union[bytes, Iterator[Union[bytes, str]]]


def wit_text(value: Any) -> str:
    """Render `value` as a string that can cross the WIT boundary.

    User code controls exception messages and header values, and a lone surrogate
    (e.g. "\\ud800") cannot be lowered to a WIT string, which would trap the component.
    """
    try:
        text = str(value)
    except BaseException:  # noqa: BLE001 - a user __str__ can raise anything.
        text = f"<unprintable {type(value).__name__}>"
    return text.encode("utf-8", "backslashreplace").decode("utf-8")


def _format_exc() -> str:
    try:
        return wit_text(traceback.format_exc())
    except BaseException:  # noqa: BLE001
        return "error: could not format the exception"


class Request:
    """Duck-typed stand-in for spin_sdk.http.Request — user `handle_request`
    code only ever accesses .method/.uri/.headers/.body, never isinstance-checks
    against the real class, so this avoids importing spin_sdk here."""

    def __init__(self, method: str = "GET", uri: str = "/", headers: Optional[dict] = None, body: Optional[bytes] = None):
        self.method = method
        self.uri = uri
        self.headers = headers or {}
        self.body = body


def build_request(method: str = "GET", path: str = "/", headers: Optional[dict] = None, query=None, body=None) -> dict:
    """Build a synthetic request dict for a run-input (or lack thereof)."""
    uri = path
    if query:
        qs = "&".join(f"{k}={v}" for k, v in query)
        sep = "&" if "?" in uri else "?"
        uri = f"{uri}{sep}{qs}"
    return {"method": method, "uri": uri, "headers": dict(headers) if headers else {}, "body": body}


def normalize_response(handler_result: Any) -> Tuple[int, List[Tuple[str, str]], ResponseBody]:
    """Extract (status, headers, body) from a user handler's return value.

    A bytes/string body is buffered; an iterable of bytes/string chunks is preserved
    for the WIT body-stream adapter to pull incrementally.
    """
    if hasattr(handler_result, "status"):
        status = handler_result.status
        raw_headers = handler_result.headers
        body = handler_result.body
    elif isinstance(handler_result, (tuple, list)):
        status = handler_result[0]
        raw_headers = handler_result[1] if len(handler_result) > 1 else {}
        body = handler_result[2] if len(handler_result) > 2 else b""
    else:
        status = 200
        raw_headers = {"content-type": "text/plain"}
        body = str(handler_result)

    # A non-int or out-of-range status cannot be lowered to the WIT u16 and would
    # trap the component, so reject it here as a handler error.
    if isinstance(status, bool) or not isinstance(status, int) or not 100 <= status <= 999:
        raise ValueError(f"response status must be an integer from 100 to 999, got {status!r}")

    if isinstance(body, str):
        body = body.encode("utf-8")
    elif isinstance(body, (bytearray, memoryview)):
        body = bytes(body)
    elif body is None:
        body = b""
    elif isinstance(body, (Mapping, AbstractSet)):
        raise TypeError("response body must be bytes, str, or an iterable of bytes/str chunks")
    elif not isinstance(body, bytes):
        if not isinstance(body, Iterable):
            body = str(body).encode("utf-8")
        else:
            body = iter(body)

    headers: List[Tuple[str, str]] = []
    for k, v in (raw_headers or {}).items():
        if isinstance(v, list):
            for item in v:
                headers.append((_header_text(k), _header_text(item)))
        else:
            headers.append((_header_text(k), _header_text(v)))

    return status, headers, body


def _header_text(value: Any) -> str:
    text = str(value)
    try:
        text.encode("utf-8")
    except UnicodeEncodeError:
        raise ValueError(f"response header {text!r} is not valid UTF-8") from None
    return text


def iter_chunks(body: ResponseBody, chunk_size: int = 65536) -> Iterator[bytes]:
    """Yield buffered data in bounded pieces or preserve supplied stream chunks."""
    if isinstance(body, bytes):
        pos = 0
        while pos < len(body):
            yield body[pos:pos + chunk_size]
            pos += chunk_size
        return

    for chunk in body:
        if isinstance(chunk, str):
            yield chunk.encode("utf-8")
        elif isinstance(chunk, (bytes, bytearray, memoryview)):
            yield bytes(chunk)
        else:
            raise TypeError("response stream chunks must be bytes or str")


def run_code(code: str, request: Dict[str, Any]) -> tuple:
    """Compile + exec user code, detect main vs handler shape, and run it.

    Returns a tagged tuple:
      ("compile_error", message)
      ("main", None)
      ("main_error", traceback_str)
      ("handler_response", status, headers, body)
      ("handler_error", traceback_str)
    """
    # User code can raise BaseException subclasses (SystemExit, KeyboardInterrupt, or
    # BaseException itself). Letting one escape would trap the component instead of
    # returning a structured error, so every stage below catches BaseException.
    try:
        compiled = compile(code, "<user_code>", "exec")
    except BaseException as e:  # noqa: BLE001
        return ("compile_error", wit_text(e))

    ns = {"__name__": "__main__"}
    try:
        exec(compiled, ns)
    except SystemExit as e:
        # `sys.exit()` / `sys.exit(0)` ends a script normally; any other code is an error.
        if e.code is None or e.code == 0:
            return ("main", None)
        return ("main_error", _format_exc())
    except BaseException:  # noqa: BLE001
        return ("main_error", _format_exc())

    handler = ns.get("handle_request")
    if callable(handler):
        try:
            req = Request(request["method"], request["uri"], request["headers"], request["body"])
            resp = handler(req)
            status, headers, body = normalize_response(resp)
            return ("handler_response", status, headers, body)
        except BaseException:  # noqa: BLE001
            return ("handler_error", _format_exc())

    return ("main", None)
