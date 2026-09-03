import { invalidBoxName } from "./names.ts"

export interface ListRow {
  readonly name: string
  readonly location: string | undefined
  readonly extra: ReadonlyArray<string>
}

const isSeparator = (line: string): boolean => {
  const compact = line.replace(/\s/g, "")
  return /^[-+|:=─━]+$/.test(compact)
}

const columnsOf = (line: string): string[] => {
  if (line.includes("|")) {
    return line
      .split("|")
      .map((col) => col.trim())
      .filter((col) => col !== "")
  }
  return line.trim().split(/\s+/).filter((col) => col !== "")
}

export function parseList(raw: string): ReadonlyArray<ListRow> {
  const rows: ListRow[] = []
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (trimmed === "" || isSeparator(trimmed)) continue
    const cols = columnsOf(trimmed)
    const name = cols[0]
    if (name === undefined) continue
    if (/^name$/i.test(name) && /^location$/i.test(cols[1] ?? "")) continue
    rows.push({
      name,
      location: cols[1],
      extra: cols.slice(2),
    })
  }
  return rows
}

/** Names to write as local `ssh_config`. `undefined` if the listing did not parse. */
export function namesFromList(raw: string): ReadonlyArray<string> | undefined {
  const names: string[] = []
  const seen = new Set<string>()
  for (const row of parseList(raw)) {
    if (invalidBoxName(row.name) !== undefined || seen.has(row.name)) continue
    seen.add(row.name)
    names.push(row.name)
  }
  if (names.length === 0 && raw.trim() !== "") return undefined
  return names
}
