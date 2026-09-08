import { Effect, FileSystem } from "effect"
import type { PlatformError } from "effect/PlatformError"
import { type ResolvedConfig, identityPaths } from "./config.ts"
import { AuthError, MissingTool } from "./errors.ts"
import { lastProcessLine, runCaptured, runExitCode, type ProcessReq } from "./process.ts"
import {
  CURL_INSTALL,
  caUnreachableHint,
  caUnreachableMessage,
} from "./recover.ts"
import { resolveStep } from "./tools.ts"

export { caUnreachableHint } from "./recover.ts"

export interface AuthHooks {
  readonly onSigning?: () => void
}

export type SshOption = readonly [name: string, value: string]

export interface Auth {
  /** OpenSSH options for the control plane (`pu@host`). */
  readonly controlOptions: ReadonlyArray<SshOption>
  /** OpenSSH options for an instance hop. */
  readonly instanceOptions: ReadonlyArray<SshOption>
}

const macOption: SshOption = [
  "MACs",
  "hmac-sha2-256-etm@openssh.com,hmac-sha2-512-etm@openssh.com,umac-128-etm@openssh.com",
] as const

const hostAuthOptions: ReadonlyArray<SshOption> = [
  ["HostbasedAuthentication", "yes"],
  ["PreferredAuthentications", "hostbased"],
  ["HostbasedAcceptedAlgorithms", "ssh-ed25519"],
  ["PubkeyAuthentication", "no"],
  ["PasswordAuthentication", "no"],
  ["KbdInteractiveAuthentication", "no"],
  ["GlobalKnownHostsFile", "/etc/ssh/ssh_known_hosts"],
  ["UserKnownHostsFile", "/dev/null"],
  ["StrictHostKeyChecking", "yes"],
] as const

export const stepEnv = (
  config: Extract<ResolvedConfig, { readonly authMode: "ssh-ca" }>,
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
  if (code === 127) {
    return yield* new MissingTool({
      tool: "step",
      hint: `Install it with the curl installer (also drops official step):\n\n  ${CURL_INSTALL}`,
    })
  }
  if (code !== 0) {
    return yield* new AuthError({
      message: `step at ${step} exited ${code} (it is installed; this is not a missing PATH).`,
      hint: `Reinstall:\n\n  ${CURL_INSTALL}\n\nOr set XYNE_STEP to a working binary.`,
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

    if (config.authMode === "host") {
      const options = [macOption, ...hostAuthOptions]
      return {
        controlOptions: options,
        instanceOptions: options,
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
        const detail = lastProcessLine(generated)
        return yield* new AuthError({
          message: detail || `ssh-keygen failed writing ${paths.key}.`,
          hint: "OpenSSH ssh-keygen must be on PATH. Stock macOS and Linux ship it as ssh-keygen.",
        })
      }
    }

    yield* Effect.logDebug(`CA ${config.stepCaUrl} host=${config.host}`)
    const healthy = yield* runExitCode(step, ["ca", "health"], {
      env,
      stdout: "ignore",
      stderr: "ignore",
    }).pipe(Effect.orElseSucceed(() => 1))
    yield* Effect.logDebug(`step ca health exit=${healthy}`)
    if (healthy !== 0) {
      yield* Effect.logDebug("step ca bootstrap")
      const bootstrapped = yield* runCaptured(step, ["ca", "bootstrap", "--force"], { env })
      if (bootstrapped.exitCode !== 0) {
        const detail = lastProcessLine(bootstrapped)
        const said = detail !== "" ? `step said: ${detail}` : undefined
        return yield* new AuthError({
          message: caUnreachableMessage(config.host, config.stepCaUrl),
          hint: [said, caUnreachableHint(config.host, detail)].filter(Boolean).join("\n\n"),
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
        "168h",
      ], {
        env,
        stdout: "ignore",
        stderr: "ignore",
      }).pipe(Effect.orElseSucceed(() => 1))) === 0

    if (needsRenewal) {
      yield* Effect.logDebug("signing SSH certificate")
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
          hint: "step prints a URL and a code. Open the URL, enter the code, sign in with your Juspay Google account, then rerun the same command.",
        })
      }
      yield* fs.writeFileString(paths.provisionerFile, `${config.provisioner}\n`)
    }

    const identityOptions: ReadonlyArray<SshOption> = [
      ["IdentityFile", paths.key],
      ["CertificateFile", paths.cert],
      ["IdentitiesOnly", "yes"],
    ] as const

    return {
      controlOptions: [
        macOption,
        ...identityOptions,
        ["UserKnownHostsFile", paths.knownHosts],
        ["StrictHostKeyChecking", "accept-new"],
      ],
      instanceOptions: [
        macOption,
        ...identityOptions,
        ["StrictHostKeyChecking", "no"],
        ["UserKnownHostsFile", "/dev/null"],
      ],
    }
  })
