#!/bin/sh
# Download official Smallstep `step` for one of: darwin-arm64 | linux-x64
# Usage: fetch-step.sh <platform> <dest-file>
set -eu

platform="${1:?platform}"
dest="${2:?dest file}"
here=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
version=$(tr -d '[:space:]' < "$here/step-version")

case "$platform" in
  darwin-arm64)
    file="step_darwin_${version}_arm64.tar.gz"
    ;;
  linux-x64)
    file="step_linux_${version}_amd64.tar.gz"
    ;;
  *)
    echo "fetch-step.sh: unsupported platform: $platform" >&2
    echo "supported: darwin-arm64 linux-x64" >&2
    exit 1
    ;;
esac

url="https://github.com/smallstep/cli/releases/download/v${version}/${file}"
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT

echo "fetch-step: $url" >&2
curl -fsSL "$url" -o "$work/step.tgz"
tar -xzf "$work/step.tgz" -C "$work"
inner=$(find "$work" -type f -name step | head -n 1)
if [ -z "$inner" ]; then
  echo "fetch-step.sh: no step binary in $file" >&2
  exit 1
fi

mkdir -p "$(dirname -- "$dest")"
cp "$inner" "$dest"
chmod 755 "$dest"
echo "fetch-step: wrote $dest" >&2
