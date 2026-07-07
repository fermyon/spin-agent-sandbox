# Compute statistics on numeric data with NumPy
from spin_sdk.http import Request, Response
import numpy as np
import json

def handle_request(request: Request) -> Response:
    # Accept JSON array via POST, or use sample data
    if request.method == "POST" and request.body:
        data = json.loads(request.body)
        values = np.array(data.get("values", [1, 2, 3]))
    else:
        values = np.array([23, 45, 12, 67, 34, 89, 56, 78, 11, 43])

    stats = {
        "count": len(values),
        "mean": float(np.mean(values)),
        "median": float(np.median(values)),
        "std": float(np.std(values)),
        "min": float(np.min(values)),
        "max": float(np.max(values)),
        "percentiles": {
            "25th": float(np.percentile(values, 25)),
            "75th": float(np.percentile(values, 75)),
            "90th": float(np.percentile(values, 90)),
        },
        "sorted": np.sort(values).tolist(),
    }

    return Response(200, {"content-type": "application/json"},
        json.dumps(stats, indent=2).encode())
