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
