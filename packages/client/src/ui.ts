import {
  bold,
  dim,
  fg,
  t,
  type StyledText,
} from "@opentui/core"
import type { TextChunk } from "@opentui/core"
import { TextAttributes } from "@opentui/core"
import { AuthError, CommandFailed, MissingTool, UsageError } from "./errors.ts"
import type { ListRow } from "./list.ts"

const ACCENT = "#e8a317"
const OK = "#6fcf8e"
const ERR = "#e8695b"
const MUTED = "#c9bda6"
const FG = "#f3ead8"

const gold = fg(ACCENT)
const ok = fg(OK)
const err = fg(ERR)
const muted = fg(MUTED)
const ink = fg(FG)

const SPINNER = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"] as const

export function colorEnabled(stream: NodeJS.WriteStream = process.stderr): boolean {
  if (process.env["NO_COLOR"] !== undefined) return false
  if (process.env["TERM"] === "dumb") return false
  if (process.env["FORCE_COLOR"] !== undefined) return true
  return stream.isTTY === true
}

export function plainText(input: StyledText | string): string {
  if (typeof input === "string") return input
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

const writeLine = (
  stream: NodeJS.WriteStream,
  input: StyledText | string,
): void => {
  stream.write(`${renderStyled(input, stream)}\n`)
}

export const printOut = (input: StyledText | string): void => {
  writeLine(process.stdout, input)
}

export const printErr = (input: StyledText | string): void => {
  writeLine(process.stderr, input)
}

export function helpText(cliName: string): StyledText {
  return t`${gold(bold("xyne-boxes"))}  ${muted("remote Linux boxes, one SSH away")}

${ink(bold("Usage"))}
  ${gold(cliName)} ${muted("<command>")}

${ink(bold("Commands"))}
  ${gold("create")} ${muted("<name>")}                 Create a box
  ${gold("connect")} ${muted("<name> [ssh …]")}        SSH in; ${muted("--")} before a remote command
  ${gold("list")}                           List your boxes
  ${gold("fork")} ${muted("<source> <name>")}          Clone an existing box
  ${gold("destroy")} ${muted("<name> […]")}            Destroy one or more boxes
  ${gold("version")}                        Tool versions
  ${gold("help")}                           This screen

${ink(bold("First time"))}
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
      i = (i + 1) % SPINNER.length
      paint("spin", SPINNER[i]!, current, false)
    }, 80)
  } else {
    paint("spin", "→", current, true)
  }

  const stop = (): void => {
    if (timer !== undefined) {
      clearInterval(timer)
      timer = undefined
    }
  }

  return {
    update(next: string) {
      current = next
      if (!tty) paint("spin", "→", current, true)
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
    if (leftover !== "") printOut(t`${ink(leftover)}`)
    else printOut(t`${muted("No boxes.")}`)
    return
  }

  const nameW = Math.max(4, ...rows.map((row) => row.name.length))
  printOut(t`${muted("NAME".padEnd(nameW))}  ${muted("LOCATION")}`)
  for (const row of rows) {
    const loc = row.location ?? ""
    const extra = row.extra.length > 0 ? ` ${row.extra.join(" ")}` : ""
    printOut(t`${gold(bold(row.name.padEnd(nameW)))}  ${ink(loc)}${muted(extra)}`)
  }
}

export function printVersion(rows: ReadonlyArray<readonly [string, string]>): void {
  const labelW = Math.max(...rows.map(([label]) => label.length))
  for (const [label, value] of rows) {
    printOut(t`${muted(label.padEnd(labelW))}  ${ink(value)}`)
  }
}

export function printReady(cliName: string, name: string): void {
  printErr(t`${ok("✓")} ${ink("Ready")}  ${gold(bold(name))}`)
  printErr(t`  ${muted("Connect")}  ${gold(`${cliName} connect ${name}`)}`)
}

export function printDestroyed(names: ReadonlyArray<string>): void {
  printErr(t`${ok("✓")} ${ink("Destroyed")}  ${gold(names.join(", "))}`)
}

export function printConnecting(name: string, remote: ReadonlyArray<string>): void {
  if (remote.length > 0) {
    printErr(t`${gold("→")} ${ink("Running on")} ${gold(bold(name))} ${muted(remote.join(" "))}`)
    return
  }
  printErr(t`${gold("→")} ${ink("Connecting to")} ${gold(bold(name))}`)
}

export function printError(error: unknown): number {
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
    printErr(t`  ${dim(argv)}`)
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


