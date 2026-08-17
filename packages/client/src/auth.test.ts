import { describe, expect, test } from "bun:test"
import { caUnreachableHint } from "./auth.ts"

describe("caUnreachableHint", () => {
  test("detects a socks/proxychains intercept", () => {
    expect(
      caUnreachableHint(
        "pu",
        "error downloading root certificate: socks connect tcp 127.0.0.1:1080->pu:8443: EOF",
      ),
    ).toContain("not via juspay-run/proxychains")
  })

  test("asks whether the CA host is reachable otherwise", () => {
    expect(caUnreachableHint("pu", "connection refused")).toContain("Is pu reachable?")
  })
})
