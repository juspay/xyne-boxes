# Reimplement `step` in TypeScript

`ensureAuth()` is the only caller. Today it shells out to `step` (and `ssh-keygen`). Dropping the `step` binary from the curl installer means doing these four jobs in-process.

## What we actually invoke

From `packages/client/src/auth.ts`, with `STEP_CA_URL` (default `https://$PU_HOST:8443`) and `STEP_FINGERPRINT`:

| Call | When | Why |
| --- | --- | --- |
| `step version` | once | is `step` on PATH |
| `step ca health` | every auth | is the CA up |
| `step ca bootstrap --force` | health fails | trust the CA root (writes `~/.step/`) |
| `step ssh needs-renewal <cert> --expires-in 75%` | cert exists | renew before expiry |
| `step ssh certificate --force --no-agent --no-password --insecure --provisioner GoogleBrowserless --console me <key>` | missing / wrong provisioner / due | interactive Google device login, writes `key-cert.pub` |

`ssh-keygen -t ed25519` stays. That is OpenSSH, already on a Mac. Do not reimplement keygen.

## What each piece really is

**Trust / bootstrap.** Fetch the CA root from the CA (`/roots.pem` or the well-known bootstrap JSON), check the SHA-256 fingerprint matches `STEP_FINGERPRINT`, store it for later TLS. `step` puts this in `~/.step/certs/root_ca.crt`. We can keep it under `~/.pu-state/` instead.

**Health.** `GET $STEP_CA_URL/health` over TLS using that root. Non-2xx → CA down.

**Needs-renewal.** Parse the OpenSSH *certificate* (`key-cert.pub` — not an X.509 cert). Read `valid before`. Renew if remaining lifetime &lt; 25% (i.e. `--expires-in 75%` already used). OpenSSH cert layout is documented; a small parser is enough. No CA call.

**Sign (`--console me`).** This is the whole cost.

1. Discover the `GoogleBrowserless` provisioner on the CA (`GET /provisioners`).
2. Run the **OIDC device-authorization grant** the CA advertises (the thing that prints a URL + code and tells you to open google.com/device).
3. Exchange the device token with the CA for an SSH certificate: `POST` the user’s ed25519 *public* key, get back an OpenSSH cert, write `key-cert.pub`.
4. Keep stderr/stdout interactive — the user must see the link and code. That is why the current call uses `inherit`.

`--no-agent --no-password --insecure --force` just means: don’t talk to ssh-agent, empty passphrase, allow the CA’s HTTP quirks, overwrite the cert file. None of that is crypto we have to invent.

## Implementation (minimize hand-rolling)

Stay on Bun. Prefer one mature library per job; do **not** write parsers or OAuth loops.

| Job | Use | Do not |
| --- | --- | --- |
| SHA-256 fingerprint of the CA root | `node:crypto` (`createHash("sha256")`) | a hashing package |
| Parse / write the PEM root | `@peculiar/x509` | string-split PEM |
| HTTPS to the CA with that root pinned | `undici` `Agent` + `connect.tls.ca` (Bun can use it). After bootstrap, all CA calls go through this agent. | `NODE_TLS_REJECT_UNAUTHORIZED=0` |
| `GET /health`, `GET /roots`, `GET /provisioners`, `POST /ssh/sign` | same `undici` client; decode bodies with **Effect Schema** (already a dependency) | a second HTTP stack, Zod |
| OpenSSH cert expiry (`key-cert.pub`) | [`sshpk`](https://github.com/TritonDataCenter/node-sshpk) `parseCertificate(buf, "openssh")` → `valid.until`, or [`@peculiar/ssh`](https://github.com/PeculiarVentures/ssh) if we want first-class TS | a hand-written OpenSSH wire parser |
| Google device login (`--console`) | [`openid-client`](https://github.com/panva/openid-client) v6: `discovery` from the provisioner’s issuer, `initiateDeviceAuthorization`, `pollDeviceAuthorizationGrant`. Print `verification_uri` + `user_code` to stderr (same UX as `step`). | RFC 8628 polling written by us |
| `ssh-keygen` | still the system binary | tweetnacl / WebCrypto keygen (OpenSSH file format is not worth it) |

There is **no official Smallstep TypeScript SDK**. The only protocol we own is the thin CA JSON around `/ssh/sign` (public key in, OpenSSH cert out, OIDC access token as bearer). Capture that once with `step ssh certificate -v` against the real `GoogleBrowserless` provisioner and encode it as a Schema — do not guess.

Sketch of the sign path:

```ts
import * as client from "openid-client"
import { parseCertificate } from "sshpk"

const config = await client.discovery(new URL(provisioner.oidc.configurationEndpoint))
const device = await client.initiateDeviceAuthorization(config, { scope: provisioner.oidc.scope })
// print device.verification_uri + device.user_code
const tokens = await client.pollDeviceAuthorizationGrant(config, device)
const cert = await ca.fetch("/ssh/sign", { token: tokens.access_token, pub: publicKey })
```

Renewal is `parseCertificate(readFile(certPath), "openssh")` and compare `valid.until` to `now + 0.25 * lifetime`.

Tests: `sshpk` against checked-in fixture certs; `undici` MockAgent for health/bootstrap/sign; `openid-client` against a recorded device-flow fixture or a stub issuer. Do not hit Google in unit tests.

Native addons: none of the above require them if we pick `sshpk` (pure JS). `@peculiar/ssh` uses WebCrypto (fine in Bun). `openid-client` is pure JS.

## Cost and risk

| Piece | Size | Risk |
| --- | --- | --- |
| health + bootstrap + fingerprint | small | low — HTTP + SHA-256 |
| OpenSSH cert expiry | small | low — stable format |
| OIDC device flow + `/ssh/sign` | the work | **high** — one mismatch with `GoogleBrowserless` and nobody can log in |

Wrong device-flow details fail in production only (real Google account, real CA). Need a staging CA or a recorded successful `step -v` trace before writing code.

## Why bother

Curl install would ship **one** binary and not also fetch Smallstep’s `step`. `nix run` could drop `step-cli` from `runtimeInputs`. Library users would not need `step` on PATH.

## Why not for v1

The CA protocol is already solved by `step`. Nightly release assets can keep requiring `step` on PATH (or the future `install.sh` can drop Smallstep’s official macOS binary next to `xyne-boxes`). Reimplement only if shipping `step` becomes the painful part.
