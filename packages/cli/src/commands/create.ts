import { Effect } from "effect"
import { Argument, Command } from "effect/unstable/cli"
import { launchAndAnnounce, makeClient } from "./shared.ts"

export const create = Command.make(
  "create",
  {
    name: Argument.string("name").pipe(Argument.withDescription("Box name")),
  },
  ({ name }) =>
    Effect.gen(function* () {
      const client = yield* makeClient()
      yield* launchAndAnnounce(
        `Creating ${name}`,
        `Could not create ${name}`,
        `Waiting for ${name} to be ready`,
        (hooks) => client.create(name, hooks),
      )
    }),
).pipe(Command.withDescription("Create a box"))
