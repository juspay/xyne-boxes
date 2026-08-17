import { join } from "node:path"
import { Effect, FileSystem } from "effect"
import type { PlatformError } from "effect/PlatformError"
import type { Auth } from "./auth.ts"
import { type ResolvedConfig, identityPaths } from "./config.ts"
import { CommandFailed } from "./errors.ts"
import { type ProcessReq, runOk, runString } from "./process.ts"
import { shellQuoteAll } from "./quote.ts"

export interface SshConfig {
  readonly name: string
  readonly user: string
  readonly configPath: string
  readonly proxyCommand: string
  /** Args to pass to `ssh` before user-supplied options, `-l`, and the host. */
  readonly sshArgs: ReadonlyArray<string>
  readonly destination: string
}

export const SSH_PROXY_SCRIPT = `#!/usr/bin/env bash

name="$1"
shift

"$@" 2> >(
  reported_auth_failure=false
  while IFS= read -r line || [ -n "$line" ]; do
    case "$line" in
      *"Permission denied"*)
        if [ "$reported_auth_failure" = false ]; then
          reported_auth_failure=true
          cat >&2 <<MESSAGE
xyne-boxes: SSH authentication failed. Your certificate may have expired.

Renew it by running:
  nix run https://github.com/juspay/xyne-boxes/archive/main.zip connect $name
MESSAGE
        fi
        ;;
      *) printf '%s\\n' "$line" >&2 ;;
    esac
  done
)
`

export function formatSshConfigFile(input: {
  readonly name: string
  readonly user: string
  readonly useSshCa: boolean
  readonly identityFile?: string
  readonly certificateFile?: string
  readonly proxyCommand: string
}): string {
  const lines = [
    `Host ${input.name}`,
    `  User ${input.user}`,
  ]
  if (input.useSshCa && input.identityFile !== undefined && input.certificateFile !== undefined) {
    lines.push(`  IdentityFile ${input.identityFile}`)
    lines.push(`  CertificateFile ${input.certificateFile}`)
    lines.push("  IdentitiesOnly yes")
  }
  lines.push(`  ProxyCommand ${input.proxyCommand}`)
  lines.push("  ForwardAgent yes")
  lines.push("  StrictHostKeyChecking no")
  lines.push("  UserKnownHostsFile /dev/null")
  lines.push("")
  return lines.join("\n")
}

export const writeSshProxy = (
  config: ResolvedConfig,
): Effect.Effect<string, PlatformError, FileSystem.FileSystem> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem
    const path = identityPaths(config.stateDir).proxy
    const tmp = `${path}.${crypto.randomUUID()}`
    yield* fs.writeFileString(tmp, SSH_PROXY_SCRIPT)
    yield* fs.chmod(tmp, 0o700)
    yield* fs.rename(tmp, path)
    return path
  })

export const proxyCommand = (
  config: ResolvedConfig,
  auth: Auth,
  name: string,
): Effect.Effect<string, PlatformError, FileSystem.FileSystem> =>
  Effect.gen(function* () {
    const proxy = yield* writeSshProxy(config)
    return shellQuoteAll([
      proxy,
      name,
      "ssh",
      "-o",
      "BatchMode=yes",
      "-T",
      ...auth.sshArgs,
      `pu@${config.host}`,
      `connect ${name}`,
    ])
  })

export const writeInstanceSshConfig = (
  config: ResolvedConfig,
  auth: Auth,
  name: string,
): Effect.Effect<SshConfig, PlatformError, FileSystem.FileSystem> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem
    const dir = join(config.stateDir, name)
    yield* fs.makeDirectory(dir, { recursive: true })
    const proxy = yield* proxyCommand(config, auth, name)
    const configPath = join(dir, "ssh_config")
    yield* fs.writeFileString(
      configPath,
      formatSshConfigFile({
        name,
        user: config.admin,
        useSshCa: auth.useSshCa,
        identityFile: auth.identityFile,
        certificateFile: auth.certificateFile,
        proxyCommand: proxy,
      }),
    )
    return {
      name,
      user: config.admin,
      configPath,
      proxyCommand: proxy,
      sshArgs: [
        ...auth.instanceSshArgs,
        "-o",
        `ProxyCommand=${proxy}`,
        "-o",
        "ForwardAgent=yes",
        "-o",
        "StrictHostKeyChecking=no",
        "-o",
        "UserKnownHostsFile=/dev/null",
      ],
      destination: name,
    }
  })

export function sshArgv(
  config: SshConfig,
  options: {
    readonly sshArgs?: ReadonlyArray<string>
    readonly remoteCmd?: ReadonlyArray<string>
  } = {},
): ReadonlyArray<string> {
  return [
    ...config.sshArgs,
    ...(options.sshArgs ?? []),
    "-l",
    config.user,
    "--",
    config.destination,
    ...(options.remoteCmd ?? []),
  ]
}

export const controlSsh = (
  config: ResolvedConfig,
  auth: Auth,
  remote: ReadonlyArray<string>,
): Effect.Effect<string, CommandFailed | PlatformError, ProcessReq> =>
  runString("ssh", ["-nT", ...auth.sshArgs, `pu@${config.host}`, ...remote])

export const controlSshOk = (
  config: ResolvedConfig,
  auth: Auth,
  remote: ReadonlyArray<string>,
): Effect.Effect<void, CommandFailed | PlatformError, ProcessReq> =>
  runOk("ssh", ["-nT", ...auth.sshArgs, `pu@${config.host}`, ...remote])
