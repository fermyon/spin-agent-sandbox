#!/usr/bin/env bash
# Reproducible build for the Python sandbox component.
#
# Builds app.wasm from a clean checkout: creates an isolated python3.12 venv with the
# pinned build tools (spin-sdk + componentize-py), populates vendor/ with the runtime
# dependencies, then runs componentize-py. This is the command referenced by the
# component's build step in ../spin.toml, so `spin build` / `spin up --build` work.
#
# The venv is required because the *system* environment may have a different spin-sdk;
# componentize-py discovers the `spin-http` world from the spin-sdk it runs against.
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

if [ ! -d vendor ]; then
  echo ">> populating vendor/ (prebuilt wasm packages + pure-python deps)"
  PYTHON="$PWD/.venv/bin/python" bash setup-vendor.sh
fi

echo ">> componentize"
.venv/bin/componentize-py -w spin-http componentize -p . -p vendor app -o app.wasm

# Strip DWARF/debug + name sections. componentize-py bakes the CPython runtime and the
# native extension modules (numpy, sqlalchemy, ...) in with debug info, which is ~half the
# component and unused at runtime — stripping roughly halves app.wasm with no behaviour
# change. Requires wasm-tools; skipped (with a note) if it is not installed.
if command -v wasm-tools >/dev/null 2>&1; then
  echo ">> stripping debug info"
  wasm-tools strip -a app.wasm -o app.wasm.tmp && mv app.wasm.tmp app.wasm
else
  echo ">> NOTE: wasm-tools not found; skipping debug strip (install it to shrink app.wasm ~2x)" >&2
fi

echo ">> built app.wasm ($(du -h app.wasm | cut -f1))"
