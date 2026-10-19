#!/usr/bin/env bash
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$HERE/.." && pwd)"
cd "$ROOT"

cargo build --release --target wasm32-wasip2 -p guard-io -p guard
bash "$HERE/build.sh"
mkdir -p dist
wac compose \
  -d guard:io=target/wasm32-wasip2/release/guard_io.wasm \
  -d py-sandbox:sandbox=py-sandbox/py-sandbox.wasm \
  -d guard:front=target/wasm32-wasip2/release/guard.wasm \
  -o dist/py-sandbox.wasm \
  crates/guard/compose-py.wac
