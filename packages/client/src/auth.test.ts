import { chmodSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, test } from "bun:test"
import { NodeServices } from "@effect/platform-node"
import { Effect, Result } from "effect"
import { caUnreachableHint, ensureAuth } from "./auth.ts"
import { resolveConfig } from "./config.ts"
import { AuthError } from "./errors.ts"

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

describe("ensureAuth", () => {
  const prevStep = process.env["XYNE_STEP"]

  afterEach(() => {
    if (prevStep === undefined) delete process.env["XYNE_STEP"]
    else process.env["XYNE_STEP"] = prevStep
  })

  test("maps a failing step bootstrap to AuthError with the CA message", async () => {
    const root = mkdtempSync(join(tmpdir(), "xyne-auth-"))
    const step = join(root, "step")
    writeFileSync(
      step,
      `#!/bin/sh
case "$1 $2" in
  "version "|"version") echo test; exit 0 ;;
  "ca health") exit 1 ;;
  "ca bootstrap") echo "error downloading root certificate: connection refused" >&2; exit 1 ;;
esac
exit 1
`,
    )
    chmodSync(step, 0o755)
    const stateDir = join(root, "state")
    mkdirSync(stateDir)
    writeFileSync(join(stateDir, "key"), "dummy-key\n")
    process.env["XYNE_STEP"] = step

    const result = await Effect.runPromise(
      ensureAuth(resolveConfig({ host: "pu", useSshCa: true, stateDir })).pipe(
        Effect.result,
        Effect.provide(NodeServices.layer),
      ),
    )
    expect(Result.isFailure(result)).toBe(true)
    if (!Result.isFailure(result)) return
    const error = result.failure
    expect(error).toBeInstanceOf(AuthError)
    if (!(error instanceof AuthError)) return
    expect(error.message).toContain("error downloading root certificate")
    expect(error.hint).toContain("Is pu reachable?")
  })
})
