import { Effect, Fiber, Stream } from "effect"
import type { PlatformError } from "effect/PlatformError"
import { ChildProcess } from "effect/unstable/process"
import type { ChildProcessHandle, ChildProcessSpawner } from "effect/unstable/process/ChildProcessSpawner"
import { CommandFailed } from "./errors.ts"

export type ProcessReq = ChildProcessSpawner

const SIGNAL_NUM: Record<string, number> = {
  SIGHUP: 1,
  SIGINT: 2,
  SIGQUIT: 3,
  SIGABRT: 6,
  SIGKILL: 9,
  SIGALRM: 14,
  SIGTERM: 15,
}

const errorText = (error: unknown): string => {
  const parts: string[] = []
  const walk = (value: unknown, depth: number): void => {
    if (value === null || value === undefined || depth > 6) return
    if (typeof value === "string") {
      parts.push(value)
      return
    }
    if (value instanceof Error) {
      parts.push(value.message)
      walk(value.cause, depth + 1)
      return
    }
    if (typeof value === "object") {
      const rec = value as Record<string, unknown>
      if (typeof rec["message"] === "string") parts.push(rec["message"])
      walk(rec["cause"], depth + 1)
      walk(rec["reason"], depth + 1)
    }
  }
  walk(error, 0)
  return parts.join("\n")
}

/** Unix 128+n when Effect fails `exitCode` because the child died on a signal. */
export const signalExitCode = (error: unknown): number => {
  const match = /signal: '([A-Z0-9]+)'/.exec(errorText(error))
  if (match === null || match[1] === undefined) return 1
  const n = SIGNAL_NUM[match[1]]
  return n === undefined ? 1 : 128 + n
}

export const waitExitCode = (
  handle: Pick<ChildProcessHandle, "exitCode">,
): Effect.Effect<number> =>
  handle.exitCode.pipe(
    Effect.match({
      onSuccess: (code) => Number(code),
      onFailure: (error) => signalExitCode(error),
    }),
  )

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
      const exitCode = yield* waitExitCode(handle)
      yield* Effect.logDebug(`${command} ${args.join(" ")} exit=${exitCode}`)
      return exitCode
    }),
  )

export const runString = (
  command: string,
  args: ReadonlyArray<string>,
  options: Omit<RunOptions, "stdout" | "stderr"> = {},
): Effect.Effect<string, CommandFailed | PlatformError, ProcessReq> =>
  runCaptured(command, args, options).pipe(
    Effect.flatMap((captured) => {
      if (captured.exitCode !== 0) {
        return new CommandFailed({
          command,
          args,
          exitCode: captured.exitCode,
          stderr: captured.stderr,
        })
      }
      return Effect.succeed(captured.stdout)
    }),
  )

export const runOk = (
  command: string,
  args: ReadonlyArray<string>,
  options: RunOptions = {},
): Effect.Effect<void, CommandFailed | PlatformError, ProcessReq> =>
  runString(command, args, options).pipe(Effect.asVoid)

export interface Captured {
  readonly stdout: string
  readonly stderr: string
  readonly exitCode: number
}

/** Run a process, collect stdout and stderr, never inherit. */
export const runCaptured = (
  command: string,
  args: ReadonlyArray<string>,
  options: Omit<RunOptions, "stdout" | "stderr"> = {},
): Effect.Effect<Captured, PlatformError, ProcessReq> =>
  Effect.scoped(
    Effect.gen(function* () {
      const handle = yield* ChildProcess.make(command, args, {
        stdin: options.stdin ?? "ignore",
        stdout: "pipe",
        stderr: "pipe",
        env: options.env,
        extendEnv: true,
      })
      const outFiber = yield* Effect.forkChild(
        Stream.mkString(Stream.decodeText(handle.stdout)),
      )
      const errFiber = yield* Effect.forkChild(
        Stream.mkString(Stream.decodeText(handle.stderr)),
      )
      const exitCode = yield* waitExitCode(handle)
      const stdout = yield* Fiber.join(outFiber)
      const stderr = yield* Fiber.join(errFiber)
      yield* Effect.logDebug(`${command} ${args.join(" ")} exit=${exitCode}`)
      return { stdout, stderr, exitCode }
    }),
  )

export const lastProcessLine = (captured: Captured): string => {
  const last = (text: string): string => {
    const lines = text
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line !== "")
    return lines[lines.length - 1] ?? ""
  }
  return last(captured.stderr) || last(captured.stdout)
}
