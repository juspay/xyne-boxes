/** Facts and commands an error can carry so the reader does not hunt. */

export const SITE_URL = "https://juspay.github.io/xyne-boxes/"

export const TAILSCALE_UP =
  "sudo tailscale up --login-server=https://headscale.nixos.asia --hostname $(hostname -s)"

export const CURL_INSTALL =
  "curl -fsSL https://raw.githubusercontent.com/juspay/xyne-boxes/nightly/installer/install.sh | sh"

export const joinTailscale = (): string =>
  [
    "That host is on the Juspay Tailscale network.",
    "",
    `  ${TAILSCALE_UP}`,
    "",
    `No Tailscale yet? ${SITE_URL}`,
  ].join("\n")

export const caUnreachableMessage = (host: string, caUrl: string): string =>
  `Could not reach the SSH CA at ${host} (${caUrl}).`

export const caUnreachableHint = (host: string, detail: string): string => {
  if (/socks|proxychains/i.test(detail)) {
    return [
      `A proxy (juspay-run/proxychains) intercepted the CA at ${host}.`,
      "Run xyne-boxes directly, not through that proxy.",
      "",
      joinTailscale(),
    ].join("\n")
  }
  return joinTailscale()
}
