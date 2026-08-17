# Curl installer (no Nix)

Hard constraint: works on a **pristine** macOS Apple Silicon or Linux x86_64 machine. No Nix, no Homebrew, no preinstalled `step`.

```
curl -fsSL https://github.com/juspay/xyne-boxes/releases/download/nightly/install.sh | sh
```

Implementation lives in [`installer/`](../../installer/). Nix `run` stays as the other path.

## What the user gets

| Need | After `install.sh` |
| --- | --- |
| `xyne-boxes` / `pu` | Compiled nightly asset in `~/.local/bin` |
| `step` | Official Smallstep binary, same directory (pristine machines do not have it) |
| OpenSSH | Already on the OS — not bundled |
| bash | `/bin/bash` / `/bin/sh` |

`ensureAuth()` still shells out to `step`. The compiled CLI looks next to itself, then `XYNE_STEP`, then PATH.

## Nightly assets

[`.github/workflows/nightly.yml`](../../.github/workflows/nightly.yml) on `main` / `ts`:

- `xyne-boxes-darwin-arm64` / `xyne-boxes-linux-x64` — `bun build --compile` on that OS
- `step-darwin-arm64` / `step-linux-x64` — `installer/fetch-step.sh` (pinned in `installer/step-version`)
- `install.sh` — nightly publish bakes `GITHUB_SHA` over `__XYNE_COMMIT__`
- `COMMIT` — same hash as a one-line file (installer fallback)
- `SHA256SUMS`

`xyne-boxes version` also prints the baked commit so a cached binary is obvious.

OpenTUI natives do not cross-compile, so each `xyne-boxes-*` is built on the matching runner.

## Skip

- Website deploy of the installer
- Intel Mac / Windows / other Linux arches
- Homebrew / npm
- [Reimplementing `step` in TypeScript](step-ts.md) until shipping the official binary hurts
