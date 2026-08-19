import { BorderChars } from "@opentui/core"
import { describe, expect, test } from "bun:test"
import { CliError } from "effect/unstable/cli"
import { AuthError, CommandFailed, TAILSCALE_UP } from "xyne-boxes"
import { describeError, errorWidget, helpText, plainText } from "./ui.ts"

describe("helpText", () => {
  test("names every command", () => {
    const text = plainText(helpText("xyne-boxes"))
    for (const command of ["create", "connect", "list", "fork", "destroy", "version", "help"]) {
      expect(text).toContain(command)
    }
    expect(text).toContain("xyne-boxes <command>")
    expect(text).toContain("--verbose")
  })
})

describe("describeError", () => {
  test("renders AuthError by class and by _tag", () => {
    const error = new AuthError({
      message: "Could not reach the SSH CA at pu (https://pu:8443).",
      hint: `  ${TAILSCALE_UP}`,
    })
    expect(describeError(error)).toEqual({
      title: "auth",
      headline: "Could not reach the SSH CA at pu (https://pu:8443).",
      detail: `  ${TAILSCALE_UP}`,
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
    const view = describeError(error)
    expect(view.title).toBe("command")
    expect(view.headline).toBe("/home/srid/.local/bin/step exited 1.")
    expect(view.detail).toContain("connection refused")
    expect(view.detail).toContain(TAILSCALE_UP)
    expect(view.exitCode).toBe(1)
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
    expect(describeError(error).title).toBe("usage")
    expect(describeError(error).exitCode).toBe(1)
  })
})

describe("errorWidget", () => {
  test("draws an OpenTUI box with the headline and the recover command", () => {
    const text = errorWidget(
      {
        title: "auth",
        headline: "Could not reach the SSH CA at 10.10.68.56 (https://10.10.68.56:8443).",
        detail: `That host is on the Juspay Tailscale network.\n\n  ${TAILSCALE_UP}`,
        exitCode: 1,
      },
      100,
    )
      .map((line) => plainText(line))
      .join("\n")
    expect(text).toContain("auth")
    expect(text).toContain("Could not reach the SSH CA at 10.10.68.56")
    expect(text).toContain(TAILSCALE_UP)
    expect(text).toContain(BorderChars.rounded.topLeft)
    expect(text).toContain(BorderChars.rounded.bottomRight)
  })
})
