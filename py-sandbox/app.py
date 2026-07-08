"""py-sandbox — executes dynamic Python code received as a JSON envelope.

Request (POST, body = strict JSON envelope):
    {code: str, sandboxId: str, input?: {method?, headers?, query?, body?}, allowedHosts?: [str]}

The user `code` is exec'd in a fresh namespace. Two code shapes are supported:
    - handler: code defines `handle_request(request) -> Response`. A synthetic
      spin_sdk.http.Request is built from `input`, the handler is called, and its
      Response is returned verbatim.
    - main:    code is a plain script that prints. stdout + stderr are captured and
      returned as {stdout, stderr, error} JSON.

This module is the Spin glue layer; the logic lives in focused, spin-free modules:
    _kv.py (scoped store), _egress.py (allow-list), _envelope.py (validation + request).

Pre-configured dependencies are imported at module top so componentize-py freezes them
into the component (it only bundles the static import closure of this module; modules
reached only via runtime exec/import would otherwise be missing).
"""

# --- stdlib ---
import io
import sys
import json
import math  # noqa: F401  (commonly used by user code)
import types
import traceback

from spin_sdk.http import IncomingHandler, Request, Response, send as _orig_send
import spin_sdk.http as _spin_http
import spin_sdk.key_value as _key_value

from _kv import ScopedStore, scoped_prefix
from _egress import host_allowed
from _envelope import validate_envelope, build_request_args

# Originals captured so the scoped factories can reach the real store without recursion.
_orig_kv_open_default = _key_value.open_default
_orig_kv_open = _key_value.open

# --- freeze block: examples' dependencies (must import cleanly) ---
import numpy            # noqa: F401
import tabulate         # noqa: F401
import markdown         # noqa: F401
import markupsafe       # noqa: F401
import jinja2           # noqa: F401
import regex            # noqa: F401
import bs4              # noqa: F401
import soupsieve        # noqa: F401

# --- freeze block: popular extras (best-effort; a missing one must not break load) ---
for _m in (
    "yaml",
    "sqlalchemy",
    "sqlalchemy.dialects.sqlite",
    "pydantic",
    "pydantic_core",
    "tiktoken",
    "tiktoken_ext.openai_public",
    "charset_normalizer",
    "yarl",
    "multidict",
    "frozenlist",
    "wrapt",
):
    try:
        __import__(_m)
    except Exception:  # noqa: BLE001 - resilient load; a flaky extra shouldn't kill the component
        pass

_MAX_OUTPUT = 256 * 1024  # cap captured stdout/stderr


# ---------------------------------------------------------------------------
# Scoped KV install. Patches the canonical spin_sdk modules so documented usage
# (`from spin_sdk import key_value; key_value.open_default()`) is transparently scoped.
# The scoping logic itself lives in _kv.py.
# ---------------------------------------------------------------------------
def _scoped_open_default(prefix):
    def open_default():
        return ScopedStore(_orig_kv_open_default(), prefix)
    return open_default


def _scoped_open(prefix):
    def open_(name="default"):
        return ScopedStore(_orig_kv_open(name), prefix)
    return open_


def _install_scoped_kv(sandbox_id):
    prefix = scoped_prefix(sandbox_id)
    open_default = _scoped_open_default(prefix)
    open_ = _scoped_open(prefix)

    # Patch the canonical module so documented usage is transparently scoped.
    _key_value.open_default = open_default
    _key_value.open = open_

    # Compatibility alias: `from spin_sdk.kv import open_default`.
    mod = sys.modules.get("spin_sdk.kv") or types.ModuleType("spin_sdk.kv")
    mod.open_default = open_default
    mod.open = open_
    sys.modules["spin_sdk.kv"] = mod


# ---------------------------------------------------------------------------
# Outbound HTTP: gate every egress path (the injected fetch and spin_sdk.http.send)
# through the per-sandbox allow-list from _egress.host_allowed.
# ---------------------------------------------------------------------------
def _install_fetch(allowed_hosts):
    allowed = list(allowed_hosts or [])

    def guarded_send(req):
        if not host_allowed(req.uri, allowed):
            raise PermissionError(
                f"outbound host not allowed by sandbox: {req.uri} (allowedHosts={allowed})"
            )
        return _orig_send(req)

    # Wrap the module-level send so user code that calls spin_sdk.http.send is gated too.
    _spin_http.send = guarded_send

    def fetch(url, method="GET", headers=None, body=None):
        if isinstance(body, str):
            body = body.encode()
        resp = guarded_send(Request(method, url, dict(headers or {}), body))
        return {
            "status": resp.status,
            "headers": dict(resp.headers),
            "body": resp.body.decode("utf-8", "replace") if resp.body else "",
        }

    return fetch


# ---------------------------------------------------------------------------
# Response helpers.
# ---------------------------------------------------------------------------
def _json(status, obj):
    return Response(status, {"content-type": "application/json"}, json.dumps(obj).encode())


def _coerce(resp):
    if isinstance(resp, Response):
        return resp
    if isinstance(resp, (bytes, bytearray)):
        return Response(200, {"content-type": "application/octet-stream"}, bytes(resp))
    if isinstance(resp, str):
        return Response(200, {"content-type": "text/plain"}, resp.encode())
    return _json(200, resp)


def _build_request(i):
    method, uri, headers, body = build_request_args(i)
    return Request(method, uri, headers, body)


def _cap(s):
    return s if len(s) <= _MAX_OUTPUT else s[:_MAX_OUTPUT] + "\n...[truncated]"


def _run(env):
    code = env["code"]
    sandbox_id = env["sandboxId"]
    input_ = env.get("input") or {}

    _install_scoped_kv(sandbox_id)
    fetch = _install_fetch(env.get("allowedHosts"))

    ns = {"__name__": "__main__", "fetch": fetch}
    out, errbuf = io.StringIO(), io.StringIO()
    old_out, old_err = sys.stdout, sys.stderr
    sys.stdout, sys.stderr = out, errbuf
    try:
        try:
            compiled = compile(code, "<user_code>", "exec")
            exec(compiled, ns)
        except Exception:
            return _json(
                200,
                {"stdout": _cap(out.getvalue()), "stderr": _cap(errbuf.getvalue()),
                 "error": traceback.format_exc()},
            )

        handler = ns.get("handle_request")
        if callable(handler):
            sys.stdout, sys.stderr = old_out, old_err  # handler owns its own output
            req = _build_request(input_)
            try:
                resp = handler(req)
            except Exception:
                return _json(500, {"error": "handler_error", "trace": traceback.format_exc()})
            return _coerce(resp)

        # main shape
        return _json(
            200,
            {"stdout": _cap(out.getvalue()), "stderr": _cap(errbuf.getvalue()), "error": None},
        )
    finally:
        sys.stdout, sys.stderr = old_out, old_err
        _spin_http.send = _orig_send  # don't leak the per-request allow-list
        _key_value.open_default = _orig_kv_open_default  # don't leak the per-sandbox prefix
        _key_value.open = _orig_kv_open


def _parse_envelope(request):
    env, err = validate_envelope(request.body)
    if err is not None:
        return None, _json(err["status"], {"error": err["error"], "message": err["message"]})
    return env, None


class IncomingHandler(IncomingHandler):
    def handle_request(self, request: Request) -> Response:
        try:
            env, err = _parse_envelope(request)
            if err is not None:
                return err
            return _run(env)
        except Exception:
            return _json(500, {"error": "internal", "trace": traceback.format_exc()})
