#!/usr/bin/env bash
# Point the Spin templates at a published release: rewrite the component `source` URL and
# its sha256 digest in every templates/sandbox-*/**/{spin.toml,component.txt}.
#
#   scripts/update-template-refs.sh <version> [owner/repo]
#   scripts/update-template-refs.sh v0.1.0
#   scripts/update-template-refs.sh v0.1.0 myorg/spin-sandboxes
#
# Downloads each released *.wasm, computes its digest, and updates the templates in place.
# Review with `git diff templates/` afterwards.
set -euo pipefail

VERSION="${1:?usage: $0 <version> [owner/repo]}"
REPO="${2:-fermyon/spin-sandboxes}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

sha256() {
  if command -v sha256sum >/dev/null 2>&1; then sha256sum "$1" | cut -d' ' -f1
  else shasum -a 256 "$1" | cut -d' ' -f1; fi
}

for comp in ts-sandbox py-sandbox bundler; do
  url="https://github.com/$REPO/releases/download/$VERSION/$comp.wasm"
  echo ">> $comp -> $url"
  tmp="$(mktemp)"
  curl -fsSL "$url" -o "$tmp"
  digest="sha256:$(sha256 "$tmp")"
  rm -f "$tmp"
  echo "   $digest"

  # Rewrite `... url = "<any-version-of-this-wasm>", digest = "sha256:<64hex>" ...`.
  # perl's s/// exits 0 whether or not it matched, so track that at least one file actually
  # changed and fail loudly otherwise (e.g. if the template's source-line format drifts).
  rewrote=0
  while IFS= read -r f; do
    before="$(cat "$f")"
    comp="$comp" url="$url" digest="$digest" perl -i -pe '
      my ($c, $u, $d) = ($ENV{comp}, $ENV{url}, $ENV{digest});
      s{https://github\.com/[^"]*/\Q$c\E\.wasm", digest = "sha256:[0-9a-f]{64}"}{$u", digest = "$d"}g;
    ' "$f"
    [ "$(cat "$f")" != "$before" ] && rewrote=$((rewrote + 1))
  done < <(grep -rl "/$comp.wasm" "$ROOT/templates")
  if [ "$rewrote" -eq 0 ]; then
    echo "   ERROR: no template rewritten for $comp; the source/digest line format may have changed" >&2
    exit 1
  fi
done

echo ">> done, review: git diff templates/"
