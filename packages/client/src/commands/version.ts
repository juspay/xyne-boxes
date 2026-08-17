import { spawnSync } from "node:child_process"
import { Effect } from "effect"
import { Command } from "effect/unstable/cli"
import pkg from "../../package.json" with { type: "json" }
import { resolveStep } from "../tools.ts"
import { printVersion } from "../ui.ts"

const firstLine = (text: string, fallback: string): string => {
  const line = text.trim().split("\n")[0]
  return line !== undefined && line !== "" ? line : fallback
}

const toolVersion = (command: string, args: ReadonlyArray<string>): string => {
  const result = spawnSync(command, [...args], { encoding: "utf-8" })
  const text = `${result.stderr}${result.stdout}`
  if (result.error !== undefined || result.status === null) return "not found"
  return firstLine(text, "unknown")
}

export const version = Command.make("version", {}, () =>
  Effect.sync(() => {
    printVersion([
      ["xyne-boxes", pkg.version],
      ["bun", Bun.version],
      ["ssh", toolVersion("ssh", ["-V"])],
      ["step", toolVersion(resolveStep(), ["version"])],
    ])
  }),
).pipe(Command.withDescription("Print package, bun, ssh, and step-cli versions"))
