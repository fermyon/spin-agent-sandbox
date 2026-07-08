from spin_sdk.http import Request, Response

import io, sys, json

def handle_request(request: Request) -> Response:
    _buf = io.StringIO()
    _old = sys.stdout
    sys.stdout = _buf
    _error = None
    try:

        import math

        # Calculate factorial of 15
        result = math.factorial(15)
        print(f"15! = {result}")

        # Let's also show it with formatting for better readability
        print(f"15! = {result:,}")

        # Show the calculation step by step for understanding
        print("\nStep-by-step calculation:")
        print("15! = 15 × 14 × 13 × 12 × 11 × 10 × 9 × 8 × 7 × 6 × 5 × 4 × 3 × 2 × 1")

        # Manual calculation to verify
        manual_result = 1
        for i in range(1, 16):
            manual_result *= i
            
        print(f"\nVerification with manual calculation: {manual_result:,}")
        print(f"Results match: {result == manual_result}")

        # Some interesting facts about 15!
        print(f"\nInteresting facts about 15!:")
        print(f"• Number of digits: {len(str(result))}")
        print(f"• In scientific notation: {result:.3e}")
        print(f"• This is the number of ways to arrange 15 distinct objects in a row")


    except Exception as e:
        _error = str(e)
    finally:
        sys.stdout = _old
    body = json.dumps({"stdout": _buf.getvalue(), "error": _error})
    return Response(status=200, headers={"content-type": "application/json"}, body=body.encode())
