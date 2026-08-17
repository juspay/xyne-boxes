#!/bin/sh
# Install xyne-boxes + step on a pristine Mac (Apple Silicon) or Linux x86_64.
# No Nix, no Homebrew, no preinstalled step.
#
#   curl -fsSL https://github.com/juspay/xyne-boxes/releases/download/nightly/install.sh | sh
set -eu

RELEASE_URL="${XYNE_BOXES_RELEASE:-https://github.com/juspay/xyne-boxes/releases/download/nightly}"
BIN_DIR="${XYNE_BOXES_BIN:-$HOME/.local/bin}"
# Nightly publish replaces __XYNE_COMMIT__ with GITHUB_SHA.
COMMIT="${XYNE_BOXES_COMMIT:-__XYNE_COMMIT__}"

os=$(uname -s)
arch=$(uname -m)
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
need uname

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
  _final=$2
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
  chmod 755 "$_tmp"
  mv -f "$_tmp" "$_final"
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
work=$(mktemp -d "${BIN_DIR}/.xyne-work.XXXXXX")
trap 'rm -rf "$work"' EXIT

echo "xyne-boxes: installing into $BIN_DIR" >&2
fetch "$RELEASE_URL/SHA256SUMS" "$work/SHA256SUMS"
install_asset "$boxes_asset" "$BIN_DIR/xyne-boxes"
ln -sfn xyne-boxes "$BIN_DIR/pu"

echo "xyne-boxes: also installing step (pristine machines have none)" >&2
install_asset "$step_asset" "$BIN_DIR/step"

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
