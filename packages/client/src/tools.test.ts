import { describe, expect, test } from "bun:test"
import { resolveStep } from "./tools.ts"

describe("resolveStep", () => {
  test("XYNE_STEP wins", () => {
    const prev = process.env["XYNE_STEP"]
    process.env["XYNE_STEP"] = "/opt/step"
    try {
      expect(resolveStep()).toBe("/opt/step")
    } finally {
      if (prev === undefined) delete process.env["XYNE_STEP"]
      else process.env["XYNE_STEP"] = prev
    }
  })
})
