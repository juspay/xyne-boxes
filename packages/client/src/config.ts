import { homedir } from "node:os"
import { join } from "node:path"

export const DEFAULT_HOST = "pu"
export const DEFAULT_ADMIN = "toor"
export const DEFAULT_STEP_FINGERPRINT =
  "76bb5cab2458b5331221da3cc6754102189a03184d119b26ce5284b49fa06463"
export const DEFAULT_PROVISIONER = "GoogleBrowserless"

export type AuthMode = "ssh-ca" | "host"

export interface ClientOptions {
  readonly host?: string
  readonly admin?: string
  readonly authMode?: AuthMode
  readonly stepFingerprint?: string
  readonly stepCaUrl?: string
  readonly stateDir?: string
}

interface ResolvedConfigBase {
  readonly host: string
  readonly admin: string
  readonly stateDir: string
  readonly provisioner: string
}

export type ResolvedConfig = ResolvedConfigBase &
  (
    | { readonly authMode: "host" }
    | {
        readonly authMode: "ssh-ca"
        readonly stepFingerprint: string
        readonly stepCaUrl: string
      }
  )

function envAuthMode(value: string | undefined): AuthMode | undefined {
  if (value === undefined) return undefined
  if (value === "ssh-ca" || value === "host") return value
  throw new Error(`Invalid PU_AUTH_MODE: ${value}`)
}

export function resolveConfig(options: ClientOptions = {}): ResolvedConfig {
  const host = options.host ?? process.env["PU_HOST"] ?? DEFAULT_HOST
  const authMode =
    options.authMode ??
    envAuthMode(process.env["PU_AUTH_MODE"]) ??
    "ssh-ca"
  const common = {
    host,
    admin: options.admin ?? process.env["PU_ADMIN"] ?? DEFAULT_ADMIN,
    stateDir:
      options.stateDir ?? process.env["PU_STATE_DIR"] ?? join(homedir(), ".pu-state"),
    provisioner: DEFAULT_PROVISIONER,
  }
  if (authMode === "host") return { ...common, authMode }
  return {
    ...common,
    authMode,
    stepFingerprint:
      options.stepFingerprint ??
      process.env["STEP_FINGERPRINT"] ??
      DEFAULT_STEP_FINGERPRINT,
    stepCaUrl:
      options.stepCaUrl ?? process.env["STEP_CA_URL"] ?? `https://${host}:8443`,
  }
}

export function identityPaths(stateDir: string): {
  readonly key: string
  readonly cert: string
  readonly provisionerFile: string
  readonly knownHosts: string
  readonly proxy: string
} {
  return {
    key: join(stateDir, "key"),
    cert: join(stateDir, "key-cert.pub"),
    provisionerFile: join(stateDir, "key-cert.provisioner"),
    knownHosts: join(stateDir, "known_hosts"),
    proxy: join(stateDir, "ssh-proxy"),
  }
}
