import { join } from "node:path"
import { Effect, FileSystem } from "effect"
import type { PlatformError } from "effect/PlatformError"
import type { Auth, SshOption } from "./auth.ts"
import { type ResolvedConfig, identityPaths } from "./config.ts"
import { CommandFailed } from "./errors.ts"
import { type ProcessReq, runOk, runString } from "./process.ts"
import { shellQuoteAll } from "./quote.ts"
import { resolveSsh } from "./tools.ts"

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
xyne-boxes: SSH authentication failed. Check this box's access or renew your login.

  xyne-boxes connect $name
MESSAGE
        fi
        ;;
      *) printf '%s\\n' "$line" >&2 ;;
    esac
  done
)
`

const sshOptionArgs = (
  options: ReadonlyArray<SshOption>,
): ReadonlyArray<string> => options.flatMap(([name, value]) => ["-o", `${name}=${value}`])

export function formatSshConfigFile(input: {
  readonly name: string
  readonly user: string
  readonly options: ReadonlyArray<SshOption>
}): string {
  const lines = [
    `Host ${input.name}`,
    `  User ${input.user}`,
    ...input.options.map(([name, value]) => `  ${name} ${value}`),
  ]
  lines.push("")
  return lines.join("\n")
}

const instanceSshOptions = (
  auth: Auth,
  proxy: string,
): ReadonlyArray<SshOption> => [
  ...auth.instanceOptions,
  ["ProxyCommand", proxy],
  ["ForwardAgent", "yes"],
]

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
      resolveSsh(),
      "-o",
      "BatchMode=yes",
      "-T",
      ...sshOptionArgs(auth.controlOptions),
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
    const options = instanceSshOptions(auth, proxy)
    yield* fs.writeFileString(
      configPath,
      formatSshConfigFile({
        name,
        user: config.admin,
        options,
      }),
    )
    return {
      name,
      user: config.admin,
      configPath,
      proxyCommand: proxy,
      sshArgs: sshOptionArgs(options),
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
  // User -o flags first: ssh keeps the first value per keyword, matching
  // the bash client (instance opts, user args, then ProxyCommand / host-key).
  return [
    ...(options.sshArgs ?? []),
    ...config.sshArgs,
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
  runString(resolveSsh(), ["-nT", ...sshOptionArgs(auth.controlOptions), `pu@${config.host}`, ...remote])

export const controlSshOk = (
  config: ResolvedConfig,
  auth: Auth,
  remote: ReadonlyArray<string>,
): Effect.Effect<void, CommandFailed | PlatformError, ProcessReq> =>
  runOk(resolveSsh(), ["-nT", ...sshOptionArgs(auth.controlOptions), `pu@${config.host}`, ...remote])
