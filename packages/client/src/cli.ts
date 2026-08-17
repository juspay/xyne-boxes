#!/usr/bin/env bun
import { spawnSync } from "node:child_process"
import { basename } from "node:path"
import { NodeRuntime, NodeServices } from "@effect/platform-node"
import { Effect } from "effect"
import { ChildProcess } from "effect/unstable/process"
import pkg from "../package.json" with { type: "json" }
import { Client } from "./client.ts"
import { parseConnectArgs } from "./connect-args.ts"
import { UsageError } from "./errors.ts"
import { parseList } from "./list.ts"
import { sshArgv } from "./ssh.ts"
import {
  helpText,
  printConnecting,
  printDestroyed,
  printErr,
  printError,
  printList,
  printOut,
  printReady,
  printVersion,
  spinner,
} from "./ui.ts"

export const usage = (cliName: string): string => helpText(cliName).chunks.map((c) => c.text).join("")

const cliNameOf = (argv0: string | undefined): string => {
  const fromEnv = process.env["XYNE_CLI_NAME"]
  if (fromEnv !== undefined && fromEnv !== "") return fromEnv
  if (argv0 === undefined || argv0 === "") return "xyne-boxes"
  const base = basename(argv0)
  return base === "cli.ts" ? "xyne-boxes" : base
}

const firstLine = (text: string, fallback: string): string => {
  const line = text.trim().split("\n")[0]
  return line !== undefined && line !== "" ? line : fallback
}

const toolVersion = (command: string, args: ReadonlyArray<string>): string => {
  const result = spawnSync(command, [...args], { encoding: "utf-8" })
  const text = `${result.stderr}${result.stdout}`
  if (result.error !== undefined || result.status === null) {
    return "not found"
  }
  return firstLine(text, "unknown")
}

const dispatch = (
  cliName: string,
  argv: ReadonlyArray<string>,
): Effect.Effect<number> =>
  Effect.gen(function* () {
    const client = yield* Client.make()
    const [command, ...rest] = argv

    switch (command) {
      case undefined:
      case "help":
      case "-h":
      case "--help": {
        printErr(helpText(cliName))
        return command === undefined ? 1 : 0
      }

      case "create": {
        const name = rest[0]
        if (name === undefined || rest.length !== 1) {
          return printError(new UsageError({ message: `Usage: ${cliName} create <name>` }))
        }
        const spin = spinner(`Creating ${name}`)
        const result = yield* client
          .create(name, {
            onSigning: () => spin.update("Signing SSH key — a browser may open"),
            onCreating: () => spin.update(`Creating ${name}`),
            onWaiting: () => spin.update(`Waiting for ${name} to be ready`),
          })
          .pipe(Effect.tapError(() => Effect.sync(() => spin.fail(`Could not create ${name}`))))
        spin.stop()
        printReady(cliName, result.name)
        return 0
      }

      case "fork": {
        const source = rest[0]
        const name = rest[1]
        if (source === undefined || name === undefined || rest.length !== 2) {
          return printError(
            new UsageError({ message: `Usage: ${cliName} fork <source> <name>` }),
          )
        }
        const spin = spinner(`Forking ${source} → ${name}`)
        const result = yield* client
          .fork(source, name, {
            onSigning: () => spin.update("Signing SSH key — a browser may open"),
            onCreating: () => spin.update(`Forking ${source} → ${name}`),
            onWaiting: () => spin.update(`Waiting for ${name} to be ready`),
          })
          .pipe(Effect.tapError(() => Effect.sync(() => spin.fail(`Could not fork ${name}`))))
        spin.stop()
        printReady(cliName, result.name)
        return 0
      }

      case "connect": {
        const parsed = parseConnectArgs(rest, cliName)
        if (parsed instanceof UsageError) {
          return printError(parsed)
        }
        const spin = spinner("Preparing SSH")
        const config = yield* client
          .sshConfig(parsed.name, {
            onSigning: () => spin.update("Signing SSH key — a browser may open"),
          })
          .pipe(Effect.tapError(() => Effect.sync(() => spin.fail("Could not prepare SSH"))))
        spin.stop()
        printConnecting(parsed.name, parsed.remoteCmd)
        const args = sshArgv(config, {
          sshArgs: parsed.sshArgs,
          remoteCmd: parsed.remoteCmd,
        })
        const handle = yield* ChildProcess.make("ssh", args, {
          stdin: "inherit",
          stdout: "inherit",
          stderr: "inherit",
          extendEnv: true,
        })
        return Number(yield* handle.exitCode)
      }

      case "destroy": {
        if (rest.length === 0) {
          return printError(
            new UsageError({ message: `Usage: ${cliName} destroy <name> [name ...]` }),
          )
        }
        const spin = spinner(`Destroying ${rest.join(", ")}`)
        const listed = yield* client
          .destroy(rest, {
            onSigning: () => spin.update("Signing SSH key — a browser may open"),
          })
          .pipe(Effect.tapError(() => Effect.sync(() => spin.fail("Could not destroy"))))
        spin.stop()
        if (listed.trim() !== "") printOut(listed.trimEnd())
        printDestroyed(rest)
        return 0
      }

      case "list": {
        const spin = spinner("Listing boxes")
        const listed = yield* client
          .list({
            onSigning: () => spin.update("Signing SSH key — a browser may open"),
          })
          .pipe(Effect.tapError(() => Effect.sync(() => spin.fail("Could not list boxes"))))
        spin.stop()
        printList(parseList(listed), listed)
        return 0
      }

      case "version":
      case "-V":
      case "--version": {
        printVersion([
          ["xyne-boxes", pkg.version],
          ["bun", Bun.version],
          ["ssh", toolVersion("ssh", ["-V"])],
          ["step", toolVersion("step", ["version"])],
        ])
        return 0
      }

      default: {
        printErr(helpText(cliName))
        return 1
      }
    }
  }).pipe(
    Effect.scoped,
    Effect.provide(NodeServices.layer),
    Effect.match({
      onFailure: (error) => printError(error),
      onSuccess: (code) => code,
    }),
  )

export const main = (
  argv: ReadonlyArray<string> = process.argv.slice(1),
): Effect.Effect<number> => {
  const [argv0, ...rest] = argv
  return dispatch(cliNameOf(argv0), rest)
}

if (import.meta.main) {
  NodeRuntime.runMain(
    main().pipe(Effect.flatMap((code) => Effect.sync(() => process.exit(code)))),
    { disableErrorReporting: true },
  )
}
