#!/usr/bin/env bash
# Build for the Python sandbox component (py-sandbox:sandbox).
#
# Generates WIT bindings, builds the Python executor component with
# componentize-py. The component is composed with guard + guard-io via
# wac in the root spin.toml build command.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$HERE"

# Find a Python 3.12 interpreter (componentize-py 0.17.2 embeds CPython 3.12; the
# prebuilt wasm .so are cpython-312, so match it for the build venv).
find_py() {
  for c in "${PYTHON:-}" python3.12 \
            /opt/homebrew/opt/python@3.12/bin/python3.12 \
            /usr/local/opt/python@3.12/bin/python3.12 python3; do
    [ -n "$c" ] && command -v "$c" >/dev/null 2>&1 && { echo "$c"; return; }
  done
  echo "ERROR: no python3.12 found (set PYTHON=/path/to/python3.12)" >&2
  exit 1
}

if [ ! -x .venv/bin/componentize-py ]; then
  PY="$(find_py)"
  echo ">> creating build venv with $PY"
  "$PY" -m venv .venv
  .venv/bin/pip install -q --upgrade pip
  .venv/bin/pip install -q -r requirements.txt
fi

# vendor/ is (re)built only when absent. After changing vendor-requirements.txt or the
# prebuilt set in setup-vendor.sh, `rm -rf vendor` so it is regenerated.
if [ ! -d vendor ]; then
  echo ">> populating vendor/ (prebuilt wasm packages + pure-python deps)"
  PYTHON="$PWD/.venv/bin/python" bash setup-vendor.sh
fi

# spin_sdk/http.py (a package dir in the real spin-sdk PyPI package, vendored
# above) assumes the component itself exports wasi:http/incoming-handler, which
# doesn't fit this pure-executor component — replace it with our own override
# every build (cheap, idempotent) rather than patching the real package.
rm -rf vendor/spin_sdk/http
cp overrides/spin_sdk_http.py vendor/spin_sdk/http.py

# Build the py-sandbox component (executor, not HTTP handler).
# -m spin_sdk=spin-imports: generate spin_sdk's own WIT bindings using its
# bundled "spin-imports" world (imports only, no incoming-handler export —
# guard:front owns that) instead of hand-vendoring fermyon:spin/key-value and
# wasi:http/* ourselves; see py-executor.wit. 
echo ">> componentize"
WIT_REQUIRE_F32_F64=0 VIRTUAL_ENV="$PWD/.venv" .venv/bin/componentize-py \
  -d wit -w py-executor \
  componentize -m spin_sdk=spin-imports \
  -p . -p vendor \
  executor -o py-sandbox.wasm


# Strip debug info.
if command -v wasm-tools >/dev/null 2>&1; then
  echo ">> stripping debug info"
  wasm-tools strip py-sandbox.wasm -o py-sandbox.wasm.tmp && mv py-sandbox.wasm.tmp py-sandbox.wasm
else
  echo ">> NOTE: wasm-tools not found; skipping debug strip" >&2
fi

echo ">> built py-sandbox.wasm ($(du -h py-sandbox.wasm | cut -f1))"
