#!/usr/bin/env bun
import { NodeRuntime, NodeServices } from "@effect/platform-node"
import { Effect } from "effect"
import { CliError, Command } from "effect/unstable/cli"
import { versionString } from "./build-info.ts"
import { root } from "./commands/root.ts"
import { prepareArgv } from "./commands/shared.ts"
import { printError } from "./ui.ts"

export const main = (
  argv: ReadonlyArray<string> = process.argv.slice(2),
): Effect.Effect<number> =>
  Command.runWith(root, { version: versionString() })(prepareArgv(argv)).pipe(
    Effect.as(0),
    Effect.catchIf(CliError.isCliError, (error) => Effect.sync(() => printError(error))),
    Effect.match({
      onFailure: (error) => printError(error),
      onSuccess: (code) => code,
    }),
    Effect.scoped,
    Effect.provide(NodeServices.layer),
  )

if (import.meta.main) {
  NodeRuntime.runMain(
    main().pipe(Effect.flatMap((code) => Effect.sync(() => process.exit(code)))),
    { disableErrorReporting: true },
  )
}
