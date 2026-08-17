import { describe, expect, test } from "bun:test"
import { prepareArgv } from "./shared.ts"

describe("prepareArgv", () => {
  test("leaves non-connect commands alone", () => {
    expect(prepareArgv(["create", "box"])).toEqual(["create", "box"])
    expect(prepareArgv(["list"])).toEqual(["list"])
  })

  test("parks connect extras after -- so ssh flags are not CLI options", () => {
    expect(prepareArgv(["connect", "mybox", "-o", "ForwardAgent=yes", "--", "echo", "hi"])).toEqual([
      "connect",
      "mybox",
      "--",
      "-o",
      "ForwardAgent=yes",
      "--",
      "echo",
      "hi",
    ])
  })

  test("does not double-insert --", () => {
    expect(prepareArgv(["connect", "mybox", "--", "uname"])).toEqual([
      "connect",
      "mybox",
      "--",
      "uname",
    ])
  })

  test("leaves connect help alone", () => {
    expect(prepareArgv(["connect", "--help"])).toEqual(["connect", "--help"])
  })
})
