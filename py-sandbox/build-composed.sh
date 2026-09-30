#!/usr/bin/env bash
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$HERE/.." && pwd)"
cd "$ROOT"

cargo build --release --target wasm32-wasip2 -p guard-io -p guard
bash "$HERE/build.sh"
mkdir -p dist
wasm-tools component embed wit/guard-io -w dummy-sockets --dummy -o target/dummy_sockets_core.wasm
wasm-tools component new target/dummy_sockets_core.wasm -o target/dummy_sockets.wasm
wasm-tools component embed wit/guard-io -w dummy-capabilities --dummy -o target/dummy_capabilities_core.wasm
wasm-tools component new target/dummy_capabilities_core.wasm -o target/dummy_capabilities.wasm
wac compose \
  -d guard:io=target/wasm32-wasip2/release/guard_io.wasm \
  -d guard:dummy-sockets=target/dummy_sockets.wasm \
  -d guard:dummy-capabilities=target/dummy_capabilities.wasm \
  -d py-sandbox:sandbox=py-sandbox/py-sandbox.wasm \
  -d guard:front=target/wasm32-wasip2/release/guard.wasm \
  -o dist/py-sandbox.wasm \
  crates/guard/compose-py.wac
