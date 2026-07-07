#!/usr/bin/env bash
# End-to-end check: wrap every file in examples/ into a sandbox envelope, POST it to
# the matching endpoint, and report pass/fail. Language is detected by CONTENT (not the
# .py/.ts extension), because some example files are deliberately mislabeled.
#
# Usage:  spin up   # in another terminal (or `spin up --listen 127.0.0.1:3007`)
#         BASE=http://127.0.0.1:3007 tests/run-examples.sh
set -uo pipefail

BASE="${BASE:-http://127.0.0.1:3000}"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
EXAMPLES="$HERE/../examples"
source "$HERE/lib.sh"

pass=0; fail=0; known=0
results=""

for f in $(ls "$EXAMPLES" | sort -t. -k1 -n); do
  src="$EXAMPLES/$f"
  [ -f "$src" ] || continue
  lang="$(detect_lang "$src")"
  route="/$lang/run"
  input="$(input_for "$f")"

  body="$(jq -n --rawfile c "$src" --argjson in "$input" \
          '{code:$c, sandboxId:("harness-"+($c|@base64|.[0:8])), input:$in}')"
  status="$(curl -s -o /tmp/sbx_body -w '%{http_code}' --max-time 120 \
            -X POST "$BASE$route" -H 'content-type: application/json' --data "$body")"
  out="$(cat /tmp/sbx_body)"

  verdict="PASS"
  if [ "$status" -ge 400 ]; then
    verdict="FAIL"
  elif echo "$out" | grep -qE '"error": ?"(handler_error|internal|transpile_error|compile_error|invalid_envelope|invalid_json)"'; then
    verdict="FAIL"
  elif echo "$out" | jq -e 'type=="object" and has("stdout") and (.error != null)' >/dev/null 2>&1; then
    verdict="FAIL"   # main-shape script raised
  fi

  if is_known_fail "$f"; then
    [ "$verdict" = "FAIL" ] && verdict="KNOWN-FAIL" || verdict="UNEXPECTED-PASS"
  fi

  case "$verdict" in
    PASS) pass=$((pass+1)) ;;
    KNOWN-FAIL) known=$((known+1)) ;;
    *) fail=$((fail+1)) ;;
  esac

  snippet="$(echo "$out" | tr -d '\n' | cut -c1-70)"
  printf '  %-6s %-4s [%s]  %s\n' "$f" "$lang" "$verdict" "$snippet"
  results="$results\n$f:$verdict"
done

echo ""
echo "summary: $pass passed, $fail failed, $known known-fail (pinned)"
[ "$fail" -eq 0 ]
