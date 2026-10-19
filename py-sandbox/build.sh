#!/usr/bin/env bash
# Build the Python sandbox component.
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

# vendor/ is (re)built when absent or when its inputs (vendor-requirements.txt and the
# prebuilt set in setup-vendor.sh) change, so a pin bump reaches existing checkouts.
# After changing wasi-deps/ itself, `rm -rf vendor`.
VENDOR_STAMP="vendor/.inputs-sha256"
vendor_inputs="$(.venv/bin/python -c 'import hashlib, sys; print(hashlib.sha256(b"".join(open(f, "rb").read() for f in sys.argv[1:])).hexdigest())' vendor-requirements.txt setup-vendor.sh)"
if [ ! -d vendor ] || [ "$(cat "$VENDOR_STAMP" 2>/dev/null)" != "$vendor_inputs" ]; then
  echo ">> populating vendor/ (prebuilt wasm packages + pure-python deps)"
  PYTHON="$PWD/.venv/bin/python" bash setup-vendor.sh
  echo "$vendor_inputs" > "$VENDOR_STAMP"
fi

# Componentize executor.py; spin_sdk bindings come from its imports-only world.
echo ">> componentize"
VIRTUAL_ENV="$PWD/.venv" .venv/bin/componentize-py \
  -d ../wit/py-sandbox -w py-executor \
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
