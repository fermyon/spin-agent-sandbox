# Persistent counter using the KV store
from spin_sdk.http import Request, Response
from spin_sdk.kv import open_default
from urllib.parse import urlparse, parse_qs
import json

def handle_request(request: Request) -> Response:
    store = open_default()
    params = parse_qs(urlparse(request.uri).query)
    key = params.get("key", ["default"])[0]

    count = (store.get_json(f"counter:{key}") or 0) + 1
    store.set_json(f"counter:{key}", count)

    return Response(200, {"content-type": "application/json"},
        json.dumps({"key": key, "counter": count}).encode())
