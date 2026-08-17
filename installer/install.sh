#!/bin/sh
# Install xyne-boxes + step on a pristine Mac (Apple Silicon) or Linux x86_64.
# No Nix, no Homebrew, no preinstalled step.
#
#   curl -fsSL https://raw.githubusercontent.com/juspay/xyne-boxes/nightly/installer/install.sh | sh
set -eu

RELEASE_URL="${XYNE_BOXES_RELEASE:-https://github.com/juspay/xyne-boxes/releases/download/nightly}"
BIN_DIR="${XYNE_BOXES_BIN:-$HOME/.local/bin}"
# Nightly publish replaces __XYNE_COMMIT__ with GITHUB_SHA.
COMMIT="${XYNE_BOXES_COMMIT:-__XYNE_COMMIT__}"

os=$(uname -s)
arch=$(uname -m)
# Rosetta reports x86_64 on Apple Silicon; the binary we ship is arm64.
if [ "$os" = Darwin ] && [ "$arch" = x86_64 ]; then
  if [ "$(sysctl -n sysctl.proc_translated 2>/dev/null || true)" = "1" ]; then
    arch=arm64
  fi
fi
case "${os}-${arch}" in
  Darwin-arm64)
    boxes_asset="xyne-boxes-darwin-arm64"
    step_asset="step-darwin-arm64"
    ;;
  Linux-x86_64)
    boxes_asset="xyne-boxes-linux-x64"
    step_asset="step-linux-x64"
    ;;
  *)
    echo "xyne-boxes: unsupported platform ${os}/${arch}" >&2
    echo "supported: macOS Apple Silicon, Linux x86_64" >&2
    exit 1
    ;;
esac

need() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "xyne-boxes: need \`$1\` on PATH" >&2
    exit 1
  fi
}

need curl
need bash

digest() {
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$1" | awk '{print $1}'
  elif command -v shasum >/dev/null 2>&1; then
    shasum -a 256 "$1" | awk '{print $1}'
  else
    echo "xyne-boxes: need \`sha256sum\` or \`shasum\` to verify downloads" >&2
    exit 1
  fi
}

expected_hash() {
  sums=$1
  name=$2
  awk -v f="$name" '$2 == f { print $1; exit }' "$sums"
}

fetch() {
  _url=$1
  _out=$2
  echo "xyne-boxes: $_url" >&2
  curl -fsSL -H 'Cache-Control: no-cache' "$_url" -o "$_out"
}

install_asset() {
  _asset=$1
  _tmp="$work/$_asset"
  fetch "$RELEASE_URL/$_asset" "$_tmp"
  want=$(expected_hash "$work/SHA256SUMS" "$_asset")
  if [ -z "$want" ]; then
    echo "xyne-boxes: $_asset is not in SHA256SUMS" >&2
    exit 1
  fi
  got=$(digest "$_tmp")
  if [ "$got" != "$want" ]; then
    echo "xyne-boxes: checksum mismatch for $_asset" >&2
    echo "xyne-boxes: expected $want" >&2
    echo "xyne-boxes: got      $got" >&2
    exit 1
  fi
}

if [ "$COMMIT" = "__XYNE_COMMIT__" ] || [ -z "$COMMIT" ]; then
  COMMIT=$(curl -fsSL -H 'Cache-Control: no-cache' "$RELEASE_URL/COMMIT" 2>/dev/null || true)
fi
if [ -n "$COMMIT" ]; then
  echo "xyne-boxes: commit $COMMIT" >&2
else
  echo "xyne-boxes: commit unknown (no nightly COMMIT file)" >&2
fi

mkdir -p "$BIN_DIR"
if [ ! -w "$BIN_DIR" ]; then
  echo "xyne-boxes: cannot write to $BIN_DIR" >&2
  exit 1
fi
if [ -e "$BIN_DIR/pu" ] && { [ ! -L "$BIN_DIR/pu" ] || [ "$(readlink "$BIN_DIR/pu")" != "xyne-boxes" ]; }; then
  echo "xyne-boxes: $BIN_DIR/pu exists and is not our symlink — not overwriting" >&2
  exit 1
fi
work=$(mktemp -d "${BIN_DIR}/.xyne-work.XXXXXX")
trap 'rm -rf "$work"' EXIT

echo "xyne-boxes: installing into $BIN_DIR" >&2
fetch "$RELEASE_URL/SHA256SUMS" "$work/SHA256SUMS"
install_asset "$boxes_asset"
echo "xyne-boxes: also installing step (pristine machines have none)" >&2
install_asset "$step_asset"
chmod 755 "$work/$boxes_asset" "$work/$step_asset"
mv -f "$work/$boxes_asset" "$BIN_DIR/xyne-boxes"
mv -f "$work/$step_asset" "$BIN_DIR/step"
ln -sfn xyne-boxes "$BIN_DIR/pu"

# bun --compile is linker-signed; Apple Silicon SIGKILLs that (Killed: 9).
# Ad-hoc sign on the user's Mac so the page size matches this OS. Do not
# re-sign official step — that already has a Developer ID.
if [ "$os" = Darwin ]; then
  case "$(file -b "$BIN_DIR/xyne-boxes" 2>/dev/null || true)" in
    Mach-O*)
      codesign --force --sign - "$BIN_DIR/xyne-boxes"
      ;;
  esac
fi

append_path() {
  profile=$1
  line="export PATH=\"$BIN_DIR:\$PATH\"  # xyne-boxes"
  if [ -f "$profile" ] && grep -Fqx "$line" "$profile" 2>/dev/null; then
    return
  fi
  printf '\n%s\n' "$line" >> "$profile"
  echo "xyne-boxes: appended PATH to $profile" >&2
}

case ":$PATH:" in
  *":$BIN_DIR:"*) ;;
  *)
    if [ "$os" = Darwin ]; then
      append_path "$HOME/.zprofile"
    else
      append_path "$HOME/.profile"
    fi
    ;;
esac

echo "xyne-boxes: checking binaries" >&2
PATH="$BIN_DIR:$PATH"
xyne-boxes version
step version | head -n 1

echo "xyne-boxes: installed${COMMIT:+ ($COMMIT)}." >&2
echo "  $BIN_DIR/xyne-boxes" >&2
echo "  $BIN_DIR/step" >&2
echo "Open a new shell if \`xyne-boxes\` is not found, or run:" >&2
echo "  export PATH=\"$BIN_DIR:\$PATH\"" >&2
