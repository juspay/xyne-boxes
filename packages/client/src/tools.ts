import { existsSync } from "node:fs"
import { basename, dirname, join } from "node:path"

/** `step` from XYNE_STEP, next to the compiled binary, or PATH. */
export function resolveStep(): string {
  const fromEnv = process.env["XYNE_STEP"]
  if (fromEnv !== undefined && fromEnv !== "") return fromEnv

  const exe = process.execPath
  if (!basename(exe).startsWith("bun")) {
    const sibling = join(dirname(exe), "step")
    if (existsSync(sibling)) return sibling
  }
  return "step"
}
