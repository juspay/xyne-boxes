const SAFE = /^[A-Za-z0-9_./:@%+=,-]+$/

/** POSIX-shell single-argument quoting, matching bash `printf %q` for typical paths. */
export function shellQuote(value: string): string {
  if (value === "") return "''"
  if (SAFE.test(value)) return value
  return `'${value.replace(/'/g, `'\\''`)}'`
}

export function shellQuoteAll(args: ReadonlyArray<string>): string {
  return args.map(shellQuote).join(" ")
}
