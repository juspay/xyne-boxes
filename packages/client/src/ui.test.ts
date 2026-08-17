import { describe, expect, test } from "bun:test"
import { CliError } from "effect/unstable/cli"
import { AuthError, CommandFailed } from "./errors.ts"
import { describeError, helpText, plainText } from "./ui.ts"

describe("helpText", () => {
  test("names every command", () => {
    const text = plainText(helpText("xyne-boxes"))
    for (const command of ["create", "connect", "list", "fork", "destroy", "version", "help"]) {
      expect(text).toContain(command)
    }
    expect(text).toContain("xyne-boxes <command>")
  })
})

describe("describeError", () => {
  test("renders AuthError by class and by _tag", () => {
    const error = new AuthError({
      message: "error downloading root certificate: connection refused",
      hint: "Is pu reachable?",
    })
    expect(describeError(error)).toEqual({
      headline: "error downloading root certificate: connection refused",
      detail: "Is pu reachable?",
      exitCode: 1,
    })
    expect(describeError({ _tag: "AuthError", message: error.message, hint: error.hint })).toEqual(
      describeError(error),
    )
  })

  test("renders CommandFailed without relying on instanceof", () => {
    const error = new CommandFailed({
      command: "/home/srid/.local/bin/step",
      args: ["ca", "bootstrap", "--force"],
      exitCode: 1,
      stderr: "error downloading root certificate: connection refused\n",
    })
    expect(describeError(error)).toEqual({
      headline: "error downloading root certificate: connection refused  exit 1",
      detail: "/home/srid/.local/bin/step ca bootstrap --force",
      exitCode: 1,
    })
    expect(
      describeError({
        _tag: "CommandFailed",
        command: error.command,
        args: error.args,
        exitCode: error.exitCode,
        stderr: error.stderr,
      }),
    ).toEqual(describeError(error))
  })

  test("ShowHelp with parse errors surfaces those errors", () => {
    const error = new CliError.ShowHelp({
      commandPath: ["xyne-boxes", "create"],
      errors: [new CliError.MissingArgument({ argument: "name" })],
    })
    expect(describeError(error).headline).toContain("name")
    expect(describeError(error).exitCode).toBe(1)
  })
})
