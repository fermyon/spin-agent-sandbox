# Smoke tests for the Wasm sandbox. Request bodies are read from disk (tests/bodies/*.json)
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

# --- Python: main-program shape ---
POST {{base_url}}/py/run
content-type: application/json
file,bodies/py-main.json;
HTTP 200
[Asserts]
jsonpath "$.stdout" contains "hi from py"
jsonpath "$.stdout" contains "42"
jsonpath "$.error" == null

# --- Python: handler shape + scoped KV via the documented spin_sdk.key_value API ---
POST {{base_url}}/py/run
content-type: application/json
file,bodies/py-kv.json;
HTTP 200
[Asserts]
body contains "v"

# --- Invalid envelope is rejected ---
POST {{base_url}}/py/run
content-type: application/json
file,bodies/bad-envelope.json;
HTTP 400

# ===========================================================================
# Security regression gates. The KV-isolation gates fail on the historical
# "{id}-{key}" scheme.
# ===========================================================================

# --- KV isolation (Python): sandbox "iso-a" must NOT see sandbox "iso-a-b"'s key ---
# Prefix-collision attack: "iso-a" + key "b-secret" once mapped to the same physical
# key as "iso-a-b" + key "secret". Write first, then attempt the cross-sandbox read.
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

# --- Both components reject a non-POST request with 405 (the manual method check) ---
GET {{base_url}}/ts/run
HTTP 405
[Asserts]
jsonpath "$.error" == "method_not_allowed"

GET {{base_url}}/py/run
HTTP 405
[Asserts]
jsonpath "$.error" == "method_not_allowed"
