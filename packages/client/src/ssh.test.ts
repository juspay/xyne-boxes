import { describe, expect, test } from "bun:test"
import type { Auth } from "./auth.ts"
import { formatSshConfigFile, sshArgv, SSH_PROXY_SCRIPT, type SshConfig } from "./ssh.ts"

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
