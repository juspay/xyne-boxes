import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, expect, test } from "bun:test"
import { NodeServices } from "@effect/platform-node"
import { Effect, FileSystem } from "effect"
import type { Auth } from "./auth.ts"
import { resolveConfig } from "./config.ts"
import {
  formatSshConfigFile,
  sshArgv,
  SSH_PROXY_SCRIPT,
  syncInstanceSshConfigs,
  writeInstanceSshConfig,
  type SshConfig,
} from "./ssh.ts"

const runFs = <A, E>(effect: Effect.Effect<A, E, FileSystem.FileSystem>) =>
  Effect.runPromise(effect.pipe(Effect.provide(NodeServices.layer)))

const caOff: Auth = {
  useSshCa: false,
  sshArgs: [],
  instanceSshArgs: [],
}

const caOn: Auth = {
  useSshCa: true,
  identityFile: "/tmp/key",
  certificateFile: "/tmp/key-cert.pub",
  sshArgs: [],
  instanceSshArgs: [],
}

describe("formatSshConfigFile", () => {
  test("writes identity when CA is on", () => {
    const text = formatSshConfigFile({
      name: "mybox",
      user: "toor",
      auth: caOn,
      proxyCommand: "/tmp/ssh-proxy mybox ssh -T pu@pu connect mybox",
    })
    expect(text).toContain("Host mybox")
    expect(text).toContain("User toor")
    expect(text).toContain("IdentityFile /tmp/key")
    expect(text).toContain("CertificateFile /tmp/key-cert.pub")
    expect(text).toContain("ProxyCommand /tmp/ssh-proxy mybox ssh -T pu@pu connect mybox")
    expect(text).toContain("ForwardAgent yes")
  })

  test("omits identity when CA is off", () => {
    const text = formatSshConfigFile({
      name: "mybox",
      user: "toor",
      auth: caOff,
      proxyCommand: "proxy",
    })
    expect(text).not.toContain("IdentityFile")
    expect(text).not.toContain("CertificateFile")
  })
})

describe("SSH_PROXY_SCRIPT", () => {
  test("renew hint is the connect command", () => {
    expect(SSH_PROXY_SCRIPT).toContain("xyne-boxes connect $name")
    expect(SSH_PROXY_SCRIPT).toContain("certificate is missing or expired")
  })

  // bash 3.2, still the system bash on macOS, finds the end of a process
  // substitution by matching parens rather than parsing, so an unbalanced `)`
  // anywhere inside `>(...)` truncates the body and breaks the whole script.
  test("parens are balanced", () => {
    let depth = 0
    for (const ch of SSH_PROXY_SCRIPT) {
      if (ch === "(") depth++
      else if (ch === ")") depth--
      expect(depth).toBeGreaterThanOrEqual(0)
    }
    expect(depth).toBe(0)
  })

  test("bash parses the script", async () => {
    const proc = Bun.spawn(["bash", "-n"], { stdin: new TextEncoder().encode(SSH_PROXY_SCRIPT) })
    expect(await proc.exited).toBe(0)
  })
})

describe("sshArgv", () => {
  const config: SshConfig = {
    name: "mybox",
    user: "toor",
    configPath: "/tmp/ssh_config",
    proxyCommand: "proxy",
    sshArgs: ["-o", "ForwardAgent=yes", "-o", "StrictHostKeyChecking=no"],
    destination: "mybox",
  }

  test("builds ssh argv", () => {
    expect(sshArgv(config, { remoteCmd: ["uname", "-a"] })).toEqual([
      "-o",
      "ForwardAgent=yes",
      "-o",
      "StrictHostKeyChecking=no",
      "-l",
      "toor",
      "--",
      "mybox",
      "uname",
      "-a",
    ])
  })

  test("user -o flags precede the client's so ssh keeps the user's value", () => {
    const argv = sshArgv(config, { sshArgs: ["-o", "StrictHostKeyChecking=yes"] })
    expect(argv.slice(0, 6)).toEqual([
      "-o",
      "StrictHostKeyChecking=yes",
      "-o",
      "ForwardAgent=yes",
      "-o",
      "StrictHostKeyChecking=no",
    ])
  })
})

describe("syncInstanceSshConfigs", () => {
  const auth: Auth = {
    useSshCa: true,
    identityFile: "/tmp/key",
    certificateFile: "/tmp/key-cert.pub",
    sshArgs: ["-i", "/tmp/key"],
    instanceSshArgs: ["-i", "/tmp/key"],
  }

  const state = () => {
    const root = mkdtempSync(join(tmpdir(), "xyne-ssh-"))
    const stateDir = join(root, "state")
    mkdirSync(stateDir)
    writeFileSync(join(stateDir, "key"), "dummy-key\n")
    return resolveConfig({ host: "pu", admin: "toor", useSshCa: true, stateDir })
  }

  test("writes ssh_config for listed boxes and leaves identity files", async () => {
    const config = state()
    await runFs(syncInstanceSshConfigs(config, auth, ["kolu-ci-3", "kolu-bot"]))
    const snippet = readFileSync(join(config.stateDir, "kolu-ci-3", "ssh_config"), "utf8")
    expect(snippet).toContain("Host kolu-ci-3")
    expect(snippet).toContain("User toor")
    expect(snippet).toContain("IdentityFile /tmp/key")
    expect(snippet).toContain("pu@pu 'connect kolu-ci-3'")
    expect(existsSync(join(config.stateDir, "kolu-bot", "ssh_config"))).toBe(true)
    expect(readFileSync(join(config.stateDir, "key"), "utf8")).toBe("dummy-key\n")
    expect(existsSync(join(config.stateDir, "ssh-proxy"))).toBe(true)
  })

  test("prunes box dirs that are no longer listed", async () => {
    const config = state()
    mkdirSync(join(config.stateDir, "gone"))
    writeFileSync(join(config.stateDir, "gone", "ssh_config"), "Host gone\n")
    mkdirSync(join(config.stateDir, "keep"))
    writeFileSync(join(config.stateDir, "keep", "ssh_config"), "Host keep\n")
    await runFs(syncInstanceSshConfigs(config, auth, ["keep", "fresh"]))
    expect(existsSync(join(config.stateDir, "gone"))).toBe(false)
    expect(existsSync(join(config.stateDir, "keep", "ssh_config"))).toBe(true)
    expect(existsSync(join(config.stateDir, "fresh", "ssh_config"))).toBe(true)
    expect(existsSync(join(config.stateDir, "key"))).toBe(true)
  })

  test("empty names prunes every box dir", async () => {
    const config = state()
    mkdirSync(join(config.stateDir, "stale"))
    writeFileSync(join(config.stateDir, "stale", "ssh_config"), "Host stale\n")
    mkdirSync(join(config.stateDir, "notes"))
    writeFileSync(join(config.stateDir, "notes", "readme"), "not a box\n")
    await runFs(syncInstanceSshConfigs(config, auth, []))
    expect(existsSync(join(config.stateDir, "stale"))).toBe(false)
    expect(existsSync(join(config.stateDir, "notes", "readme"))).toBe(true)
    expect(existsSync(join(config.stateDir, "key"))).toBe(true)
  })

  test("writeInstanceSshConfig reuses a shared proxy path", async () => {
    const config = state()
    const written = await runFs(writeInstanceSshConfig(config, auth, "solo", "/opt/ssh-proxy"))
    expect(written.proxyCommand).toContain("/opt/ssh-proxy solo")
    expect(existsSync(join(config.stateDir, "ssh-proxy"))).toBe(false)
  })
})
