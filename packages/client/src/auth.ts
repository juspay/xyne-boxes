import { Effect, FileSystem } from "effect"
import type { PlatformError } from "effect/PlatformError"
import { type ResolvedConfig, identityPaths } from "./config.ts"
import { AuthError, MissingTool } from "./errors.ts"
import { lastProcessLine, runCaptured, runExitCode, type ProcessReq } from "./process.ts"
import { resolveStep } from "./tools.ts"

export interface AuthHooks {
  readonly onSigning?: () => void
}

type AuthBase = {
  /** ssh args for the control plane (`pu@host`). */
  readonly sshArgs: ReadonlyArray<string>
  /** ssh args for an instance hop (no known-hosts file). */
  readonly instanceSshArgs: ReadonlyArray<string>
}

export type Auth =
  | (AuthBase & {
      readonly useSshCa: false
    })
  | (AuthBase & {
      readonly useSshCa: true
      readonly identityFile: string
      readonly certificateFile: string
    })

const MAC_OPT =
  "MACs=hmac-sha2-256-etm@openssh.com,hmac-sha2-512-etm@openssh.com,umac-128-etm@openssh.com"

const macArgs = ["-o", MAC_OPT] as const

export const caUnreachableHint = (host: string, detail: string): string => {
  if (/socks|proxychains/i.test(detail)) {
    return `A proxy is intercepting the CA at ${host}. Run xyne-boxes directly (not via juspay-run/proxychains) on the Juspay Tailscale/headscale network.`
  }
  return `Is ${host} reachable? Join the Juspay Tailscale/headscale network, then retry.`
}

export const stepEnv = (
  config: ResolvedConfig,
): Record<string, string> => ({
  STEP_FINGERPRINT: config.stepFingerprint,
  STEP_CA_URL: config.stepCaUrl,
})

const requireStep = Effect.gen(function* () {
  const step = resolveStep()
  const code = yield* runExitCode(step, ["version"], {
    stdout: "ignore",
    stderr: "ignore",
  }).pipe(Effect.orElseSucceed(() => 127))
  if (code !== 0) {
    return yield* new MissingTool({
      tool: "step",
      hint:
        "Install with: curl -fsSL https://github.com/juspay/xyne-boxes/releases/download/nightly/install.sh | sh",
    })
  }
})

export const ensureAuth = (
  config: ResolvedConfig,
  hooks: AuthHooks = {},
): Effect.Effect<
  Auth,
  AuthError | MissingTool | PlatformError,
  ProcessReq | FileSystem.FileSystem
> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem
    yield* fs.makeDirectory(config.stateDir, { recursive: true })

    if (!config.useSshCa) {
      return {
        useSshCa: false,
        sshArgs: [...macArgs, "-o", "StrictHostKeyChecking=no"],
        instanceSshArgs: [...macArgs],
      }
    }

    yield* requireStep

    const step = resolveStep()
    const paths = identityPaths(config.stateDir)
    const env = stepEnv(config)

    if (!(yield* fs.exists(paths.key))) {
      const generated = yield* runCaptured("ssh-keygen", [
        "-q",
        "-t",
        "ed25519",
        "-N",
        "",
        "-f",
        paths.key,
      ])
      if (generated.exitCode !== 0) {
        return yield* new AuthError({
          message: lastProcessLine(generated) || "ssh-keygen failed",
        })
      }
    }

    const healthy = yield* runExitCode(step, ["ca", "health"], {
      env,
      stdout: "ignore",
      stderr: "ignore",
    }).pipe(Effect.orElseSucceed(() => 1))
    if (healthy !== 0) {
      const bootstrapped = yield* runCaptured(step, ["ca", "bootstrap", "--force"], { env })
      if (bootstrapped.exitCode !== 0) {
        const detail = lastProcessLine(bootstrapped)
        return yield* new AuthError({
          message: detail || "Could not reach the certificate authority.",
          hint: caUnreachableHint(config.host, detail),
        })
      }
    }

    const certOk = yield* fs.exists(paths.cert)
    const provisioner = certOk
      ? (yield* fs.exists(paths.provisionerFile))
        ? (yield* fs.readFileString(paths.provisionerFile)).trim()
        : ""
      : ""
    const needsRenewal =
      !certOk ||
      provisioner !== config.provisioner ||
      (yield* runExitCode(step, [
        "ssh",
        "needs-renewal",
        paths.cert,
        "--expires-in",
        "75%",
      ], {
        env,
        stdout: "ignore",
        stderr: "ignore",
      }).pipe(Effect.orElseSucceed(() => 1))) === 0

    if (needsRenewal) {
      hooks.onSigning?.()
      const signed = yield* runExitCode(step, [
        "ssh",
        "certificate",
        "--force",
        "--no-agent",
        "--no-password",
        "--insecure",
        "--provisioner",
        config.provisioner,
        "--console",
        "me",
        paths.key,
      ], { env, stdout: "inherit", stderr: "inherit" })
      if (signed !== 0) {
        return yield* new AuthError({
          message: `Could not sign an SSH certificate (step exited ${signed}).`,
          hint: "Open the printed link, enter the code, and sign in with your Juspay Google account.",
        })
      }
      yield* fs.writeFileString(paths.provisionerFile, `${config.provisioner}\n`)
    }

    const identityArgs = [
      "-i",
      paths.key,
      "-o",
      `CertificateFile=${paths.cert}`,
      "-o",
      "IdentitiesOnly=yes",
    ] as const

    return {
      useSshCa: true,
      identityFile: paths.key,
      certificateFile: paths.cert,
      sshArgs: [
        ...macArgs,
        ...identityArgs,
        "-o",
        `UserKnownHostsFile=${paths.knownHosts}`,
        "-o",
        "StrictHostKeyChecking=accept-new",
      ],
      instanceSshArgs: [...macArgs, ...identityArgs],
    }
  })
