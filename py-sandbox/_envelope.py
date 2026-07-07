"""Request envelope validation and synthetic-request shaping (pure; no spin_sdk import).

`validate_envelope` returns (env, error) where error is a plain dict describing the HTTP
error (or None). `build_request_args` computes the pieces of the synthetic request; the
caller wraps them in a spin_sdk.http.Request.
"""

import json
import urllib.parse

MAX_BODY = 8 * 1024 * 1024     # reject request bodies larger than this
MAX_CODE = 5 * 1024 * 1024     # reject user code larger than this


def validate_envelope(body):
    """Return (env, None) on success, or (None, {status, error, message}) on failure."""
    if body is None:
        return None, {"status": 400, "error": "invalid_envelope", "message": "missing request body"}
    if len(body) > MAX_BODY:
        return None, {"status": 413, "error": "body_too_large",
                      "message": f"request body exceeds {MAX_BODY} bytes"}
    try:
        env = json.loads(body)
    except Exception as e:  # noqa: BLE001
        return None, {"status": 400, "error": "invalid_json", "message": str(e)}
    if (
        not isinstance(env, dict)
        or not isinstance(env.get("code"), str)
        or not isinstance(env.get("sandboxId"), str)
    ):
        return None, {"status": 400, "error": "invalid_envelope",
                      "message": "expected {code: str, sandboxId: str, input?, allowedHosts?}"}
    if len(env["code"]) > MAX_CODE:
        return None, {"status": 413, "error": "code_too_large",
                      "message": f"code exceeds {MAX_CODE} bytes"}
    return env, None


def build_request_args(i):
    """Derive (method, uri, headers, body) for the synthetic handler request from input."""
    i = i or {}
    method = str(i.get("method", "GET")).upper()
    headers = {str(k).lower(): str(v) for k, v in (i.get("headers") or {}).items()}
    q = i.get("query") or {}
    query = urllib.parse.urlencode({str(k): v for k, v in q.items()}, doseq=True)
    uri = "/" + (f"?{query}" if query else "")
    body = i.get("body")
    if isinstance(body, str):
        body = body.encode()
    elif isinstance(body, (dict, list)):
        body = json.dumps(body).encode()
    elif body is not None:
        body = str(body).encode()
    return method, uri, headers, body
