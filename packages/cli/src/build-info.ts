import { BAKED_COMMIT } from "./commit.ts"
import pkg from "../package.json" with { type: "json" }

const placeholder = (value: string): boolean =>
  value === "" || value === "__XYNE_COMMIT__" || value === "unknown"

export const packageVersion: string = pkg.version

export const commitHash = (): string | undefined => {
  const baked = BAKED_COMMIT.trim()
  if (!placeholder(baked)) return baked
  const env = process.env["XYNE_COMMIT"]?.trim() ?? ""
  if (!placeholder(env)) return env
  return undefined
}

export const commitLabel = (): string => commitHash() ?? "unknown"

export const versionString = (): string => {
  const commit = commitHash()
  return commit === undefined ? packageVersion : `${packageVersion} (${commit})`
}
