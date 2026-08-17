import { invalidBoxName, UsageError } from "xyne-boxes"

export interface ConnectArgs {
  readonly name: string
  readonly sshArgs: ReadonlyArray<string>
  readonly remoteCmd: ReadonlyArray<string>
}

export function parseConnectArgs(
  argv: ReadonlyArray<string>,
  cliName: string,
): ConnectArgs | UsageError {
  const name = argv[0]
  if (name === undefined || name === "") {
    return new UsageError({
      message: `Usage: ${cliName} connect <name> [ssh options ...] [-- remote command ...]`,
    })
  }
  const bad = invalidBoxName(name)
  if (bad !== undefined) return new UsageError({ message: bad })

  const rest = argv.slice(1)
  const sshArgs: string[] = []
  const remoteCmd: string[] = []
  let sawSeparator = false

  for (let i = 0; i < rest.length; i++) {
    const arg = rest[i]
    if (arg === undefined) continue

    if (arg === "--") {
      sawSeparator = true
      continue
    }

    if (!sawSeparator && sshArgs.length === 0 && !arg.startsWith("-")) {
      remoteCmd.push(...rest.slice(i))
      break
    }

    if (sawSeparator) remoteCmd.push(arg)
    else sshArgs.push(arg)
  }

  return { name, sshArgs, remoteCmd }
}
