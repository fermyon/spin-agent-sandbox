"""Pure executor logic kept free of generated bindings for unit tests."""

import traceback
from collections.abc import Iterable, Iterator, Mapping, Set as AbstractSet
from typing import Any, Dict, List, Optional, Tuple, Union
from urllib.parse import quote, urlencode


ResponseBody = Union[bytes, Iterator[Union[bytes, str]]]


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
        qs = urlencode(query, quote_via=quote)
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
                headers.append((str(k), str(item)))
        else:
            headers.append((str(k), str(v)))

    return status, headers, body


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
    try:
        compiled = compile(code, "<user_code>", "exec")
    except Exception as e:
        return ("compile_error", str(e))

    ns = {"__name__": "__main__"}
    try:
        exec(compiled, ns)
    except Exception:
        return ("main_error", traceback.format_exc())

    handler = ns.get("handle_request")
    if callable(handler):
        try:
            req = Request(request["method"], request["uri"], request["headers"], request["body"])
            resp = handler(req)
            status, headers, body = normalize_response(resp)
            return ("handler_response", status, headers, body)
        except Exception:
            return ("handler_error", traceback.format_exc())

    return ("main", None)
