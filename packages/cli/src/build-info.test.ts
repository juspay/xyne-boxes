import { afterEach, describe, expect, test } from "bun:test"
import { commitHash, commitLabel, versionString } from "./build-info.ts"
import pkg from "../package.json" with { type: "json" }

describe("commitHash", () => {
  const prev = process.env["XYNE_COMMIT"]

  afterEach(() => {
    if (prev === undefined) delete process.env["XYNE_COMMIT"]
    else process.env["XYNE_COMMIT"] = prev
  })

  test("reads XYNE_COMMIT when the baked value is empty", () => {
    process.env["XYNE_COMMIT"] = "41803636ecbde0b97f7b9b1735f5c67452dd06aa"
    expect(commitHash()).toBe("41803636ecbde0b97f7b9b1735f5c67452dd06aa")
    expect(versionString()).toBe(`${pkg.version} (41803636ecbde0b97f7b9b1735f5c67452dd06aa)`)
  })

  test("treats placeholders as unknown", () => {
    process.env["XYNE_COMMIT"] = "__XYNE_COMMIT__"
    expect(commitHash()).toBeUndefined()
    expect(commitLabel()).toBe("unknown")
    expect(versionString()).toBe(pkg.version)
  })
})
