import { Effect } from "effect"
import { Argument, Command } from "effect/unstable/cli"
import { ChildProcess } from "effect/unstable/process"
import { parseConnectArgs } from "../connect-args.ts"
import { UsageError } from "../errors.ts"
import { waitExitCode } from "../process.ts"
import { sshArgv } from "../ssh.ts"
import { printConnecting, spinner } from "../ui.ts"
import { cliName, makeClient } from "./shared.ts"

export const connect = Command.make(
  "connect",
  {
    name: Argument.string("name").pipe(Argument.withDescription("Box name")),
    extra: Argument.string("extra").pipe(
      Argument.withDescription("ssh options and/or a remote command"),
      Argument.variadic(),
    ),
  },
  ({ name, extra }) =>
    Effect.gen(function* () {
      const parsed = parseConnectArgs([name, ...extra], cliName())
      if (parsed instanceof UsageError) return yield* parsed

      const client = yield* makeClient()
      const spin = spinner("Preparing SSH")
      const config = yield* client
        .sshConfig(parsed.name, {
          onSigning: () => spin.update("Signing SSH key — a browser may open"),
        })
        .pipe(Effect.tapError(() => Effect.sync(() => spin.fail("Could not prepare SSH"))))
      spin.stop()
      printConnecting(parsed.name, parsed.remoteCmd)
      const args = sshArgv(config, {
        sshArgs: parsed.sshArgs,
        remoteCmd: parsed.remoteCmd,
      })
      const handle = yield* ChildProcess.make("ssh", args, {
        stdin: "inherit",
        stdout: "inherit",
        stderr: "inherit",
        extendEnv: true,
      })
      const code = yield* waitExitCode(handle)
      if (code !== 0) {
        return yield* Effect.sync(() => process.exit(code))
      }
    }),
).pipe(
  Command.withDescription(
    "SSH into a box. Pass ssh options after the name; use -- before a remote command.",
  ),
)
