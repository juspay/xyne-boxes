import { Effect } from "effect"
import { Command } from "effect/unstable/cli"
import { parseList } from "../list.ts"
import { printList } from "../ui.ts"
import { makeClient } from "./shared.ts"

export const list = Command.make("list", {}, () =>
  Effect.gen(function* () {
    const client = yield* makeClient()
    const listed = yield* client.list()
    printList(parseList(listed), listed)
  }),
).pipe(Command.withDescription("List your boxes"))
