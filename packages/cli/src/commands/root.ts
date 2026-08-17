import { Effect } from "effect"
import { Command } from "effect/unstable/cli"
import { helpText, printErr } from "../ui.ts"
import { connect } from "./connect.ts"
import { create } from "./create.ts"
import { destroy } from "./destroy.ts"
import { fork } from "./fork.ts"
import { help } from "./help.ts"
import { list } from "./list.ts"
import { cliName } from "./shared.ts"
import { version } from "./version.ts"

export const root = Command.make("xyne-boxes", {}, () =>
  Effect.sync(() => {
    printErr(helpText(cliName()))
    process.exit(1)
  }),
).pipe(
  Command.withDescription("Remote Linux boxes, one SSH away"),
  Command.withSubcommands([create, connect, list, fork, destroy, version, help]),
)
