#!/usr/bin/env bash
# End-to-end check: wrap every file in tests/examples/ into a sandbox envelope, POST it to
# the matching endpoint, and report pass/fail. Language is detected by CONTENT (not the
# .py/.ts extension), because some example files are deliberately mislabeled.
#
# Usage:  spin up   # in another terminal (or `spin up --listen 127.0.0.1:3007`)
#         BASE=http://127.0.0.1:3007 tests/run-examples.sh
# Each response body is printed; SHOW_RESPONSES=0 for a summary only, SHOW_LINES=N to
# change how many lines of each body are shown (default 15).
set -uo pipefail

BASE="${BASE:-http://127.0.0.1:3000}"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
EXAMPLES="$HERE/examples"
source "$HERE/lib.sh"

pass=0; fail=0; known=0

while IFS= read -r -u 3 f; do
  src="$EXAMPLES/$f"
  [ -f "$src" ] || continue
  lang="$(detect_lang "$src")"
  route="/$lang/run"
  input="$(input_for "$f")"
    kv_enabled="$(kv_enabled_for "$f")"

    body="$(jq -n --rawfile c "$src" --argjson in "$input" --argjson kv "$kv_enabled" \
      '{code:$c, sandboxId:("harness-"+($c|@base64|.[0:8])), input:$in, kvEnabled:$kv}')"
  # Capture the response body AND status in one shot (no temp file), so a failed body
  # write can't yield an empty body that passes vacuously. The status is the trailing line.
  resp="$(curl -s -w $'\n%{http_code}' --max-time 120 \
          -X POST "$BASE$route" -H 'content-type: application/json' --data "$body")"
  status="${resp##*$'\n'}"   # last line: HTTP status ("000" if the server is unreachable)
  out="${resp%$'\n'*}"       # everything before it: the response body

  verdict="PASS"
  if [ -z "$out" ] || [ "$status" = "000" ]; then
    verdict="FAIL"   # no response; is the server running at $BASE?
  elif [ "$status" -ge 400 ]; then
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

  printf '  %-6s %-4s [%s]  (HTTP %s)\n' "$f" "$lang" "$verdict" "$status"
  if [ "${SHOW_RESPONSES:-1}" != "0" ]; then
    # Pretty-print JSON; show the first lines (caps large bodies like big HTML responses).
    pretty="$(printf '%s' "$out" | jq . 2>/dev/null || printf '%s' "$out")"
    printf '%s\n' "$pretty" | head -n "${SHOW_LINES:-15}" | sed 's/^/      /'
    n="$(printf '%s\n' "$pretty" | wc -l | tr -d ' ')"
    [ "$n" -gt "${SHOW_LINES:-15}" ] && printf '      …(%s lines total)\n' "$n"
    echo
  fi
done 3< <(list_examples "$EXAMPLES")

echo ""
echo "summary: $pass passed, $fail failed, $known known-fail (pinned)"
[ "$fail" -eq 0 ]
