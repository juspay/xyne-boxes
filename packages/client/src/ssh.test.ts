import { describe, expect, test } from "bun:test"
import { formatSshConfigFile, sshArgv, type SshConfig } from "./ssh.ts"

describe("formatSshConfigFile", () => {
  test("writes identity when CA is on", () => {
    const text = formatSshConfigFile({
      name: "mybox",
      user: "toor",
      useSshCa: true,
      identityFile: "/tmp/key",
      certificateFile: "/tmp/key-cert.pub",
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
      useSshCa: false,
      proxyCommand: "proxy",
    })
    expect(text).not.toContain("IdentityFile")
    expect(text).not.toContain("CertificateFile")
  })
})

describe("sshArgv", () => {
  const config: SshConfig = {
    name: "mybox",
    user: "toor",
    configPath: "/tmp/ssh_config",
    proxyCommand: "proxy",
    sshArgs: ["-o", "ForwardAgent=yes"],
    destination: "mybox",
  }

  test("builds ssh argv", () => {
    expect(sshArgv(config, { remoteCmd: ["uname", "-a"] })).toEqual([
      "-o",
      "ForwardAgent=yes",
      "-l",
      "toor",
      "--",
      "mybox",
      "uname",
      "-a",
    ])
  })
})
