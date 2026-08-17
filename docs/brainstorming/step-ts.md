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

## What we would add

- HTTPS client pinned to the CA root (Bun `fetch` + custom CA, or `undici`).
- Tiny OpenSSH cert reader (expiry + maybe key id).
- OIDC device-flow loop (poll token endpoint until the user finishes Google login or we time out).
- CA sign request/response for SSH certs (Smallstep’s `/ssh/sign` JSON).

No new native deps if we stay on Bun. Tests: fixture certs for expiry math; mock CA for health/bootstrap/sign. Device flow needs a recorded fixture or a fake OIDC server.

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
