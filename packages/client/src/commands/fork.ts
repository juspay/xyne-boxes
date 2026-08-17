import { Effect } from "effect"
import { Argument, Command } from "effect/unstable/cli"
import { launchAndAnnounce, makeClient } from "./shared.ts"

export const fork = Command.make(
  "fork",
  {
    source: Argument.string("source").pipe(Argument.withDescription("Box to clone")),
    name: Argument.string("name").pipe(Argument.withDescription("New box name")),
  },
  ({ source, name }) =>
    Effect.gen(function* () {
      const client = yield* makeClient()
      yield* launchAndAnnounce(
        `Forking ${source} → ${name}`,
        `Could not fork ${name}`,
        `Waiting for ${name} to be ready`,
        (hooks) => client.fork(source, name, hooks),
      )
    }),
).pipe(Command.withDescription("Clone an existing box"))
