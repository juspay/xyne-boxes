# Curl installer (no Nix)

How to ship `xyne-boxes` the way Claude / OpenCode / Grok do:

```
curl -fsSL https://juspay.github.io/xyne-boxes/install.sh | bash
```

Nix `run` stays. This is for a machine that only has `curl` and Apple’s `ssh`.

**v1 is macOS only** (`darwin-arm64`, `darwin-x64`). No Linux, no Windows, no Homebrew.

## What those installers actually do

1. CI builds a **standalone binary per OS/arch**
2. Upload to GitHub Releases
3. `install.sh` detects platform, downloads, drops it in `~/.local/bin`, maybe mends `PATH`

xyne-boxes is the same shape, plus one extra tool (`step`).

## What the user must have after install

| Need | Fresh MacBook |
| --- | --- |
| `xyne-boxes` itself | Compiled release asset |
| OpenSSH | Already there (`/usr/bin/ssh`) |
| `step` (Smallstep CLI) | **Not** there — installer must fetch it, unless we [reimplement it](step-ts.md) |
| bash | `/bin/bash` is enough for the proxy script |

`ensureAuth()` shells out to `ssh-keygen` and `step`. No `step` → no Google device-login cert.

## Compile the CLI (release assets)

Done in [`.github/workflows/nightly.yml`](../../.github/workflows/nightly.yml). Native macOS runners (OpenTUI cannot be cross-compiled):

```
bun build --compile --outfile xyne-boxes-darwin-arm64 packages/client/src/cli.ts
```

Local spike on linux-x64 produced a working ~129MB binary (`version` / `help` ran). Cross-compile to another OpenTUI arch failed to resolve `@opentui/core-<os>-<arch>`, so each asset is compiled **on that Mac**.

### Nightly

Push to `main` or `ts` (and `workflow_dispatch`) force-updates the moving `nightly` tag and the **Nightly** prerelease:

- `xyne-boxes-darwin-arm64`
- `xyne-boxes-darwin-x64`
- `SHA256SUMS`

`ts` publishes to the same tag so we can test the workflow before merge. Last push wins.

## Still to build

### `install.sh`

Not on the website yet. When we add it:

- Detect `uname -s` / `uname -m` (Darwin only)
- Download the matching `nightly` (or tagged) asset
- Install to `~/.local/bin/xyne-boxes` (and `pu` symlink)
- If `step` is missing, download Smallstep’s official Darwin binary into the same dir — or wait for [step-ts](step-ts.md)
- Append `~/.local/bin` to `PATH` in `.zshrc` if needed
- Run `xyne-boxes version`

No root.

### Versioned tags

`packages/client` is `0.1.0`. Nightly is enough to test the pipeline. Semver tags (`v0.1.0`) can reuse the same compile job later.

## Skip

- Homebrew
- Linux / Windows
- npm global
- [Reimplementing `step` in TypeScript](step-ts.md) until shipping `step` hurts
- Self-update command (`install.sh` again)
- Website deploy of the installer
