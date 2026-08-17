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

base="${STEP_RELEASE_URL:-https://github.com/smallstep/cli/releases/download/v${version}}"
url="${base}/${file}"
sums_url="${base}/checksums.txt"
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT

digest() {
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$1" | awk '{print $1}'
  elif command -v shasum >/dev/null 2>&1; then
    shasum -a 256 "$1" | awk '{print $1}'
  else
    echo "fetch-step.sh: need \`sha256sum\` or \`shasum\`" >&2
    exit 1
  fi
}

echo "fetch-step: $url" >&2
curl -fsSL "$url" -o "$work/step.tgz"
curl -fsSL "$sums_url" -o "$work/checksums.txt"
want=$(awk -v f="$file" '$2 == f { print $1; exit }' "$work/checksums.txt")
if [ -z "$want" ]; then
  echo "fetch-step.sh: $file is not in checksums.txt" >&2
  exit 1
fi
got=$(digest "$work/step.tgz")
if [ "$got" != "$want" ]; then
  echo "fetch-step.sh: checksum mismatch for $file" >&2
  echo "fetch-step.sh: expected $want" >&2
  echo "fetch-step.sh: got      $got" >&2
  exit 1
fi
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
