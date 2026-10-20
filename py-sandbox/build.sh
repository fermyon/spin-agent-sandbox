#!/usr/bin/env bash
# Build the Python sandbox component (py-sandbox.wasm).
#
# Needs Python 3.12 exactly: componentize-py 0.17.2 embeds CPython 3.12 and the prebuilt
# wasm32-wasi packages in wasi-deps/ are cpython-312, so the build venv (which resolves the
# pure-python deps in vendor/) must match. Set PYTHON=/path/to/python3.12 to pick one.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$HERE"

REQUIRED_PY="3.12"
VENV=".venv"
VENV_STAMP="$VENV/.requirements.txt" # requirements.txt the venv was built from
VENDOR_STAMP="vendor/.inputs-sha256"

die() {
  echo "ERROR: $*" >&2
  exit 1
}

# Print "major.minor" for an interpreter, or nothing if it does not run.
py_version() {
  "$1" -c 'import sys; print("%d.%d" % sys.version_info[:2])' 2>/dev/null || true
}

# Set PY to a Python $REQUIRED_PY interpreter, or fail listing what was found instead.
find_python() {
  local c v
  if [ -n "${PYTHON:-}" ]; then
    command -v "$PYTHON" >/dev/null 2>&1 || die "PYTHON=$PYTHON is not an executable"
    v="$(py_version "$PYTHON")"
    [ "$v" = "$REQUIRED_PY" ] ||
      die "PYTHON=$PYTHON is Python ${v:-(unknown)}, but the py-sandbox build needs Python $REQUIRED_PY"
    PY="$PYTHON"
    return
  fi

  local seen=()
  for c in "python$REQUIRED_PY" \
           "/opt/homebrew/opt/python@$REQUIRED_PY/bin/python$REQUIRED_PY" \
           "/usr/local/opt/python@$REQUIRED_PY/bin/python$REQUIRED_PY" \
           python3 python; do
    command -v "$c" >/dev/null 2>&1 || continue
    v="$(py_version "$c")"
    if [ "$v" = "$REQUIRED_PY" ]; then
      PY="$c"
      return
    fi
    seen+=("$c is ${v:-unrunnable}")
  done

  {
    echo "ERROR: Python $REQUIRED_PY not found. The py-sandbox build requires exactly Python $REQUIRED_PY"
    echo "       (componentize-py embeds CPython $REQUIRED_PY; wasi-deps/ holds cpython-312 binaries)."
    if [ "${#seen[@]}" -gt 0 ]; then
      echo "       Found instead: ${seen[*]}"
    fi
    echo "       Install it (e.g. 'brew install python@$REQUIRED_PY', 'uv python install $REQUIRED_PY',"
    echo "       'pyenv install $REQUIRED_PY'), or point PYTHON at one:"
    echo "         PYTHON=/path/to/python$REQUIRED_PY bash build.sh"
  } >&2
  exit 1
}

# The venv is reusable only if it runs Python $REQUIRED_PY (not a different or deleted
# base interpreter) and was fully installed from the current requirements.txt.
venv_ok() {
  [ -x "$VENV/bin/componentize-py" ] &&
    [ "$(py_version "$VENV/bin/python")" = "$REQUIRED_PY" ] &&
    cmp -s requirements.txt "$VENV_STAMP"
}

if ! venv_ok; then
  find_python
  if [ -d "$VENV" ]; then
    echo ">> removing stale build venv ($VENV)"
    rm -rf "$VENV"
  fi
  echo ">> creating build venv with $PY ($("$PY" -c 'import sys; print(sys.version.split()[0])'))"
  "$PY" -m venv "$VENV" ||
    die "'$PY -m venv' failed (on Debian/Ubuntu, install the python$REQUIRED_PY-venv package)"
  "$VENV/bin/python" -m pip install -q --upgrade pip ||
    die "upgrading pip in $VENV failed (see pip output above)"
  "$VENV/bin/python" -m pip install -q -r requirements.txt ||
    die "installing build tools from requirements.txt failed (see pip output above)"
  # Written last, so an interrupted or failed install is redone on the next run.
  cp requirements.txt "$VENV_STAMP"
fi

# vendor/ is (re)built when absent or when its inputs change: the build Python version,
# vendor-requirements.txt, or the prebuilt set in setup-vendor.sh. After changing
# wasi-deps/ itself, `rm -rf vendor`.
vendor_inputs="$("$VENV/bin/python" -c '
import hashlib, sys
h = hashlib.sha256(b"python %d.%d\n" % sys.version_info[:2])
for f in sys.argv[1:]:
    h.update(open(f, "rb").read())
print(h.hexdigest())
' vendor-requirements.txt setup-vendor.sh)"
if [ ! -d vendor ] || [ "$(cat "$VENDOR_STAMP" 2>/dev/null)" != "$vendor_inputs" ]; then
  echo ">> populating vendor/ (prebuilt wasm packages + pure-python deps)"
  PYTHON="$PWD/$VENV/bin/python" bash setup-vendor.sh
  echo "$vendor_inputs" > "$VENDOR_STAMP"
fi

# Componentize executor.py; spin_sdk bindings come from its imports-only world.
echo ">> componentize"
VIRTUAL_ENV="$PWD/$VENV" "$VENV/bin/componentize-py" \
  -d ../wit/py-sandbox -w py-executor \
  componentize -m spin_sdk=spin-imports \
  -p . -p vendor \
  executor -o py-sandbox.wasm

if command -v wasm-tools >/dev/null 2>&1; then
  echo ">> stripping debug info"
  wasm-tools strip py-sandbox.wasm -o py-sandbox.wasm.tmp && mv py-sandbox.wasm.tmp py-sandbox.wasm
else
  echo ">> NOTE: wasm-tools not found; skipping debug strip" >&2
fi

echo ">> built py-sandbox.wasm ($(du -h py-sandbox.wasm | cut -f1))"
