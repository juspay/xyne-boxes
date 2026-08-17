#!/bin/sh
# Fill a dist dir with official step, stamped install.sh, COMMIT, SHA256SUMS.
# Expects xyne-boxes-darwin-arm64 and/or xyne-boxes-linux-x64 already there.
# Usage: assemble-release.sh <dist-dir>
set -eu

dist=${1:?dist dir}
installer=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
repo=$(CDPATH= cd -- "$installer/.." && pwd)
mkdir -p "$dist"
commit=${GITHUB_SHA:-unknown}

need_step() {
  asset=$1
  if [ -e "$dist/$asset" ]; then
    return
  fi
  work=$(mktemp -d)
  nix build "${repo}#${asset}" --out-link "$work/out"
  cp "$work/out/bin/step" "$dist/$asset"
  rm -rf "$work"
}

has=
if [ -e "$dist/xyne-boxes-darwin-arm64" ]; then
  has=1
  need_step step-darwin-arm64
fi
if [ -e "$dist/xyne-boxes-linux-x64" ]; then
  has=1
  need_step step-linux-x64
fi
if [ -z "$has" ]; then
  echo "assemble-release.sh: no xyne-boxes-* in $dist" >&2
  exit 1
fi

printf '%s\n' "$commit" > "$dist/COMMIT"
if [ -n "${GITHUB_SHA:-}" ]; then
  sed "s/__XYNE_COMMIT__/${GITHUB_SHA}/g" "$installer/install.sh" > "$dist/install.sh"
else
  cp "$installer/install.sh" "$dist/install.sh"
fi

chmod 755 "$dist/install.sh"
for f in "$dist"/xyne-boxes-* "$dist"/step-*; do
  [ -e "$f" ] || continue
  chmod 755 "$f"
done

digest() {
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$@"
  else
    shasum -a 256 "$@"
  fi
}

(
  cd "$dist"
  set --
  for f in xyne-boxes-darwin-arm64 xyne-boxes-linux-x64 \
    step-darwin-arm64 step-linux-x64 install.sh COMMIT; do
    [ -e "$f" ] && set -- "$@" "$f"
  done
  digest "$@"
) > "$dist/SHA256SUMS"
