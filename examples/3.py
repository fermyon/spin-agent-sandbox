# Interactive chart with Plotly
from spin_sdk.http import Request, Response
import plotly.graph_objects as go

def handle_request(request: Request) -> Response:
    months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun"]
    revenue = [42, 58, 35, 80, 67, 99]

    fig = go.Figure(data=[
        go.Bar(x=months, y=revenue, marker_color="#dbdee6")
    ])
    fig.update_layout(
        title="Monthly Reevenue",
        xaxis_title="Month",
        yaxis_title="Revenue ($k)",
        template="plotly_white",
    )

    return plot(fig)
