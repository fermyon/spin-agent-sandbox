# Render markdown content as HTML
from spin_sdk.http import Request, Response
import markdown

def handle_request(request: Request) -> Response:
    content = markdown.markdown("""
# Welcome

This is a **markdown** page rendered by your script.

- Write any markdown here
- It gets converted to HTML automatically
- Powered by [python-markdown](https://python-markdown.github.io)

---

*Built on Spin*
""")

    html = f"""<!DOCTYPE html>
<html><head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>body{{font-family:system-ui;max-width:640px;margin:2rem auto;padding:0 1rem;color:#333;line-height:1.6}}a{{color:#0D203F}}</style>
</head><body>{content}</body></html>"""

    return Response(200, {"content-type": "text/html"}, html.encode())
