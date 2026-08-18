/** Pull `--verbose` / `-v` off our argv. Leave `-v` after `--` for ssh. */

export const takeVerbose = (
  argv: ReadonlyArray<string>,
  env: NodeJS.ProcessEnv = process.env,
): { argv: string[]; verbose: boolean } => {
  const fromEnv = env["XYNE_VERBOSE"] === "1" || env["XYNE_VERBOSE"] === "true"
  const out: string[] = []
  let verbose = fromEnv
  let passthrough = false
  for (const arg of argv) {
    if (!passthrough && arg === "--") {
      passthrough = true
      out.push(arg)
      continue
    }
    if (!passthrough && (arg === "--verbose" || arg === "-v")) {
      verbose = true
      continue
    }
    out.push(arg)
  }
  return { argv: out, verbose }
}
