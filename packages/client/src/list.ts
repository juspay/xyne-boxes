export interface ListRow {
  readonly name: string
  readonly location: string | undefined
  readonly extra: ReadonlyArray<string>
}

export function parseList(raw: string): ReadonlyArray<ListRow> {
  const lines = raw
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter((line) => line.trim() !== "")

  const rows: ListRow[] = []
  for (const line of lines) {
    const cols = line.trim().split(/\s+/)
    const first = cols[0]
    if (first === undefined) continue
    if (/^name$/i.test(first)) continue
    rows.push({
      name: first,
      location: cols[1],
      extra: cols.slice(2),
    })
  }
  return rows
}
