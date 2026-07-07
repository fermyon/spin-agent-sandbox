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
