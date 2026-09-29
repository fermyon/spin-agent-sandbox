# Persistent counter using the KV store
from spin_sdk.http import Request, Response
from spin_sdk.key_value import open_default
from urllib.parse import urlparse, parse_qs
import json

def handle_request(request: Request) -> Response:
    store = open_default()
    params = parse_qs(urlparse(request.uri).query)
    key = params.get("key", ["default"])[0]

    raw = store.get(f"counter:{key}")
    count = (json.loads(raw) if raw else 0) + 1
    store.set(f"counter:{key}", json.dumps(count).encode())

    return Response(200, {"content-type": "application/json"},
        json.dumps({"key": key, "counter": count}).encode())
