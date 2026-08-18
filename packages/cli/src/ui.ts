import {
  BorderChars,
  bold as otBold,
  fg,
  isStyledText,
  link,
  StyledText,
  t,
} from "@opentui/core"
import type { TextChunk } from "@opentui/core"
import { TextAttributes } from "@opentui/core"
import { CliError } from "effect/unstable/cli"
import {
  AuthError,
  CommandFailed,
  MissingTool,
  SITE_URL,
  TAILSCALE_UP,
  UsageError,
  type ListRow,
} from "xyne-boxes"

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
  ${gold("create")}   ${muted("<name>")}                 Create a box
  ${gold("connect")}  ${muted("<name> [ssh …]")}        SSH in; ${muted("--")} before a remote command
  ${gold("list")}                            List your boxes
  ${gold("fork")}     ${muted("<source> <name>")}          Clone an existing box
  ${gold("destroy")}  ${muted("<name> […]")}            Destroy one or more boxes
  ${gold("version")}                         Tool versions and commit
  ${gold("help")}                            This screen

${ink(otBold("Options"))}
  ${gold("-v")}, ${gold("--verbose")}           Debug logs on stderr (or XYNE_VERBOSE=1)
  ${gold("--version")}                      Same as ${gold("version")}

${ink(otBold("First time"))}
  ${muted("A browser window asks you to sign in with your Juspay Google account.")}
  ${muted("Certificates last about a week; connect again to renew.")}
`
}

export interface Spinner {
  readonly update: (message: string) => void
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

  const paint = (kind: "spin" | "fail", glyph: string, msg: string, newline: boolean): void => {
    const mark = kind === "fail" ? err(glyph) : gold(glyph)
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

const tagOf = (error: unknown): string | undefined => {
  if (typeof error !== "object" || error === null || !("_tag" in error)) return undefined
  const tag = (error as { _tag: unknown })._tag
  return typeof tag === "string" ? tag : undefined
}

const field = (error: unknown, name: string): unknown => {
  if (typeof error !== "object" || error === null) return undefined
  return (error as Record<string, unknown>)[name]
}

const asString = (value: unknown): string | undefined =>
  typeof value === "string" && value !== "" ? value : undefined

export type ErrorView = {
  readonly title: string
  readonly headline: string
  readonly detail?: string
  readonly exitCode: number
}

const wrapLine = (text: string, width: number): string[] => {
  if (width < 8) return [text]
  if (text.length <= width) return [text === "" ? " " : text]
  const out: string[] = []
  let rest = text
  while (rest.length > width) {
    let cut = rest.lastIndexOf(" ", width)
    if (cut < Math.floor(width / 2)) cut = width
    out.push(rest.slice(0, cut).trimEnd())
    rest = rest.slice(cut).trimStart()
  }
  if (rest !== "") out.push(rest)
  return out
}

const asChunks = (input: StyledText | TextChunk | string): TextChunk[] => {
  if (typeof input === "string") return input === "" ? [] : [{ __isChunk: true, text: input }]
  if (isStyledText(input)) return input.chunks
  return [input]
}

const concatStyled = (...parts: Array<StyledText | TextChunk | string>): StyledText =>
  new StyledText(parts.flatMap(asChunks))

const styleBody = (line: string): StyledText => {
  const command = /^(\s{2,})(\S.*)$/.exec(line)
  if (command !== null) {
    return t`${command[1] ?? ""}${gold(command[2] ?? "")}`
  }
  const url = /^(.*?)(https:\/\/\S+)(.*)$/.exec(line)
  if (url !== null && url[2] !== undefined) {
    const href = url[2]
    return t`${muted(url[1] ?? "")}${link(href)(href)}${muted(url[3] ?? "")}`
  }
  return t`${muted(line)}`
}

/** OpenTUI rounded box. Styled-text only — no CliRenderer. */
export function errorWidget(view: ErrorView, columns = process.stderr.columns ?? 80): StyledText[] {
  const chars = BorderChars.rounded
  const raw = [view.headline, ...(view.detail ?? "").split("\n")]
  const longest = raw.reduce((n, line) => Math.max(n, line.length), view.title.length + 4)
  const inner = Math.max(24, Math.min(columns - 2, Math.max(longest + 2, 48)))
  const body = inner - 2
  const topPad = Math.max(0, inner - view.title.length - 3)
  const lines: StyledText[] = [
    t`${err(`${chars.topLeft}${chars.horizontal} ${view.title} ${chars.horizontal.repeat(topPad)}${chars.topRight}`)}`,
  ]
  const push = (styled: StyledText, pad: number): void => {
    lines.push(
      concatStyled(
        err(chars.vertical),
        " ",
        styled,
        " ".repeat(Math.max(0, pad)),
        " ",
        err(chars.vertical),
      ),
    )
  }
  for (const piece of wrapLine(view.headline, body)) {
    push(t`${ink(otBold(piece))}`, body - piece.length)
  }
  if (view.detail !== undefined && view.detail !== "") {
    push(t`${" ".repeat(body)}`, 0)
    for (const rawLine of view.detail.split("\n")) {
      if (rawLine === "") {
        push(t`${" ".repeat(body)}`, 0)
        continue
      }
      for (const piece of wrapLine(rawLine, body)) {
        push(styleBody(piece), body - piece.length)
      }
    }
  }
  lines.push(t`${err(`${chars.bottomLeft}${chars.horizontal.repeat(inner)}${chars.bottomRight}`)}`)
  return lines
}

const commandFailedDetail = (argv: string | undefined, last: string): string => {
  const said = last !== "" ? `Command said: ${last}` : undefined
  const ran = argv !== undefined ? `Ran:\n  ${argv}` : undefined
  if (/connection refused|no route|timed out|network is unreachable|could not resolve/i.test(last)) {
    return [
      said,
      ran,
      "That host is on the Juspay Tailscale network.",
      "",
      `  ${TAILSCALE_UP}`,
      "",
      `No Tailscale yet? ${SITE_URL}`,
    ]
      .filter((line) => line !== undefined)
      .join("\n")
  }
  if (/permission denied|certificate/i.test(last)) {
    return [
      said,
      ran,
      "The SSH certificate is missing or expired.",
      "",
      "  xyne-boxes connect <name>",
    ]
      .filter((line) => line !== undefined)
      .join("\n")
  }
  return [said, ran].filter((line) => line !== undefined).join("\n\n")
}

/** Structured error text so tests (and bun-compiled binaries) do not rely on instanceof. */
export function describeError(error: unknown): ErrorView {
  if (CliError.isCliError(error)) {
    if (error._tag === "ShowHelp") {
      if (error.errors.length === 0) {
        return { title: "help", headline: error.message, exitCode: 0 }
      }
      const [first, ...rest] = error.errors
      return {
        title: "usage",
        headline: first?.message ?? error.message,
        detail:
          rest.length > 0
            ? rest.map((item) => item.message).join("\n")
            : "xyne-boxes <command> — or xyne-boxes help",
        exitCode: 1,
      }
    }
    return { title: "error", headline: error.message, exitCode: 1 }
  }

  const tag = tagOf(error)
  if (error instanceof UsageError || tag === "UsageError") {
    return {
      title: "usage",
      headline: asString(field(error, "message")) ?? "Invalid usage",
      detail: asString(field(error, "hint")),
      exitCode: 1,
    }
  }
  if (error instanceof MissingTool || tag === "MissingTool") {
    const tool = asString(field(error, "tool")) ?? "tool"
    return {
      title: "missing",
      headline: `${tool} is not on PATH.`,
      detail: asString(field(error, "hint")),
      exitCode: 1,
    }
  }
  if (error instanceof AuthError || tag === "AuthError") {
    return {
      title: "auth",
      headline: asString(field(error, "message")) ?? "Authentication failed",
      detail: asString(field(error, "hint")),
      exitCode: 1,
    }
  }
  if (error instanceof CommandFailed || tag === "CommandFailed") {
    const stderr = asString(field(error, "stderr"))
    const last =
      stderr
        ?.trim()
        .split(/\r?\n/)
        .filter((line) => line.trim() !== "")
        .at(-1) ?? ""
    const exitCodeRaw = field(error, "exitCode")
    const exitCode = typeof exitCodeRaw === "number" && exitCodeRaw !== 0 ? exitCodeRaw : 1
    const command = asString(field(error, "command"))
    const args = field(error, "args")
    const argv =
      command !== undefined && Array.isArray(args)
        ? [command, ...args.map(String)].join(" ")
        : command
    return {
      title: "command",
      headline: `${command ?? "command"} exited ${exitCode}.`,
      detail: commandFailedDetail(argv, last),
      exitCode,
    }
  }

  const message =
    error instanceof Error
      ? error.message
      : asString(field(error, "message")) ?? String(error)
  return { title: "error", headline: message, exitCode: 1 }
}

export function printError(error: unknown): number {
  if (CliError.isCliError(error) && error._tag === "ShowHelp" && error.errors.length === 0) {
    return 0
  }
  const view = describeError(error)
  for (const line of errorWidget(view)) printErr(line)
  return view.exitCode
}
