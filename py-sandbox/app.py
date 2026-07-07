"""py-sandbox — executes dynamic Python code received as a JSON envelope.

Request (POST, body = strict JSON envelope):
    {code: str, sandboxId: str, input?: {method?, headers?, query?, body?}, allowedHosts?: [str]}

The user `code` is exec'd in a fresh namespace. Two code shapes are supported:
    - handler: code defines `handle_request(request) -> Response`. A synthetic
      spin_sdk.http.Request is built from `input`, the handler is called, and its
      Response is returned verbatim.
    - main:    code is a plain script that prints. stdout + stderr are captured and
      returned as {stdout, stderr, error} JSON.

Pre-configured dependencies are imported at module top so componentize-py freezes
them into the component (it only bundles the static import closure of this module;
modules reached only via runtime exec/import would otherwise be missing).
"""

# --- stdlib ---
import io
import sys
import json
import math  # noqa: F401  (commonly used by user code)
import types
import traceback
import urllib.parse
import re

from spin_sdk.http import IncomingHandler, Request, Response, send as _orig_send
import spin_sdk.http as _spin_http
import spin_sdk.key_value as _key_value

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

# NOTE on plotly (pinned / partially supported): plotly is installed and importable,
# but constructing figures fails in this runtime. It combines two patterns
# componentize-py does not handle out of the box: deep lazy imports
# (plotly.graph_objects -> graph_objs._figure -> ... -> plotly.animation, etc., which
# must each be eagerly imported here to be frozen in) and runtime reads of packaged
# data files (validators/templates JSON) which need to be mounted via the component's
# `files` directive (componentize-py exposes no readable filesystem). Both are doable
# (a files-mount + an exhaustive eager-import walk got it to figure construction) but
# are deferred. `plot()` below is ready for when plotly is fully wired.

# --- freeze block: popular extras (best-effort; a missing one must not break load) ---
for _m in (
    "plotly",
    "plotly.graph_objects",
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
# Scoped KV. There is one shared `default` store; each sandbox sees only its own
# keys, namespaced as f"{sandboxId}-{key}".
#
# The wrapper is a faithful drop-in for the documented Spin SDK key-value API, so
# code written against the Spin docs runs unmodified and scoped:
#   - canonical:  `from spin_sdk import key_value; key_value.open_default()`
#     Store methods: get / set / delete / exists / get_keys (bytes) + context manager.
#   - we also expose get_json / set_json (matching the Spin TypeScript SDK) and a
#     `spin_sdk.kv` alias, as conveniences some snippets use.
# ---------------------------------------------------------------------------
class _ScopedStore:
    def __init__(self, inner, prefix):
        self._inner = inner
        self._p = prefix

    def get(self, key):
        return self._inner.get(self._p + key)

    def set(self, key, value):
        self._inner.set(self._p + key, value)

    def delete(self, key):
        self._inner.delete(self._p + key)

    def exists(self, key):
        return self._inner.exists(self._p + key)

    def get_keys(self):
        n = len(self._p)
        return [k[n:] for k in self._inner.get_keys() if k.startswith(self._p)]

    # Conveniences (mirror the Spin TypeScript SDK); not in the canonical Python SDK.
    def get_json(self, key):
        raw = self.get(key)
        return None if raw is None else json.loads(raw)

    def set_json(self, key, value):
        self.set(key, json.dumps(value).encode())

    def __enter__(self):
        return self

    def __exit__(self, *a):
        ex = getattr(self._inner, "__exit__", None)
        return ex(*a) if ex is not None else False


def _scoped_open_default(prefix):
    def open_default():
        return _ScopedStore(_orig_kv_open_default(), prefix)
    return open_default


def _scoped_open(prefix):
    def open_(name="default"):
        return _ScopedStore(_orig_kv_open(name), prefix)
    return open_


def _install_scoped_kv(sandbox_id):
    prefix = f"{sandbox_id}-"
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
# Outbound HTTP: per-sandbox allow-list, layered on the broad Spin manifest bound.
# ---------------------------------------------------------------------------
def _host_allowed(url, allowed):
    host = (urllib.parse.urlparse(url).hostname or "").lower()
    for raw in allowed or []:
        if raw == "*":
            return True
        pat = re.sub(r"^[a-z]+://", "", raw, flags=re.I).split("/")[0].lower()
        if pat.startswith("*."):
            base = pat[2:]
            if host == base or host.endswith("." + base):
                return True
        elif host == pat:
            return True
    return False


def _install_fetch(allowed_hosts):
    allowed = list(allowed_hosts or [])

    def guarded_send(req):
        if not _host_allowed(req.uri, allowed):
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
# Convenience helpers injected into the user namespace.
# ---------------------------------------------------------------------------
def _plot(fig):
    """Render a plotly figure to an HTML Response (example 3.py calls plot(fig))."""
    html = fig.to_html(full_html=True, include_plotlyjs="cdn")
    return Response(200, {"content-type": "text/html"}, html.encode())


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
    return Request(method, uri, headers, body)


def _cap(s):
    return s if len(s) <= _MAX_OUTPUT else s[:_MAX_OUTPUT] + "\n...[truncated]"


def _run(env):
    code = env["code"]
    sandbox_id = env["sandboxId"]
    input_ = env.get("input") or {}

    _install_scoped_kv(sandbox_id)
    fetch = _install_fetch(env.get("allowedHosts"))

    ns = {"__name__": "__main__", "fetch": fetch, "plot": _plot}
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
    if request.body is None:
        return None, _json(400, {"error": "invalid_envelope", "message": "missing request body"})
    try:
        env = json.loads(request.body)
    except Exception as e:  # noqa: BLE001
        return None, _json(400, {"error": "invalid_json", "message": str(e)})
    if (
        not isinstance(env, dict)
        or not isinstance(env.get("code"), str)
        or not isinstance(env.get("sandboxId"), str)
    ):
        return None, _json(
            400,
            {"error": "invalid_envelope",
             "message": "expected {code: str, sandboxId: str, input?, allowedHosts?}"},
        )
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
