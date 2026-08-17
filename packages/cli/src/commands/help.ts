import { Effect } from "effect"
import { Command } from "effect/unstable/cli"
import { helpText, printErr } from "../ui.ts"
import { cliName } from "./shared.ts"

export const help = Command.make("help", {}, () =>
  Effect.sync(() => {
    printErr(helpText(cliName()))
  }),
).pipe(Command.withDescription("Show this screen"))
