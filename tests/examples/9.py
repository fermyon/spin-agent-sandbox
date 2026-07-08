# Dynamic HTML pages with Jinja2
from spin_sdk.http import Request, Response
from urllib.parse import urlparse, parse_qs
import jinja2

template = jinja2.Template("""<!DOCTYPE html>
<html><head>
  <meta charset="utf-8">
  <style>body{font-family:system-ui;max-width:640px;margin:2rem auto;padding:0 1rem;color:#333}</style>
</head><body>
  <h1>Hello, {{ name }}!</h1>
  <ul>
    {% for item in items %}
    <li>{{ item }}</li>
    {% endfor %}
  </ul>
</body></html>""")

def handle_request(request: Request) -> Response:
    params = parse_qs(urlparse(request.uri).query)
    name = params.get("name", ["friend"])[0]

    html = template.render(name=name, items=["Spin", "Jinja2", "WebAssembly"])
    return Response(200, {"content-type": "text/html"}, html.encode())
