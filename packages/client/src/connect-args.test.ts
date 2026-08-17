import { describe, expect, test } from "bun:test"
import { parseConnectArgs } from "./connect-args.ts"
import { UsageError } from "./errors.ts"

describe("parseConnectArgs", () => {
  test("requires a name", () => {
    const parsed = parseConnectArgs([], "xyne-boxes")
    expect(parsed).toBeInstanceOf(UsageError)
  })

  test("rejects a path-like name", () => {
    const parsed = parseConnectArgs(["../etc"], "xyne-boxes")
    expect(parsed).toBeInstanceOf(UsageError)
  })

  test("bare connect is just the name", () => {
    expect(parseConnectArgs(["mybox"], "xyne-boxes")).toEqual({
      name: "mybox",
      sshArgs: [],
      remoteCmd: [],
    })
  })

  test("unflagged rest is a remote command", () => {
    expect(parseConnectArgs(["mybox", "uname", "-a"], "xyne-boxes")).toEqual({
      name: "mybox",
      sshArgs: [],
      remoteCmd: ["uname", "-a"],
    })
  })

  test("ssh options then -- remote", () => {
    expect(
      parseConnectArgs(["mybox", "-o", "ForwardAgent=yes", "--", "echo", "hi"], "xyne-boxes"),
    ).toEqual({
      name: "mybox",
      sshArgs: ["-o", "ForwardAgent=yes"],
      remoteCmd: ["echo", "hi"],
    })
  })
})
