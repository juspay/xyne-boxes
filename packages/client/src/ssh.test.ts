import { describe, expect, test } from "bun:test"
import type { Auth } from "./auth.ts"
import { formatSshConfigFile, sshArgv, SSH_PROXY_SCRIPT, type SshConfig } from "./ssh.ts"

const hostAuth: Auth = {
  controlOptions: [],
  instanceOptions: [
    ["HostbasedAuthentication", "yes"],
    ["PreferredAuthentications", "hostbased"],
    ["PubkeyAuthentication", "no"],
    ["GlobalKnownHostsFile", "/etc/ssh/ssh_known_hosts"],
    ["UserKnownHostsFile", "/dev/null"],
    ["StrictHostKeyChecking", "yes"],
  ],
}

const caOn: Auth = {
  controlOptions: [],
  instanceOptions: [
    ["IdentityFile", "/tmp/key"],
    ["CertificateFile", "/tmp/key-cert.pub"],
    ["IdentitiesOnly", "yes"],
  ],
}

describe("formatSshConfigFile", () => {
  test("writes identity when CA is on", () => {
    const text = formatSshConfigFile({
      name: "mybox",
      user: "toor",
      options: [
        ...caOn.instanceOptions,
        ["ProxyCommand", "/tmp/ssh-proxy mybox ssh -T pu@pu connect mybox"],
        ["ForwardAgent", "yes"],
      ],
    })
    expect(text).toContain("Host mybox")
    expect(text).toContain("User toor")
    expect(text).toContain("IdentityFile /tmp/key")
    expect(text).toContain("CertificateFile /tmp/key-cert.pub")
    expect(text).toContain("ProxyCommand /tmp/ssh-proxy mybox ssh -T pu@pu connect mybox")
    expect(text).toContain("ForwardAgent yes")
  })

  test("writes the complete host authentication strategy", () => {
    const text = formatSshConfigFile({
      name: "mybox",
      user: "toor",
      options: [...hostAuth.instanceOptions, ["ProxyCommand", "proxy"]],
    })
    expect(text).not.toContain("IdentityFile")
    expect(text).not.toContain("CertificateFile")
    expect(text).toContain("HostbasedAuthentication yes")
    expect(text).toContain("PreferredAuthentications hostbased")
    expect(text).toContain("PubkeyAuthentication no")
    expect(text).toContain("StrictHostKeyChecking yes")
    expect(text).not.toContain("StrictHostKeyChecking no")
  })
})

describe("SSH_PROXY_SCRIPT", () => {
  test("authentication failure hint works for every auth mode", () => {
    expect(SSH_PROXY_SCRIPT).toContain("xyne-boxes connect $name")
    expect(SSH_PROXY_SCRIPT).toContain("Check this box's access or renew your login")
    expect(SSH_PROXY_SCRIPT).not.toContain("certificate is missing or expired")
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
