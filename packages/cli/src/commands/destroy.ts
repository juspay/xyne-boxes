import { Effect } from "effect"
import { Argument, Command } from "effect/unstable/cli"
import { printDestroyed, printOut } from "../ui.ts"
import { makeClient, withSpinner } from "./shared.ts"

export const destroy = Command.make(
  "destroy",
  {
    names: Argument.string("name").pipe(
      Argument.withDescription("One or more box names"),
      Argument.variadic({ min: 1 }),
    ),
  },
  ({ names }) =>
    Effect.gen(function* () {
      const client = yield* makeClient()
      yield* withSpinner(
        `Destroying ${names.join(", ")}`,
        "Could not destroy",
        (hooks) => client.destroy(names, hooks),
        (listed) => {
          if (listed.trim() !== "") printOut(listed.trimEnd())
          printDestroyed(names)
        },
      )
    }),
).pipe(Command.withDescription("Destroy one or more boxes"))
