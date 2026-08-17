import { describe, expect, test } from "bun:test"
import { shellQuote, shellQuoteAll } from "./quote.ts"

describe("shellQuote", () => {
  test("leaves safe tokens alone", () => {
    expect(shellQuote("/home/u/.pu-state/ssh-proxy")).toBe("/home/u/.pu-state/ssh-proxy")
    expect(shellQuote("mybox")).toBe("mybox")
  })

  test("quotes empty and spaces", () => {
    expect(shellQuote("")).toBe("''")
    expect(shellQuote("hello world")).toBe("'hello world'")
  })

  test("escapes single quotes", () => {
    expect(shellQuote("it's")).toBe(`'it'\\''s'`)
  })

  test("joins argv", () => {
    expect(shellQuoteAll(["ssh", "-T", "pu@pu"])).toBe("ssh -T pu@pu")
  })
})
