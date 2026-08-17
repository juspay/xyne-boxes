#!/bin/sh
set -eu

here=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
version=$(tr -d '[:space:]' < "$here/step-version")
root=$(mktemp -d)
trap 'rm -rf "$root"' EXIT

os=$(uname -s)
arch=$(uname -m)
case "${os}-${arch}" in
  Darwin-arm64)
    platform=darwin-arm64
    file="step_darwin_${version}_arm64.tar.gz"
    ;;
  Linux-x86_64)
    platform=linux-x64
    file="step_linux_${version}_amd64.tar.gz"
    ;;
  *)
    echo "fetch-step.test.sh: unsupported ${os}/${arch}" >&2
    exit 1
    ;;
esac

inner="$root/pkg/bin"
mkdir -p "$inner"
printf '%s\n' '#!/bin/sh' 'echo step-test' > "$inner/step"
chmod 755 "$inner/step"
tar -czf "$root/$file" -C "$root" pkg

digest() {
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$1" | awk '{print $1}'
  else
    shasum -a 256 "$1" | awk '{print $1}'
  fi
}

printf '%s  %s\n' "$(digest "$root/$file")" "$file" > "$root/checksums.txt"

export STEP_RELEASE_URL="file://$root"
dest="$root/out/step"
sh "$here/fetch-step.sh" "$platform" "$dest"
test -x "$dest"
test "$("$dest")" = "step-test"

# Bad checksum is rejected.
printf '%s  %s\n' "0" "$file" > "$root/checksums.txt"
if sh "$here/fetch-step.sh" "$platform" "$dest.bad"; then
  echo "fetch-step.test.sh: expected checksum mismatch to fail" >&2
  exit 1
fi
test ! -e "$dest.bad"

echo "fetch-step.test.sh: ok" >&2
