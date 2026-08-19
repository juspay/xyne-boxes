#!/usr/bin/env bun
import { NodeRuntime, NodeServices } from "@effect/platform-node"
import { Effect, Logger, References } from "effect"
import { CliError, Command } from "effect/unstable/cli"
import { versionString } from "./build-info.ts"
import { root } from "./commands/root.ts"
import { prepareArgv } from "./commands/shared.ts"
import { printError } from "./ui.ts"
import { takeVerbose } from "./verbose.ts"

export const main = (
  raw: ReadonlyArray<string> = process.argv.slice(2),
): Effect.Effect<number> => {
  const { argv, verbose } = takeVerbose(raw)
  if (verbose) process.env["XYNE_VERBOSE"] = "1"
  return Command.runWith(root, { version: versionString() })(prepareArgv(argv)).pipe(
    Effect.as(0),
    // Effect CLI already printed usage/help; we only map the exit code.
    Effect.catchIf(CliError.isCliError, (error) =>
      Effect.succeed(error._tag === "ShowHelp" && error.errors.length === 0 ? 0 : 1),
    ),
    Effect.match({
      onFailure: (error) => printError(error),
      onSuccess: (code) => code,
    }),
    Effect.scoped,
    Effect.provide(NodeServices.layer),
    Effect.provide(Logger.layer([Logger.consolePretty({ stderr: true })])),
    Effect.provideService(References.MinimumLogLevel, verbose ? "Debug" : "Error"),
  )
}

if (import.meta.main) {
  NodeRuntime.runMain(
    main().pipe(Effect.flatMap((code) => Effect.sync(() => process.exit(code)))),
    { disableErrorReporting: true },
  )
}
