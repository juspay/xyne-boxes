#!/bin/sh
# Install xyne-boxes + step on a pristine Mac (Apple Silicon) or Linux x86_64.
# No Nix, no Homebrew, no preinstalled step.
#
#   curl -fsSL https://github.com/juspay/xyne-boxes/releases/download/nightly/install.sh | sh
set -eu

RELEASE_URL="${XYNE_BOXES_RELEASE:-https://github.com/juspay/xyne-boxes/releases/download/nightly}"
BIN_DIR="${XYNE_BOXES_BIN:-$HOME/.local/bin}"

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

mkdir -p "$BIN_DIR"

echo "xyne-boxes: installing into $BIN_DIR" >&2
echo "xyne-boxes: $RELEASE_URL/$boxes_asset" >&2
curl -fsSL "$RELEASE_URL/$boxes_asset" -o "$BIN_DIR/xyne-boxes"
chmod 755 "$BIN_DIR/xyne-boxes"
ln -sfn xyne-boxes "$BIN_DIR/pu"

echo "xyne-boxes: $RELEASE_URL/$step_asset  (pristine machines have no step)" >&2
curl -fsSL "$RELEASE_URL/$step_asset" -o "$BIN_DIR/step"
chmod 755 "$BIN_DIR/step"

append_path() {
  profile=$1
  line="export PATH=\"$BIN_DIR:\$PATH\"  # xyne-boxes"
  if [ -f "$profile" ] && grep -q 'xyne-boxes' "$profile" 2>/dev/null; then
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

echo "xyne-boxes: installed." >&2
echo "  $BIN_DIR/xyne-boxes" >&2
echo "  $BIN_DIR/step" >&2
echo "Open a new shell if \`xyne-boxes\` is not found, or run:" >&2
echo "  export PATH=\"$BIN_DIR:\$PATH\"" >&2
