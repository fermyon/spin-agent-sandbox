# Test regex patterns against input strings
from spin_sdk.http import Request, Response
import regex
import json

def handle_request(request: Request) -> Response:
    if request.method == "POST" and request.body:
        body = json.loads(request.body)
        pattern = body.get("pattern", "")
        text = body.get("text", "")
    else:
        pattern = r"(?P<year>\d{4})-(?P<month>\d{2})-(?P<day>\d{2})"
        text = "Dates: 2026-03-25, 2025-12-01, and 2024-07-04"

    matches = []
    for m in regex.finditer(pattern, text):
        matches.append({
            "match": m.group(),
            "start": m.start(),
            "end": m.end(),
            "groups": m.groups() if m.groups() else None,
            "named": m.groupdict() if m.groupdict() else None,
        })

    return Response(200, {"content-type": "application/json"},
        json.dumps({
            "pattern": pattern,
            "text": text,
            "match_count": len(matches),
            "matches": matches,
        }, indent=2).encode())
