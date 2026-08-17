#!/bin/sh
# Local tests for install.sh: checksums, atomic replace, PATH-line match.
set -eu

here=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
root=$(mktemp -d)
trap 'rm -rf "$root"' EXIT

os=$(uname -s)
arch=$(uname -m)
case "${os}-${arch}" in
  Darwin-arm64) boxes=xyne-boxes-darwin-arm64; step=step-darwin-arm64 ;;
  Linux-x86_64) boxes=xyne-boxes-linux-x64; step=step-linux-x64 ;;
  *)
    echo "install.test.sh: unsupported ${os}/${arch}" >&2
    exit 1
    ;;
esac

digest() {
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$1" | awk '{print $1}'
  else
    shasum -a 256 "$1" | awk '{print $1}'
  fi
}

write_sums() {
  dir=$1
  (
    cd "$dir"
    if command -v sha256sum >/dev/null 2>&1; then
      sha256sum "$boxes" "$step" COMMIT
    else
      shasum -a 256 "$boxes" "$step" COMMIT
    fi
  ) > "$dir/SHA256SUMS"
}

make_release() {
  dir=$1
  mkdir -p "$dir"
  printf '%s\n' '#!/bin/sh' 'echo xyne-boxes test' 'exit 0' > "$dir/$boxes"
  printf '%s\n' '#!/bin/sh' 'echo Smallstep CLI/test' 'exit 0' > "$dir/$step"
  chmod 755 "$dir/$boxes" "$dir/$step"
  printf '%s\n' 'deadbeef' > "$dir/COMMIT"
  write_sums "$dir"
}

assert() {
  if ! "$@"; then
    echo "install.test.sh: failed: $*" >&2
    exit 1
  fi
}

release="$root/release"
bin="$root/bin"
home="$root/home"
mkdir -p "$bin" "$home"
make_release "$release"

export HOME="$home"
export XYNE_BOXES_RELEASE="file://$release"
export XYNE_BOXES_BIN="$bin"
export XYNE_BOXES_COMMIT="deadbeef"
# BIN_DIR is a fresh temp dir, so it is not on PATH — install.sh will
# append the profile line. Do not shrink PATH: NixOS has no /bin/uname.

sh "$here/install.sh"

assert test -x "$bin/xyne-boxes"
assert test -x "$bin/step"
assert test -L "$bin/pu"
assert test "$(readlink "$bin/pu")" = "xyne-boxes"

# Bad checksum must not replace a working install.
printf '%s\n' '#!/bin/sh' 'echo corrupted' > "$release/$boxes"
if sh "$here/install.sh"; then
  echo "install.test.sh: expected checksum mismatch to fail" >&2
  exit 1
fi
assert test -x "$bin/xyne-boxes"
out=$("$bin/xyne-boxes")
assert test "$out" = "xyne-boxes test"

# An unrelated 'xyne-boxes' mention must not skip the exact PATH line.
make_release "$release"
if [ "$os" = Darwin ]; then
  profile="$home/.zprofile"
else
  profile="$home/.profile"
fi
printf '\n# notes about xyne-boxes\n' > "$profile"
sh "$here/install.sh"
grep -Fqx "export PATH=\"$bin:\$PATH\"  # xyne-boxes" "$profile"
count=$(grep -c 'xyne-boxes' "$profile")
# comment + export line
assert test "$count" -eq 2

echo "install.test.sh: ok" >&2
