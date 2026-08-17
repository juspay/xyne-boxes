#!/bin/sh
# Serve a local nightly-shaped release and curl | sh it.
# Usage: curl-install.sh <dist-dir>
# dist-dir must already contain the compiled xyne-boxes-* for this OS.
set -eu

here=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
installer=$(CDPATH= cd -- "$here/.." && pwd)
dist=${1:?dist dir}
dist=$(CDPATH= cd -- "$dist" && pwd)

sh "$installer/assemble-release.sh" "$dist"

port=${XYNE_BOXES_E2E_PORT:-8765}
log=${TMPDIR:-/tmp}/xyne-http.log
python3 -m http.server "$port" --bind 127.0.0.1 --directory "$dist" >"$log" 2>&1 &
server=$!
trap 'kill "$server" 2>/dev/null || true' EXIT

i=0
while [ "$i" -lt 20 ]; do
  if curl -fsS "http://127.0.0.1:${port}/COMMIT" >/dev/null; then
    break
  fi
  i=$((i + 1))
  sleep 0.25
done
cat "$log"
curl -fsS "http://127.0.0.1:${port}/COMMIT" >/dev/null

export XYNE_BOXES_RELEASE="http://127.0.0.1:${port}"
export XYNE_BOXES_BIN="${XYNE_BOXES_BIN:-$HOME/.local/bin}"
curl -fsSL "${XYNE_BOXES_RELEASE}/install.sh" | sh
"${XYNE_BOXES_BIN}/xyne-boxes" version
"${XYNE_BOXES_BIN}/step" version | head -n 1
