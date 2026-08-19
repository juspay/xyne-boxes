import { describe, expect, test } from "bun:test"
import { invalidBoxName } from "./names.ts"

describe("invalidBoxName", () => {
  test("accepts the names we actually use", () => {
    expect(invalidBoxName("mybox")).toBeUndefined()
    expect(invalidBoxName("app-pr-42")).toBeUndefined()
    expect(invalidBoxName("a.b_c-1")).toBeUndefined()
  })

  test("rejects empty, spaces, and path separators", () => {
    expect(invalidBoxName("")).toContain("Box name is empty")
    expect(invalidBoxName("../etc")).toContain("\"../etc\" is not a valid box name")
    expect(invalidBoxName("a b")).toContain("\"a b\" is not a valid box name")
    expect(invalidBoxName("a b")).toContain("app-pr-42")
  })
})
