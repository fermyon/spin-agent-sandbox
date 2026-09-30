#!/usr/bin/env bash
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$HERE/../../.." && pwd)"
cd "$ROOT"

cargo build --release --target wasm32-wasip2 -p guard-io -p guard
npm --prefix packages/typescript/sandbox ci
npm --prefix packages/typescript/sandbox run build
mkdir -p dist
wac compose \
  -d guard:io=target/wasm32-wasip2/release/guard_io.wasm \
  -d ts-sandbox:sandbox=packages/typescript/sandbox/dist/ts-sandbox.wasm \
  -d guard:front=target/wasm32-wasip2/release/guard.wasm \
  -o dist/ts-sandbox.wasm \
  crates/guard/compose.wac
