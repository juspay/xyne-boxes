import { describe, expect, test } from "bun:test"
import { isVerbose, takeVerbose } from "./verbose.ts"

describe("takeVerbose", () => {
  test("strips -v and --verbose before --", () => {
    expect(takeVerbose(["-v", "list"], {})).toEqual({ argv: ["list"], verbose: true })
    expect(takeVerbose(["list", "--verbose"], {})).toEqual({ argv: ["list"], verbose: true })
    expect(takeVerbose(["list"], {})).toEqual({ argv: ["list"], verbose: false })
  })

  test("leaves -v after -- for ssh", () => {
    expect(takeVerbose(["connect", "box", "--", "-v"], {})).toEqual({
      argv: ["connect", "box", "--", "-v"],
      verbose: false,
    })
  })

  test("XYNE_VERBOSE=1 is enough", () => {
    expect(takeVerbose(["list"], { XYNE_VERBOSE: "1" }).verbose).toBe(true)
    expect(isVerbose({ XYNE_VERBOSE: "1" })).toBe(true)
    expect(isVerbose({})).toBe(false)
  })
})
