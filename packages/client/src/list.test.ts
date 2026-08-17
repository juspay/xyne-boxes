import { describe, expect, test } from "bun:test"
import { parseList } from "./list.ts"

describe("parseList", () => {
  test("skips a header and splits name + location", () => {
    expect(parseList("NAME LOCATION\napp-pr-42 host-a\n")).toEqual([
      { name: "app-pr-42", location: "host-a", extra: [] },
    ])
  })

  test("treats an empty listing as no rows", () => {
    expect(parseList("\n")).toEqual([])
  })

  test("keeps leftover columns", () => {
    expect(parseList("box host extra bits")).toEqual([
      { name: "box", location: "host", extra: ["extra", "bits"] },
    ])
  })
})
