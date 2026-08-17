#!/bin/sh
# Local tests for install.sh: checksums, all-or-nothing replace, PATH-line match.
set -eu

here=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
installer=$(CDPATH= cd -- "$here/.." && pwd)
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

sh "$installer/install.sh"

assert test -x "$bin/xyne-boxes"
assert test -x "$bin/step"
assert test -L "$bin/pu"
assert test "$(readlink "$bin/pu")" = "xyne-boxes"

# Bad checksum on the *second* asset must not replace a working install
# (a first-asset-only corrupt would miss a half-install).
printf '%s\n' '#!/bin/sh' 'echo corrupted-step' > "$release/$step"
if sh "$installer/install.sh"; then
  echo "install.test.sh: expected checksum mismatch to fail" >&2
  exit 1
fi
assert test -x "$bin/xyne-boxes"
assert test -x "$bin/step"
assert test "$("$bin/xyne-boxes")" = "xyne-boxes test"
assert test "$("$bin/step")" = "Smallstep CLI/test"

# Pristine dest + bad step must leave no xyne-boxes / pu.
fresh="$root/fresh"
mkdir -p "$fresh"
XYNE_BOXES_BIN="$fresh" sh "$installer/install.sh" && {
  echo "install.test.sh: expected pristine+bad-step to fail" >&2
  exit 1
}
assert test ! -e "$fresh/xyne-boxes"
assert test ! -e "$fresh/pu"
assert test ! -e "$fresh/step"

# COMMIT-file fallback (no XYNE_BOXES_COMMIT).
make_release "$release"
unset XYNE_BOXES_COMMIT
commit_log="$root/commit.log"
sh "$installer/install.sh" >"$commit_log" 2>&1
grep -q 'commit deadbeef' "$commit_log"
export XYNE_BOXES_COMMIT="deadbeef"

# Pre-existing regular file at pu is not clobbered.
rm -f "$bin/pu"
printf '%s\n' '#!/bin/sh' 'echo keep-me' > "$bin/pu"
chmod 755 "$bin/pu"
if sh "$installer/install.sh"; then
  echo "install.test.sh: expected refuse to overwrite pu" >&2
  exit 1
fi
assert test ! -L "$bin/pu"
assert test "$("$bin/pu")" = "keep-me"
rm -f "$bin/pu"
ln -sfn xyne-boxes "$bin/pu"

# An unrelated 'xyne-boxes' mention must not skip the exact PATH line.
if [ "$os" = Darwin ]; then
  profile="$home/.zprofile"
else
  profile="$home/.profile"
fi
printf '\n# notes about xyne-boxes\n' > "$profile"
sh "$installer/install.sh"
grep -Fqx "export PATH=\"$bin:\$PATH\"  # xyne-boxes" "$profile"
count=$(grep -c 'xyne-boxes' "$profile")
assert test "$count" -eq 2

echo "install.test.sh: ok" >&2
