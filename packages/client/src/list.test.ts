import { describe, expect, test } from "bun:test"
import { namesFromList, parseList } from "./list.ts"

describe("parseList", () => {
  test("skips a header and splits name + location", () => {
    expect(parseList("NAME LOCATION\napp-pr-42 host-a\n")).toEqual([
      { name: "app-pr-42", location: "host-a", extra: [] },
    ])
  })

  test("parses a pipe table from the server", () => {
    expect(
      parseList(`NAME | LOCATION |
headscale-in1 | dev-x86-64-linux-03 |
kolu-bot | dev-x86-64-linux-08 |
`),
    ).toEqual([
      { name: "headscale-in1", location: "dev-x86-64-linux-03", extra: [] },
      { name: "kolu-bot", location: "dev-x86-64-linux-08", extra: [] },
    ])
  })

  test("skips ascii table rules", () => {
    expect(
      parseList(`+------+----------+
| NAME | LOCATION |
+------+----------+
| box  | host-a   |
+------+----------+
`),
    ).toEqual([{ name: "box", location: "host-a", extra: [] }])
  })

  test("treats an empty listing as no rows", () => {
    expect(parseList("\n")).toEqual([])
  })

  test("keeps a box literally named name", () => {
    expect(parseList("NAME LOCATION\nname host-a\n")).toEqual([
      { name: "name", location: "host-a", extra: [] },
    ])
  })

  test("keeps leftover columns", () => {
    expect(parseList("box host extra bits")).toEqual([
      { name: "box", location: "host", extra: ["extra", "bits"] },
    ])
  })
})

describe("namesFromList", () => {
  test("returns valid unique names in order", () => {
    expect(
      namesFromList(`NAME | LOCATION |
headscale-in1 | dev-x86-64-linux-03 |
kolu-bot | dev-x86-64-linux-08 |
headscale-in1 | dev-x86-64-linux-03 |
`),
    ).toEqual(["headscale-in1", "kolu-bot"])
  })

  test("empty listing means prune everything", () => {
    expect(namesFromList("\n")).toEqual([])
    expect(namesFromList("")).toEqual([])
  })

  test("drops invalid names and refuses to parse leftover junk", () => {
    expect(namesFromList("foo/bar host\n!!! nope\n")).toBeUndefined()
  })

  test("keeps a mix that still has at least one valid name", () => {
    expect(namesFromList("ok-box host\nfoo/bar host\n")).toEqual(["ok-box"])
  })
})
