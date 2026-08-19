import { describe, expect, test } from "bun:test"
import { NodeServices } from "@effect/platform-node"
import { Effect, Result } from "effect"
import { ChildProcess } from "effect/unstable/process"
import { CommandFailed } from "./errors.ts"
import {
  lastProcessLine,
  runString,
  signalExitCode,
  waitExitCode,
  type Captured,
} from "./process.ts"

describe("lastProcessLine", () => {
  test("prefers the last non-empty line across stderr then stdout", () => {
    const captured: Captured = {
      stdout: "ok\n",
      stderr: "error downloading root certificate: connection refused\n",
      exitCode: 1,
    }
    expect(lastProcessLine(captured)).toBe(
      "error downloading root certificate: connection refused",
    )
  })
})

describe("signalExitCode", () => {
  test("maps Effect's signal-death message to 128+n", () => {
    expect(signalExitCode(new Error("Process interrupted due to receipt of signal: 'SIGTERM'"))).toBe(
      143,
    )
    expect(signalExitCode(new Error("Process interrupted due to receipt of signal: 'SIGINT'"))).toBe(
      130,
    )
    expect(signalExitCode(new Error("unrelated"))).toBe(1)
    expect(
      signalExitCode({
        message: "Unknown: ChildProcess.exitCode",
        cause: new Error("Process interrupted due to receipt of signal: 'SIGINT'"),
      }),
    ).toBe(130)
  })
})

describe("waitExitCode", () => {
  test("returns 143 when the child dies on SIGTERM", async () => {
    const code = await Effect.runPromise(
      Effect.gen(function* () {
        const handle = yield* ChildProcess.make("sh", ["-c", "kill -s TERM $$"], {
          stdin: "ignore",
          stdout: "ignore",
          stderr: "ignore",
        })
        return yield* waitExitCode(handle)
      }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
    )
    expect(code).toBe(143)
  })
})

describe("runString", () => {
  test("attaches stderr to CommandFailed instead of inheriting it", async () => {
    const result = await Effect.runPromise(
      runString("sh", ["-c", "echo out; echo err >&2; exit 7"]).pipe(
        Effect.result,
        Effect.provide(NodeServices.layer),
      ),
    )
    expect(Result.isFailure(result)).toBe(true)
    if (!Result.isFailure(result)) return
    const error = result.failure
    expect(error).toBeInstanceOf(CommandFailed)
    if (!(error instanceof CommandFailed)) return
    expect(error.exitCode).toBe(7)
    expect(error.stderr).toContain("err")
  })
})
