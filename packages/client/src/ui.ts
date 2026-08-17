import {
  bold as otBold,
  dim as otDim,
  fg,
  t,
  type StyledText,
} from "@opentui/core"
import type { TextChunk } from "@opentui/core"
import { TextAttributes } from "@opentui/core"
import { CliError } from "effect/unstable/cli"
import { AuthError, CommandFailed, MissingTool, UsageError } from "./errors.ts"
import type { ListRow } from "./list.ts"

const gold = fg("#e8a317")
const ok = fg("#6fcf8e")
const err = fg("#e8695b")
const muted = fg("#c9bda6")
const ink = fg("#f3ead8")

const SPINNER = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"] as const

export function colorEnabled(stream: NodeJS.WriteStream = process.stderr): boolean {
  if (process.env["NO_COLOR"] !== undefined) return false
  if (process.env["TERM"] === "dumb") return false
  if (process.env["FORCE_COLOR"] !== undefined) return true
  return stream.isTTY === true
}

export function plainText(input: StyledText | string): string {
  if (typeof input === "string") return input.replace(/\x1b\[[0-9;]*m/g, "")
  return input.chunks.map((chunk) => chunk.text).join("")
}

function rgb8(value: number): number {
  if (!Number.isFinite(value)) return 0
  if (value <= 1) return Math.max(0, Math.min(255, Math.round(value * 255)))
  return Math.max(0, Math.min(255, Math.round(value)))
}

function chunkAnsi(chunk: TextChunk): string {
  const attrs = chunk.attributes ?? 0
  const seq: string[] = []
  if (chunk.fg !== undefined) {
    const [r, g, b] = chunk.fg.toInts()
    seq.push(`\x1b[38;2;${rgb8(r)};${rgb8(g)};${rgb8(b)}m`)
  }
  if ((attrs & TextAttributes.BOLD) !== 0) seq.push("\x1b[1m")
  if ((attrs & TextAttributes.DIM) !== 0) seq.push("\x1b[2m")
  if ((attrs & TextAttributes.ITALIC) !== 0) seq.push("\x1b[3m")
  if ((attrs & TextAttributes.UNDERLINE) !== 0) seq.push("\x1b[4m")
  if (seq.length === 0) return chunk.text
  return `${seq.join("")}${chunk.text}\x1b[0m`
}

export function renderStyled(
  input: StyledText | string,
  stream: NodeJS.WriteStream = process.stderr,
): string {
  if (typeof input === "string") return input
  if (!colorEnabled(stream)) return plainText(input)
  return input.chunks.map(chunkAnsi).join("")
}

const writeLine = (stream: NodeJS.WriteStream, input: StyledText | string): void => {
  stream.write(`${renderStyled(input, stream)}\n`)
}

export const printOut = (input: StyledText | string): void => {
  writeLine(process.stdout, input)
}

export const printErr = (input: StyledText | string): void => {
  writeLine(process.stderr, input)
}

export function helpText(cliName: string): StyledText {
  return t`${gold(otBold("xyne-boxes"))}  ${muted("remote Linux boxes, one SSH away")}

${ink(otBold("Usage"))}
  ${gold(cliName)} ${muted("<command>")}

${ink(otBold("Commands"))}
  ${gold("create")} ${muted("<name>")}                 Create a box
  ${gold("connect")} ${muted("<name> [ssh …]")}        SSH in; ${muted("--")} before a remote command
  ${gold("list")}                           List your boxes
  ${gold("fork")} ${muted("<source> <name>")}          Clone an existing box
  ${gold("destroy")} ${muted("<name> […]")}            Destroy one or more boxes
  ${gold("version")}                        Tool versions
  ${gold("help")}                           This screen

${ink(otBold("First time"))}
  ${muted("A browser window asks you to sign in with your Juspay Google account.")}
  ${muted("Certificates last about a week; connect again to renew.")}
`
}

export interface Spinner {
  readonly update: (message: string) => void
  readonly succeed: (message: string) => void
  readonly fail: (message: string) => void
  readonly stop: () => void
}

export function spinner(message: string): Spinner {
  const tty = colorEnabled(process.stderr)
  let current = message
  let i = 0
  let timer: ReturnType<typeof setInterval> | undefined
  let live = true

  const clearLine = (): void => {
    if (tty) process.stderr.write("\r\x1b[2K")
  }

  const paint = (kind: "spin" | "ok" | "fail", glyph: string, msg: string, newline: boolean): void => {
    const mark = kind === "ok" ? ok(glyph) : kind === "fail" ? err(glyph) : gold(glyph)
    const rendered = renderStyled(t`${mark} ${ink(msg)}`, process.stderr)
    if (tty) {
      process.stderr.write(`\r\x1b[2K${rendered}${newline ? "\n" : ""}`)
    } else if (newline) {
      process.stderr.write(`${rendered}\n`)
    }
  }

  if (tty) {
    paint("spin", SPINNER[0]!, current, false)
    timer = setInterval(() => {
      if (!live) return
      i = (i + 1) % SPINNER.length
      paint("spin", SPINNER[i]!, current, false)
    }, 80)
  }

  const stop = (): void => {
    live = false
    if (timer !== undefined) {
      clearInterval(timer)
      timer = undefined
    }
    clearLine()
  }

  return {
    update(next: string) {
      current = next
    },
    succeed(next: string) {
      stop()
      paint("ok", "✓", next, true)
    },
    fail(next: string) {
      stop()
      paint("fail", "✗", next, true)
    },
    stop,
  }
}

export function printList(rows: ReadonlyArray<ListRow>, raw: string): void {
  if (rows.length === 0) {
    const leftover = raw.trim()
    if (leftover !== "") printOut(leftover)
    else printOut(t`${muted("No boxes.")}`)
    return
  }

  const nameW = Math.max(4, ...rows.map((row) => row.name.length))
  printOut(t`${muted("NAME".padEnd(nameW))}  ${muted("LOCATION")}`)
  for (const row of rows) {
    const loc = row.location ?? ""
    const extra = row.extra.length > 0 ? ` ${row.extra.join(" ")}` : ""
    printOut(t`${gold(otBold(row.name.padEnd(nameW)))}  ${ink(loc)}${muted(extra)}`)
  }
}

export function printVersion(rows: ReadonlyArray<readonly [string, string]>): void {
  const labelW = Math.max(...rows.map(([label]) => label.length))
  for (const [label, value] of rows) {
    printOut(t`${muted(label.padEnd(labelW))}  ${ink(value)}`)
  }
}

export function printReady(cliName: string, name: string): void {
  printErr(t`${ok("✓")} ${ink("Ready")}  ${gold(otBold(name))}`)
  printErr(t`  ${muted("Connect")}  ${gold(`${cliName} connect ${name}`)}`)
}

export function printDestroyed(names: ReadonlyArray<string>): void {
  printErr(t`${ok("✓")} ${ink("Destroyed")}  ${gold(names.join(", "))}`)
}

export function printConnecting(name: string, remote: ReadonlyArray<string>): void {
  if (remote.length > 0) {
    printErr(t`${gold("→")} ${ink("Running on")} ${gold(otBold(name))} ${muted(remote.join(" "))}`)
    return
  }
  printErr(t`${gold("→")} ${ink("Connecting to")} ${gold(otBold(name))}`)
}

export function printError(error: unknown): number {
  if (CliError.isCliError(error)) {
    if (error._tag === "ShowHelp") {
      return error.errors.length > 0 ? 1 : 0
    }
    printErr(t`${err("✗")} ${ink(error.message)}`)
    return 1
  }
  if (error instanceof UsageError) {
    printErr(t`${err("✗")} ${ink(error.message)}`)
    printErr(t`  ${muted("Try")} ${gold("help")}`)
    return 1
  }
  if (error instanceof MissingTool) {
    printErr(t`${err("✗")} ${gold(error.tool)} ${ink("is not on PATH")}`)
    printErr(t`  ${muted(error.hint)}`)
    return 1
  }
  if (error instanceof AuthError) {
    printErr(t`${err("✗")} ${ink(error.message)}`)
    if (error.hint !== undefined) printErr(t`  ${muted(error.hint)}`)
    return 1
  }
  if (error instanceof CommandFailed) {
    const argv = [error.command, ...error.args].join(" ")
    printErr(t`${err("✗")} ${ink("Command failed")}  ${muted(`exit ${error.exitCode}`)}`)
    printErr(t`  ${otDim(argv)}`)
    if (error.command === "ssh") {
      printErr(
        t`  ${muted("If this is a certificate expiry, run")} ${gold("connect")} ${muted("and sign in again.")}`,
      )
    }
    return error.exitCode === 0 ? 1 : error.exitCode
  }

  const message =
    error instanceof Error
      ? error.message
      : typeof error === "object" && error !== null && "message" in error
        ? String((error as { message: unknown }).message)
        : String(error)
  printErr(t`${err("✗")} ${ink(message)}`)
  return 1
}
