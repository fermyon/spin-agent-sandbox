#!/usr/bin/env bash
set -euo pipefail

case "${RUNNER_ARCH:-}" in
  X64) architecture=x86_64 ;;
  ARM64) architecture=aarch64 ;;
  *) echo "::error::No release asset mapping for runner architecture: ${RUNNER_ARCH:-unset}."; exit 1 ;;
esac

exe_suffix=
archive_suffix=tar.gz
case "${RUNNER_OS:-}" in
  Linux) wasm_os=linux; wac_target=unknown-linux-musl ;;
  macOS) wasm_os=macos; wac_target=apple-darwin ;;
  Windows) wasm_os=windows; wac_target=pc-windows-gnu; exe_suffix=.exe; archive_suffix=zip ;;
  *) echo "::error::No release asset mapping for runner OS: ${RUNNER_OS:-unset}."; exit 1 ;;
esac
: "${GH_TOKEN:?github-token is required}"
: "${RUNNER_TEMP:?RUNNER_TEMP is required}"
: "${GITHUB_PATH:?GITHUB_PATH is required}"
: "${GITHUB_OUTPUT:?GITHUB_OUTPUT is required}"

runner_temp=$RUNNER_TEMP
if [[ "$RUNNER_OS" == Windows ]]; then runner_temp=$(cygpath -u "$runner_temp"); fi
install_dir=$(mktemp -d "$runner_temp/wasm-tools.XXXXXX")
download_dir=$(mktemp -d "$runner_temp/wasm-tools-downloads.XXXXXX")
trap 'rm -rf "$download_dir"' EXIT

for tool in wasm-tools wac; do
  # GitHub's latest endpoint excludes drafts and prereleases.
  metadata="$download_dir/$tool.json"
  curl --fail --silent --show-error --retry 3 --connect-timeout 15 --max-time 120 \
    --proto '=https' \
    --header "Authorization: Bearer $GH_TOKEN" \
    --header 'Accept: application/vnd.github+json' \
    --header 'X-GitHub-Api-Version: 2022-11-28' \
    "https://api.github.com/repos/bytecodealliance/$tool/releases/latest" \
    --output "$metadata"
  tag=$(jq -er '.tag_name | select(test("^v[0-9]+\\.[0-9]+\\.[0-9]+$"))' "$metadata")
  if [[ "$tool" == wasm-tools ]]; then
    asset="wasm-tools-${tag#v}-$architecture-$wasm_os.$archive_suffix"
  else
    asset="wac-cli-$architecture-$wac_target"
  fi

  # Resolve the URL and checksum from this same release to avoid racing a new release.
  if ! asset_metadata=$(jq -ce --arg name "$asset" '
    [.assets[] | select(.name == $name)] | select(length == 1) | .[0]
  ' "$metadata"); then
    echo "::error::No unique $tool $tag release asset for $RUNNER_OS/$RUNNER_ARCH (expected $asset)."
    exit 1
  fi
  url=$(jq -er '.browser_download_url' <<< "$asset_metadata")
  digest=$(jq -er '.digest | select(test("^sha256:[a-f0-9]{64}$"))' <<< "$asset_metadata")
  if [[ "$url" != "https://github.com/bytecodealliance/$tool/releases/download/$tag/$asset" ]]; then
    echo "::error::Unexpected download URL for $tool $tag."
    exit 1
  fi

  echo "Installing $tool $tag from bytecodealliance/$tool ($asset)"
  archive="$download_dir/$asset"
  curl --fail --silent --show-error --location --retry 3 \
    --connect-timeout 15 --max-time 180 --proto '=https' --proto-redir '=https' \
    "$url" --output "$archive"
  if command -v sha256sum >/dev/null 2>&1; then
    actual_digest=$(sha256sum "$archive")
  else
    # macOS provides shasum rather than GNU coreutils.
    actual_digest=$(shasum -a 256 "$archive")
  fi
  if [[ "${actual_digest%% *}" != "${digest#sha256:}" ]]; then
    echo "::error::SHA-256 mismatch for $tool $tag ($asset)."
    exit 1
  fi

  if [[ "$tool" == wasm-tools ]]; then
    member="${asset%.$archive_suffix}/wasm-tools$exe_suffix"
    if [[ "$archive_suffix" == zip ]]; then
      unzip -q "$archive" "$member" -d "$download_dir"
    else
      tar -xzf "$archive" -C "$download_dir" "$member"
    fi
    install -m 0755 "$download_dir/$member" "$install_dir/wasm-tools$exe_suffix"
  else
    install -m 0755 "$archive" "$install_dir/wac$exe_suffix"
  fi
  "$install_dir/$tool$exe_suffix" --version
  printf '%s-version=%s\n' "$tool" "$tag" >> "$GITHUB_OUTPUT"
done

if [[ "$RUNNER_OS" == Windows ]]; then install_dir=$(cygpath -w "$install_dir"); fi
printf '%s\n' "$install_dir" >> "$GITHUB_PATH"
