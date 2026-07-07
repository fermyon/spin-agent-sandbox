# Render data as an HTML table
from spin_sdk.http import Request, Response
from tabulate import tabulate

def handle_request(request: Request) -> Response:
    data = [
        ["Alice", "Engineering", 92],
        ["Bob", "Design", 87],
        ["Carol", "Engineering", 95],
        ["Dave", "Marketing", 78],
    ]
    headers = ["Name", "Department", "Score"]

    table_html = tabulate(data, headers=headers, tablefmt="html")

    html = f"""<!DOCTYPE html>
<html><head>
  <meta charset="utf-8">
  <style>
    body {{ font-family: system-ui; max-width: 640px; margin: 2rem auto; padding: 0 1rem; color: #333; }}
    h1 {{ margin-bottom: 1rem; }}
    table {{ border-collapse: collapse; width: 100%; }}
    th, td {{ text-align: left; padding: 8px 12px; border-bottom: 1px solid #eee; }}
    th {{ font-weight: 600; color: #555; border-bottom: 2px solid #ddd; }}
    tr:hover {{ background: #f9f9f9; }}
  </style>
</head><body>
  <h1>Team Scores</h1>
  {table_html}
</body></html>"""

    return Response(200, {"content-type": "text/html"}, html.encode())
