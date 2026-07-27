#!/usr/bin/env bash
set -euo pipefail

PU_STATE_DIR="${PU_STATE_DIR:-$HOME/.pu-state}"
mkdir -p "$PU_STATE_DIR"

PU_HOST="${PU_HOST:-pu}"
PU_ADMIN="${PU_ADMIN:-toor}"
PU_USE_SSH_CA="${PU_USE_SSH_CA:-true}"
STEP_FINGERPRINT="${STEP_FINGERPRINT:-76bb5cab2458b5331221da3cc6754102189a03184d119b26ce5284b49fa06463}"
STEP_CA_URL="${STEP_CA_URL:-https://${PU_HOST}:8443}"
CLI_NAME="${0##*/}"
export STEP_FINGERPRINT STEP_CA_URL

# Emit `pu: <first> [state=<code>]` on stderr + indented secondary lines.
pu_err() {
  local code="$1"; shift
  local first="$1"; shift
  printf 'pu: %s [state=%s]\n' "$first" "$code" >&2
  local line
  for line in "$@"; do
    printf '    %s\n' "$line" >&2
  done
}

_pu_emit_connect_failed() {
  # Skip the wrap if PU_HOST:22 is actually reachable — rc=255 then means
  # auth / host-key / cert issue, and ssh's own stderr already explains.
  # `nc -w` doesn't bound connect() on BSD; wrap with timeout(1)/gtimeout.
  local tmo=""
  if   command -v timeout  >/dev/null 2>&1; then tmo=timeout
  elif command -v gtimeout >/dev/null 2>&1; then tmo=gtimeout
  fi
  if [ -n "$tmo" ] && command -v nc >/dev/null 2>&1 \
     && $tmo 2 nc -z "$PU_HOST" 22 >/dev/null 2>&1; then
    return 0
  fi
  pu_err connect-failed \
    "cannot reach pu-manager at \$PU_HOST:22." \
    "Check DNS / VPN reachability." \
    "If it persists, check with an admin or post in #xyne-boxes-feedback."
}

require_step_cli() {
  if [ "${PU_USE_SSH_CA:-}" = "true" ] && ! command -v step >/dev/null 2>&1; then
    echo "step-cli is not installed." >&2
    echo "Install from: https://smallstep.com/docs/step-cli/installation/" >&2
    exit 1
  fi
}

pu_version() {
  echo "GNU bash, version $BASH_VERSION"
  ssh -V 2>&1
  [ "${PU_USE_SSH_CA:-}" = "true" ] && step version | head -1
}

require_step_cli

client_auth_init() {
  _pu_instance_ssh_opts=()
  _pu_mac_opts=(-o "MACs=hmac-sha2-256-etm@openssh.com,hmac-sha2-512-etm@openssh.com,umac-128-etm@openssh.com")

  if [ "${PU_USE_SSH_CA:-}" != "true" ]; then
    _pu_ssh_opts=("${_pu_mac_opts[@]}" -o StrictHostKeyChecking=no)
    _pu_instance_ssh_opts=("${_pu_mac_opts[@]}")
    write_proxy_script
    migrate_old_ssh_configs
    return
  fi

  if [ ! -f "$PU_STATE_DIR/key" ]; then
    ssh-keygen -q -t ed25519 -N "" -f "$PU_STATE_DIR/key"
  fi

  if ! step ca health &>/dev/null; then
    step ca bootstrap --force
  fi

  if [ ! -f "$PU_STATE_DIR/key-cert.pub" ] ||
    [ ! -f "$PU_STATE_DIR/key-cert.provisioner" ] ||
    [ "$(cat "$PU_STATE_DIR/key-cert.provisioner")" != GoogleBrowserless ] ||
    step ssh needs-renewal "$PU_STATE_DIR/key-cert.pub" --expires-in 75% 2>/dev/null; then
    echo "Signing SSH key..." >&2
    step ssh certificate --force --no-agent --no-password --insecure --provisioner GoogleBrowserless --console me "$PU_STATE_DIR/key"
    echo GoogleBrowserless > "$PU_STATE_DIR/key-cert.provisioner"
  fi

  _pu_instance_ssh_opts=("${_pu_mac_opts[@]}" -i "$PU_STATE_DIR/key" -o "CertificateFile=$PU_STATE_DIR/key-cert.pub" -o IdentitiesOnly=yes)
  _pu_ssh_opts=("${_pu_mac_opts[@]}" -i "$PU_STATE_DIR/key" -o "CertificateFile=$PU_STATE_DIR/key-cert.pub" -o IdentitiesOnly=yes \
    -o "UserKnownHostsFile=$PU_STATE_DIR/known_hosts" -o StrictHostKeyChecking=accept-new)

  write_proxy_script
  migrate_old_ssh_configs
}

# Emit pu-proxy at ~/.pu-state/bin. Refreshed each client_auth_init so
# upgrades take effect without rewriting every per-container ssh_config.
write_proxy_script() {
  local dir="$PU_STATE_DIR/bin"
  local script="$dir/pu-proxy"
  mkdir -p "$dir"
  cat > "$script" <<'PROXY_EOF'
#!/bin/sh
# pu-proxy: cert pre-flight + ssh delegation. Emitted by pu-client's
# write_proxy_script; do not hand-edit.

name="$1"
: "${PU_STATE_DIR:=$HOME/.pu-state}"

# PU_HOST / PU_USE_SSH_CA baked into ProxyCommand as `env … pu-proxy $name`.
: "${PU_HOST:=pu}"
: "${PU_USE_SSH_CA:=true}"

readonly XYNE_BOXES_CLI="nix run https://github.com/juspay/xyne-boxes/archive/main.zip --"

msg() {
  code="$1"; shift
  first="$1"; shift
  printf 'pu: %s [state=%s]\n' "$first" "$code" >&2
  for line in "$@"; do
    printf '    %s\n' "$line" >&2
  done
}

# Cert pre-flight (SSH CA mode only).
if [ "$PU_USE_SSH_CA" = "true" ]; then
  CERT="$PU_STATE_DIR/key-cert.pub"
  if [ ! -f "$CERT" ]; then
    msg no-cert \
      "first-run on this machine — no SSH cert on disk." \
      "Run '$XYNE_BOXES_CLI list' once to create one (opens a browser sign-in)."
    exit 1
  fi
  valid_to=$(ssh-keygen -L -f "$CERT" 2>/dev/null | awk '/Valid: from/ {print $NF}')
  if [ -n "$valid_to" ] && [ "$valid_to" != "forever" ]; then
    now=$(date -u +%Y-%m-%dT%H:%M:%S)
    # ISO 8601 → POSIX lex compare.
    if [ "$now" \> "$valid_to" ]; then
      msg cert-expired \
        "your SSH certificate expired at $valid_to." \
        "Run '$XYNE_BOXES_CLI list' — one browser sign-in refreshes the cert." \
        "VS Code / editors reconnect on their own after that."
      exit 1
    fi
  fi
fi

_MACS="hmac-sha2-256-etm@openssh.com,hmac-sha2-512-etm@openssh.com,umac-128-etm@openssh.com"

if [ "$PU_USE_SSH_CA" = "true" ]; then
  ssh -T \
    -o "MACs=$_MACS" \
    -i "$PU_STATE_DIR/key" \
    -o "CertificateFile=$PU_STATE_DIR/key-cert.pub" \
    -o IdentitiesOnly=yes \
    -o "UserKnownHostsFile=$PU_STATE_DIR/known_hosts" \
    -o StrictHostKeyChecking=accept-new \
    "pu@${PU_HOST}" "connect $name"
else
  ssh -T \
    -o "MACs=$_MACS" \
    -o StrictHostKeyChecking=no \
    "pu@${PU_HOST}" "connect $name"
fi
rc=$?

# Only wrap when PU_HOST:22 truly can't be reached. BSD nc's -w bounds
# reads not connect(), so wrap with timeout — otherwise the probe itself
# hangs for the OS's TCP retry window (minutes on macOS).
if [ "$rc" -eq 255 ]; then
  _tmo=""
  if   command -v timeout  >/dev/null 2>&1; then _tmo=timeout
  elif command -v gtimeout >/dev/null 2>&1; then _tmo=gtimeout
  fi
  if [ -n "$_tmo" ] && command -v nc >/dev/null 2>&1 \
     && $_tmo 2 nc -z "$PU_HOST" 22 >/dev/null 2>&1; then
    :  # port open — ssh's own stderr already explains the failure
  else
    msg connect-failed \
      "cannot reach pu-manager at \$PU_HOST:22." \
      "Check DNS / VPN reachability." \
      "If it persists, check with an admin or post in #xyne-boxes-feedback."
  fi
fi
exit "$rc"
PROXY_EOF
  chmod 0755 "$script"
}

# Rewrite legacy per-container ssh_config with inline ssh ProxyCommand
# to the pu-proxy indirection. Idempotent.
migrate_old_ssh_configs() {
  local cfg name
  [ -d "$PU_STATE_DIR" ] || return 0
  local proxy="$PU_STATE_DIR/bin/pu-proxy"
  for cfg in "$PU_STATE_DIR"/*/ssh_config; do
    [ -f "$cfg" ] || continue
    if grep -q "ProxyCommand.*pu-proxy" "$cfg" 2>/dev/null; then
      continue
    fi
    if ! grep -q '^  ProxyCommand ssh' "$cfg" 2>/dev/null; then
      continue
    fi
    name=$(basename "$(dirname "$cfg")")
    awk -v n="$name" -v p="$proxy" '
      /^  ProxyCommand ssh / { print "  ProxyCommand " p " " n; next }
      { print }
    ' "$cfg" > "$cfg.new" && mv "$cfg.new" "$cfg"
  done
}

pu_ssh() {
  local rc=0 interrupted=0
  trap 'interrupted=1' INT
  ssh -nT "${_pu_ssh_opts[@]}" "pu@${PU_HOST}" "$@" || rc=$?
  trap - INT
  # Suppress the connect-failed wrap on Ctrl-C: ssh returns 255 when
  # interrupted mid-handshake, indistinguishable from real transport
  # failure by rc alone.
  if [ "$rc" -eq 255 ] && [ "$interrupted" -eq 0 ]; then
    _pu_emit_connect_failed
  fi
  return "$rc"
}

pu_proxy_command() {
  local name="$1" proxy_cmd
  proxy_cmd=$(printf '%q %q' "$PU_STATE_DIR/bin/pu-proxy" "$name")
  printf '%s\n' "$proxy_cmd"
}

write_ssh_config() {
  local name="$1"
  local dir="$PU_STATE_DIR/$name"
  mkdir -p "$dir"

  # Bake current shell's PU_HOST + PU_USE_SSH_CA into ProxyCommand so
  # `ssh <container>` from any future shell reaches the right server.
  local env_prefix
  env_prefix="env PU_HOST=$(printf '%q' "$PU_HOST") PU_USE_SSH_CA=$(printf '%q' "${PU_USE_SSH_CA:-true}")"

  {
    echo "Host $name"
    echo "  User $PU_ADMIN"
    [ "${PU_USE_SSH_CA:-}" = "true" ] && {
      echo "  IdentityFile $PU_STATE_DIR/key"
      echo "  CertificateFile $PU_STATE_DIR/key-cert.pub"
      echo "  IdentitiesOnly yes"
    }
    echo "  ProxyCommand $env_prefix $PU_STATE_DIR/bin/pu-proxy $name"
    echo "  ForwardAgent yes"
    echo "  StrictHostKeyChecking no"
    echo "  UserKnownHostsFile /dev/null"
  } > "$dir/ssh_config"
}

pu_launch() {
  local name="$1" cmd="$2" label="$3"
  client_auth_init
  echo "$label..." >&2
  pu_ssh "$cmd" > /dev/null || return 1
  echo "Waiting for instance to be ready..." >&2
  pu_ssh "wait $name" > /dev/null || return 1
  write_ssh_config "$name"
  echo "$name"
}

pu_create() {
  [ $# -eq 1 ] || {
    echo "Usage: $CLI_NAME create <name>" >&2
    exit 1
  }
  local name="$1"
  pu_launch "$name" "create base-container $name" "Creating instance"
}

pu_fork() {
  [ $# -eq 2 ] || {
    echo "Usage: $CLI_NAME fork <source> <name>" >&2
    exit 1
  }
  local source="$1" name="$2"
  pu_launch "$name" "fork $source $name" "Forking $source"
}

pu_connect() {
  local name="${1:-}"
  [ -z "$name" ] && {
    echo "Usage: $CLI_NAME connect <name> [ssh options ...] [-- remote command ...]" >&2
    exit 1
  }
  shift

  local ssh_args=() remote_cmd=() saw_separator=false
  while [ $# -gt 0 ]; do
    if [ "$1" = "--" ]; then
      saw_separator=true
      shift
      continue
    fi

    if [ "$saw_separator" = "false" ] && [ ${#ssh_args[@]} -eq 0 ] && [[ "$1" != -* ]]; then
      remote_cmd=("$@")
      break
    fi

    if [ "$saw_separator" = "true" ]; then
      remote_cmd+=("$1")
    else
      ssh_args+=("$1")
    fi
    shift
  done

  client_auth_init
  write_ssh_config "$name"

  local proxy_cmd
  proxy_cmd=$(pu_proxy_command "$name")

  # ${arr[@]+"${arr[@]}"} keeps `set -u` + empty arrays safe on bash 3.2 (macOS).
  # Don't wrap rc=255 here: with ProxyCommand=pu-proxy, outer ssh returns
  # 255 whenever pu-proxy exits non-zero (including server errors like
  # [state=absent]/[state=api-down]). pu-proxy already emits the correct
  # [state=…] on stderr; wrapping again just duplicates the message.
  exec ssh \
    ${_pu_instance_ssh_opts[@]+"${_pu_instance_ssh_opts[@]}"} \
    ${ssh_args[@]+"${ssh_args[@]}"} \
    -o "ProxyCommand=$proxy_cmd" \
    -o ForwardAgent=yes \
    -o StrictHostKeyChecking=no \
    -o UserKnownHostsFile=/dev/null \
    -l "$PU_ADMIN" \
    -- "$name" \
    ${remote_cmd[@]+"${remote_cmd[@]}"}
}

pu_destroy() {
  [ $# -eq 0 ] && {
    echo "Usage: $CLI_NAME destroy <name> [name ...]" >&2
    exit 1
  }

  client_auth_init

  local name
  pu_ssh destroy "$@"

  for name in "$@"; do
    rm -rf "${PU_STATE_DIR:?}/$name"
  done
}

cmd="${1:-}"

case "$cmd" in
  create)
    shift
    name="${1:-}"
    pu_create "$@"
    echo "Connect: $CLI_NAME connect $name" >&2
    ;;

  fork)
    shift
    name="${2:-}"
    pu_fork "$@"
    echo "Connect: $CLI_NAME connect $name" >&2
    ;;

  connect)
    shift
    pu_connect "$@"
    ;;

  destroy)
    shift
    pu_destroy "$@"
    ;;

  list)
    client_auth_init
    pu_ssh "list"
    ;;

  version)
    pu_version
    ;;

  *)
    cat >&2 <<EOF
Usage: $CLI_NAME <command>

Commands:
  create <name>                    Create instance and print a $CLI_NAME connect command
  fork <source> <name>             Fork an existing instance and print a $CLI_NAME connect command
  connect <name> [ssh args ...]    Connect to an instance via ssh; use -- before a remote command
  destroy <name> [name ...]        Destroy one or more instances
  list                             List your instances
  version                          Print bash, ssh, and step-cli versions
EOF
    exit 1
    ;;
esac
