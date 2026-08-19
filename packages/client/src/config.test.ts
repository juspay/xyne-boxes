import { describe, expect, test } from "bun:test"
import { envFlag, resolveConfig } from "./config.ts"

describe("envFlag", () => {
  test("treats false and 0 as off", () => {
    expect(envFlag("false", true)).toBe(false)
    expect(envFlag("0", true)).toBe(false)
    expect(envFlag("true", false)).toBe(true)
    expect(envFlag(undefined, true)).toBe(true)
  })
})

describe("resolveConfig", () => {
  test("options win over env", () => {
    const config = resolveConfig({
      host: "other",
      admin: "root",
      useSshCa: false,
      stateDir: "/tmp/pu",
    })
    expect(config.host).toBe("other")
    expect(config.admin).toBe("root")
    expect(config.useSshCa).toBe(false)
    expect(config.stateDir).toBe("/tmp/pu")
    expect(config.stepCaUrl).toBe("https://other:8443")
  })
})
