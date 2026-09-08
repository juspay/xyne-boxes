import { describe, expect, test } from "bun:test"
import { resolveConfig } from "./config.ts"

describe("resolveConfig", () => {
  test("options win over env", () => {
    const config = resolveConfig({
      host: "other",
      admin: "root",
      authMode: "host",
      stateDir: "/tmp/pu",
    })
    expect(config.host).toBe("other")
    expect(config.admin).toBe("root")
    expect(config.authMode).toBe("host")
    expect(config.stateDir).toBe("/tmp/pu")
    expect("stepCaUrl" in config).toBe(false)
  })

  test("defaults to SSH CA authentication", () => {
    const previous = process.env["PU_AUTH_MODE"]
    delete process.env["PU_AUTH_MODE"]
    try {
      expect(resolveConfig().authMode).toBe("ssh-ca")
    } finally {
      if (previous !== undefined) process.env["PU_AUTH_MODE"] = previous
    }
  })

  test("rejects the removed ambient auth mode", () => {
    const previous = process.env["PU_AUTH_MODE"]
    process.env["PU_AUTH_MODE"] = "ambient"
    try {
      expect(() => resolveConfig()).toThrow("Invalid PU_AUTH_MODE: ambient")
    } finally {
      if (previous === undefined) delete process.env["PU_AUTH_MODE"]
      else process.env["PU_AUTH_MODE"] = previous
    }
  })
})
