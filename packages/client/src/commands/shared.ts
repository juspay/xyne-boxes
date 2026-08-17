import { basename } from "node:path"
import { Effect } from "effect"
import { Client, type ClientError, type ClientReq, type LaunchHooks, type LaunchResult } from "../client.ts"
import { printReady, spinner } from "../ui.ts"

export const cliName = (): string => {
  const fromEnv = process.env["XYNE_CLI_NAME"]
  if (fromEnv !== undefined && fromEnv !== "") return fromEnv
  const argv0 = process.argv[1]
  if (argv0 === undefined || argv0 === "") return "xyne-boxes"
  const base = basename(argv0)
  return base === "cli.ts" ? "xyne-boxes" : base
}

/** ssh flags after `connect <name>` look like CLI options; park them after `--`. */
export const prepareArgv = (argv: ReadonlyArray<string>): ReadonlyArray<string> => {
  const [command, name, ...rest] = argv
  if (command !== "connect" || name === undefined) return argv
  if (name === "--help" || name === "-h" || name === "--") return argv
  if (rest[0] === "--") return argv
  return [command, name, "--", ...rest]
}

export const makeClient = (): Effect.Effect<Client> => Client.make()

export const withSpinner = <A, E, R>(
  start: string,
  fail: string,
  run: (hooks: LaunchHooks) => Effect.Effect<A, E, R>,
  onOk: (value: A) => void,
  waiting: string = start,
): Effect.Effect<void, E, R> => {
  const spin = spinner(start)
  return run({
    onSigning: () => spin.update("Signing SSH key — a browser may open"),
    onCreating: () => spin.update(start),
    onWaiting: () => spin.update(waiting),
  }).pipe(
    Effect.tapError(() => Effect.sync(() => spin.fail(fail))),
    Effect.map((value) => {
      spin.stop()
      onOk(value)
    }),
  )
}

export const launchAndAnnounce = (
  start: string,
  fail: string,
  waiting: string,
  run: (hooks: LaunchHooks) => Effect.Effect<LaunchResult, ClientError, ClientReq>,
): Effect.Effect<void, ClientError, ClientReq> =>
  withSpinner(start, fail, run, (result) => printReady(cliName(), result.name), waiting)
