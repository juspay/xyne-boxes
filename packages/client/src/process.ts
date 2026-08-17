import { Effect, Stream } from "effect"
import type { PlatformError } from "effect/PlatformError"
import { ChildProcess } from "effect/unstable/process"
import type { ChildProcessSpawner } from "effect/unstable/process/ChildProcessSpawner"
import { CommandFailed } from "./errors.ts"

export type ProcessReq = ChildProcessSpawner

export interface RunOptions {
  readonly env?: Record<string, string>
  readonly stdin?: ChildProcess.CommandInput
  readonly stdout?: ChildProcess.CommandOutput
  readonly stderr?: ChildProcess.CommandOutput
}

export const runExitCode = (
  command: string,
  args: ReadonlyArray<string>,
  options: RunOptions = {},
): Effect.Effect<number, PlatformError, ProcessReq> =>
  Effect.scoped(
    Effect.gen(function* () {
      const handle = yield* ChildProcess.make(command, args, {
        stdin: options.stdin ?? "ignore",
        stdout: options.stdout ?? "ignore",
        stderr: options.stderr ?? "ignore",
        env: options.env,
        extendEnv: true,
      })
      return Number(yield* handle.exitCode)
    }),
  )

export const runString = (
  command: string,
  args: ReadonlyArray<string>,
  options: RunOptions = {},
): Effect.Effect<string, CommandFailed | PlatformError, ProcessReq> =>
  Effect.scoped(
    Effect.gen(function* () {
      const handle = yield* ChildProcess.make(command, args, {
        stdin: options.stdin ?? "ignore",
        stdout: options.stdout ?? "pipe",
        stderr: options.stderr ?? "inherit",
        env: options.env,
        extendEnv: true,
      })
      const stdout = yield* Stream.mkString(Stream.decodeText(handle.stdout))
      const code = Number(yield* handle.exitCode)
      if (code !== 0) {
        return yield* new CommandFailed({ command, args, exitCode: code })
      }
      return stdout
    }),
  )

export const runOk = (
  command: string,
  args: ReadonlyArray<string>,
  options: RunOptions = {},
): Effect.Effect<void, CommandFailed | PlatformError, ProcessReq> =>
  runString(command, args, options).pipe(Effect.asVoid)
