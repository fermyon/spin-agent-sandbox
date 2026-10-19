# Smoke tests for Spin Sandbox. Request bodies are read from disk (tests/bodies/*.json)
# via hurl's `file,<path>;` keyword rather than inlined here. Run with:
#   spin up --listen 127.0.0.1:3007 &
#   hurl --variable base_url=http://127.0.0.1:3007 --test tests/smoke.hurl
# For full example coverage use tests/run-examples.sh (it wraps examples/* on the fly).

# --- TS: main-program shape (stdout/stderr capture) ---
POST {{base_url}}/ts/run
content-type: application/json
file,bodies/ts-main.json;
HTTP 200
[Asserts]
jsonpath "$.stdout" contains "hi from ts"
jsonpath "$.stdout" contains "42"
jsonpath "$.stderr" contains "oops"
jsonpath "$.error" == null

# --- TS: handler shape (export default { fetch }) ---
POST {{base_url}}/ts/run
content-type: application/json
file,bodies/ts-handler.json;
HTTP 200
[Asserts]
jsonpath "$.ok" == true

# --- TS: scoped KV via the documented @spinframework/spin-kv API ---
POST {{base_url}}/ts/run
content-type: application/json
file,bodies/ts-kv.json;
HTTP 200
[Asserts]
jsonpath "$.n" == 7

# --- KV: default-deny (TypeScript) ---
POST {{base_url}}/ts/run
content-type: application/json
file,bodies/ts-kv-deny.json;
HTTP 200
[Asserts]
jsonpath "$.stdout" contains "DENIED"
jsonpath "$.stdout" not contains "ALLOWED"

# --- Python: main-program shape ---
POST {{base_url}}/py/run
content-type: application/json
file,bodies/py-main.json;
HTTP 200
[Asserts]
jsonpath "$.stdout" contains "hi from py"
jsonpath "$.stdout" contains "42"
jsonpath "$.error" == null

# --- Python: handler response streams iterable chunks ---
POST {{base_url}}/py/run
content-type: application/json
file,bodies/py-handler-stream.json;
HTTP 200
[Asserts]
body == "first-second"

# --- Python: handler shape + scoped KV via the documented spin_sdk.key_value API ---
POST {{base_url}}/py/run
content-type: application/json
file,bodies/py-kv.json;
HTTP 200
[Asserts]
body contains "v"

# --- KV: default-deny (Python) ---
POST {{base_url}}/py/run
content-type: application/json
file,bodies/py-kv-deny.json;
HTTP 200
[Asserts]
jsonpath "$.stdout" contains "DENIED"
jsonpath "$.stdout" not contains "ALLOWED"

# --- Invalid envelope is rejected ---
POST {{base_url}}/py/run
content-type: application/json
file,bodies/bad-envelope.json;
HTTP 400

# --- sandboxId longer than 256 bytes is rejected (it prefixes every KV key and log line) ---
POST {{base_url}}/py/run
content-type: application/json
file,bodies/sandbox-id-too-long.json;
HTTP 400
[Asserts]
jsonpath "$.message" contains "sandboxId"

# ===========================================================================
# Security regression gates. The KV-isolation gates fail under an unprefixed
# "{id}-{key}" scheme.
# ===========================================================================

# --- KV isolation (Python): sandbox "iso-a" must NOT see sandbox "iso-a-b"'s key ---
# Prefix-collision attack: under that scheme, "iso-a" + key "b-secret" maps to the same
# physical key as "iso-a-b" + key "secret". Write first, then attempt the cross-sandbox read.
POST {{base_url}}/py/run
content-type: application/json
file,bodies/py-kv-iso-write.json;
HTTP 200
[Asserts]
jsonpath "$.stdout" contains "wrote"

POST {{base_url}}/py/run
content-type: application/json
file,bodies/py-kv-iso-read.json;
HTTP 200
[Asserts]
jsonpath "$.error" == null
jsonpath "$.stdout" not contains "TOPSECRET"
jsonpath "$.stdout" contains "leaked=None"
jsonpath "$.stdout" contains "keys=[]"

# --- KV isolation (TypeScript): same cross-sandbox read must be blocked ---
POST {{base_url}}/ts/run
content-type: application/json
file,bodies/ts-kv-iso-write.json;
HTTP 200
[Asserts]
jsonpath "$.stdout" contains "wrote"

POST {{base_url}}/ts/run
content-type: application/json
file,bodies/ts-kv-iso-read.json;
HTTP 200
[Asserts]
jsonpath "$.error" == null
jsonpath "$.stdout" not contains "TOPSECRET"
jsonpath "$.stdout" contains "leaked=null"
jsonpath "$.stdout" contains "keys=[]"

# --- Egress (TypeScript): default-deny with no allowedHosts ---
POST {{base_url}}/ts/run
content-type: application/json
file,bodies/ts-egress-deny.json;
HTTP 200
[Asserts]
jsonpath "$.stdout" contains "DENIED"
jsonpath "$.stdout" not contains "ALLOWED"

# --- Egress: a bare "*" in the per-request allow-list must NOT grant all ---
POST {{base_url}}/ts/run
content-type: application/json
file,bodies/ts-egress-star.json;
HTTP 200
[Asserts]
jsonpath "$.stdout" contains "DENIED"
jsonpath "$.stdout" not contains "ALLOWED"

# --- Egress SSRF backstop: an allow-listed INTERNAL target is still refused by policy ---
# The TS error text does not name the cause, so the duration bound tells a policy denial
# (immediate) apart from a connection attempt that merely failed or timed out.
POST {{base_url}}/ts/run
content-type: application/json
file,bodies/ts-egress-internal.json;
HTTP 200
[Asserts]
duration < 2000
jsonpath "$.stdout" contains "DENIED"
jsonpath "$.stdout" not contains "ALLOWED"

# --- Egress: an explicitly allow-listed public host succeeds ---
POST {{base_url}}/ts/run
content-type: application/json
file,bodies/ts-egress-allow.json;
HTTP 200
[Asserts]
jsonpath "$.stdout" contains "ALLOWED"
jsonpath "$.stdout" not contains "DENIED"

# --- Egress (Python): the same gates through spin_sdk.http. The Python error names the
# cause, so these assert the policy denial itself. ---
POST {{base_url}}/py/run
content-type: application/json
file,bodies/py-egress-deny.json;
HTTP 200
[Asserts]
jsonpath "$.stdout" contains "HttpRequestDenied"
jsonpath "$.stdout" not contains "ALLOWED"

POST {{base_url}}/py/run
content-type: application/json
file,bodies/py-egress-star.json;
HTTP 200
[Asserts]
jsonpath "$.stdout" contains "HttpRequestDenied"
jsonpath "$.stdout" not contains "ALLOWED"

POST {{base_url}}/py/run
content-type: application/json
file,bodies/py-egress-internal.json;
HTTP 200
[Asserts]
jsonpath "$.stdout" contains "HttpRequestDenied"
jsonpath "$.stdout" not contains "ALLOWED"

POST {{base_url}}/py/run
content-type: application/json
file,bodies/py-egress-allow.json;
HTTP 200
[Asserts]
jsonpath "$.stdout" contains "ALLOWED"
jsonpath "$.stdout" not contains "DENIED"

# --- Structured errors: user code cannot crash the guest instead of getting JSON back ---
# Python BaseException subclasses (KeyboardInterrupt, SystemExit) are caught like Exception.
POST {{base_url}}/py/run
content-type: application/json
file,bodies/py-base-exception.json;
HTTP 200
[Asserts]
jsonpath "$.stdout" contains "before"
jsonpath "$.error" contains "KeyboardInterrupt"

# A non-integer status is a handler error, not a failed u16 conversion.
POST {{base_url}}/py/run
content-type: application/json
file,bodies/py-bad-status.json;
HTTP 500
[Asserts]
jsonpath "$.error" == "handler_error"
jsonpath "$.message" contains "status"

# A lone surrogate in the error text is escaped so it can cross the WIT boundary.
POST {{base_url}}/py/run
content-type: application/json
file,bodies/py-surrogate-error.json;
HTTP 200
[Asserts]
jsonpath "$.error" contains "\\ud800"

# A thrown value whose string conversion throws is still reported.
POST {{base_url}}/ts/run
content-type: application/json
file,bodies/ts-unstringifiable-throw.json;
HTTP 200
[Asserts]
jsonpath "$.stdout" contains "before"
jsonpath "$.error" isString

# A non-byte stream chunk ends the body (status is already sent) instead of trapping.
POST {{base_url}}/ts/run
content-type: application/json
file,bodies/ts-bad-stream-chunk.json;
HTTP 200
[Asserts]
body == ""

# --- Both components reject a non-POST request with 405 (the manual method check) ---
GET {{base_url}}/ts/run
HTTP 405
[Asserts]
jsonpath "$.error" == "method_not_allowed"

GET {{base_url}}/py/run
HTTP 405
[Asserts]
jsonpath "$.error" == "method_not_allowed"
