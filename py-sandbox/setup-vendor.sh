#!/usr/bin/env bash
# Populate py-sandbox/vendor/ with every runtime dependency on a single module path:
#   1. prebuilt wasm32-wasi packages copied from ../../spin-python-deps (the binary deps)
#   2. pure-python packages from vendor-requirements.txt (binaries stripped so the
#      prebuilt wasm packages always win and no macOS .so sneaks into the component)
#
# Run once after checkout / when dependencies change. vendor/ is committed (it is a
# build input, not a build output). Requires python3.12 on PATH.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEPS="$HERE/../../spin-python-deps"
VENDOR="$HERE/vendor"
PY="${PYTHON:-/opt/homebrew/opt/python@3.12/bin/python3.12}"

# Prebuilt wasm32-wasi packages (cpython-312-wasm32-wasi .so + sources).
PREBUILT=(_yaml charset_normalizer frozenlist multidict numpy pydantic_core \
          regex sqlalchemy tiktoken tiktoken_ext wrapt yaml yarl)

echo ">> resetting $VENDOR"
rm -rf "$VENDOR"
mkdir -p "$VENDOR"

echo ">> copying prebuilt wasm packages from $DEPS"
for pkg in "${PREBUILT[@]}"; do
  if [ -e "$DEPS/$pkg" ]; then
    cp -R "$DEPS/$pkg" "$VENDOR/$pkg"
  else
    echo "   WARNING: prebuilt package '$pkg' not found in $DEPS" >&2
  fi
done

echo ">> installing pure-python deps into a temp dir"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
"$PY" -m pip install --quiet --target "$TMP" -r "$HERE/vendor-requirements.txt"

echo ">> merging pure-python deps into vendor (prebuilt wins; binaries stripped)"
shopt -s nullglob
# Package dirs and their .dist-info metadata (plotly etc. read importlib.metadata.version).
for entry in "$TMP"/*/; do
  name="$(basename "$entry")"
  case "$name" in
    __pycache__|bin) continue ;;
  esac
  if [ -e "$VENDOR/$name" ]; then
    echo "   keep prebuilt: $name"
    continue
  fi
  cp -R "$entry" "$VENDOR/$name"
  # Drop macOS/linux binaries from pip; the wasm32-wasi .so come from the prebuilt set,
  # and these pure-python packages have working pure fallbacks (e.g. markupsafe._native).
  find "$VENDOR/$name" \( -name '*.so' -o -name '*.pyd' -o -name '*.dylib' \) -delete
  find "$VENDOR/$name" -name '__pycache__' -type d -prune -exec rm -rf {} +
done
# top-level single-file modules (e.g. typing_extensions.py)
for f in "$TMP"/*.py; do
  cp "$f" "$VENDOR/"
done

echo ">> vendor/ contents:"
ls -1 "$VENDOR"
echo ">> done. total size: $(du -sh "$VENDOR" | cut -f1)"
