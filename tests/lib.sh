# Shared helpers for the example-driven test scripts (run-examples.sh, gen-bodies.sh).

# TS if the source looks like JS/TS; otherwise Python. Route by CONTENT, not the
# .py/.ts extension — some example files are deliberately mislabeled.
detect_lang() {
  if grep -qE 'export default|console\.log\(|=>' "$1"; then echo ts; else echo py; fi
}

# Per-example request input for handler-shape examples that read the request.
# Anything not listed defaults to a plain GET.
input_for() {
  case "$1" in
    1.py)  echo '{"method":"POST","body":{"values":[10,20,30,40]}}' ;;
    4.py)  echo '{"method":"GET","query":{"key":"hits"}}' ;;
    9.py)  echo '{"method":"GET","query":{"name":"Ada"}}' ;;
    2.ts)  echo '{"method":"GET","query":{"name":"Ada"}}' ;;
    3.ts)  echo '{"method":"POST","body":{"text":"first note"}}' ;;
    4.ts)  echo '{"method":"GET","query":{"key":"hits"}}' ;;
    6.ts)  echo '{"method":"POST","body":{"name":"Ada","email":"ada@example.com","age":30}}' ;;
    *)     echo '{"method":"GET"}' ;;
  esac
}

# main-program shape (no HTTP handler): the response is {stdout, stderr, error}.
is_main_shape() {
  ! grep -qE 'def handle_request|export default' "$1"
}

# Examples intentionally set aside (not asserted). None currently — every example is expected
# to pass. Add cases here (e.g. `3.py) return 0 ;;`) to pin a known failure.
is_known_fail() { case "$1" in *) return 1 ;; esac; }
