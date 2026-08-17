import { describe, expect, test } from "bun:test"
import { helpText, plainText } from "./ui.ts"

describe("helpText", () => {
  test("names every command", () => {
    const text = plainText(helpText("xyne-boxes"))
    for (const command of ["create", "connect", "list", "fork", "destroy", "version", "help"]) {
      expect(text).toContain(command)
    }
    expect(text).toContain("xyne-boxes <command>")
  })
})
