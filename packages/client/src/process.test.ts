import { describe, expect, test } from "bun:test"
import { lastProcessLine, type Captured } from "./process.ts"

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
