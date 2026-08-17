# Curl installer (no Nix)

How to ship `xyne-boxes` the way Claude / OpenCode / Grok do:

```
curl -fsSL https://juspay.github.io/xyne-boxes/install.sh | bash
```

Nix `run` stays. This is for a machine that only has `curl` and Apple’s `ssh`.

## What those installers actually do

1. CI builds a **standalone binary per OS/arch**
2. Upload to GitHub Releases (or a CDN)
3. `install.sh` detects platform, downloads, drops it in `~/.local/bin`, maybe mends `PATH`

xyne-boxes is the same shape, plus one extra tool.

## What the user must have after install

| Need | Fresh MacBook |
| --- | --- |
| `xyne-boxes` itself | Must ship |
| OpenSSH | Already there (`/usr/bin/ssh`) |
| `step` (Smallstep CLI) | **Not** there — installer must fetch it |
| bash | `/bin/bash` is enough for the proxy script |
| Bun | Only if we *don’t* compile; a compiled binary embeds it |

`ensureAuth()` shells out to `ssh-keygen` and `step`. No `step` → no Google device-login cert. The installer has to provide `step` or the curl path is a lie.

## What to build

### 1. Compile the CLI

```
bun build --compile --outfile xyne-boxes packages/client/src/cli.ts
```

One file with Bun inside (~50–90MB). Matrix: `darwin-arm64`, `darwin-x64`, `linux-x64`, `linux-arm64`.

**Risk:** `@opentui/core` is native per-arch. Compile has to succeed on each runner (or drop OpenTUI from the release binary and keep ANSI). Spike this first — if compile + OpenTUI fails, the plan changes.

### 2. GitHub Release assets

On tag `v0.1.0`:

- `xyne-boxes-darwin-arm64`
- `xyne-boxes-darwin-x64`
- `xyne-boxes-linux-x64`
- `xyne-boxes-linux-arm64`
- `SHA256SUMS`

Optionally a tarball that also contains `step` so the script is one download.

### 3. `install.sh`

Host on the existing Pages site:

```
curl -fsSL https://juspay.github.io/xyne-boxes/install.sh | bash
```

It should:

- Detect `uname -s` / `uname -m`
- Download the matching release binary
- Install to `~/.local/bin/xyne-boxes` (and `pu` symlink)
- If `step` is missing, download Smallstep’s official binary for that platform into the same dir
- Append `~/.local/bin` to `PATH` in `.zshrc` / `.bashrc` if needed
- Run `xyne-boxes version` as a smoke check

Do **not** require root. Do **not** assume Homebrew.

### 4. CI

A `release` workflow: tag → matrix compile → `gh release upload`. Same job can `nix build` so the Nix and curl artifacts stay in lockstep.

### 5. Versioning

`packages/client` is `0.1.0` and nothing tags releases yet. Need tagged versions or `install.sh` has nothing stable to pin.

## Skip for v1

- Homebrew tap (nice later)
- npm global (library is already importable; npm still wouldn’t give you `step`)
- Windows
- Reimplementing `step` in TypeScript
- A self-update command (`install.sh` again is enough)

## Effort

| Piece | Rough size |
| --- | --- |
| Spike `bun --compile` + OpenTUI natives | half a day — **do this first** |
| `install.sh` + `step` fetch | half a day |
| Release workflow + checksums | half to one day |
| Site/README one-liner | small |

The only real unknown is whether a compiled binary plus OpenTUI natives is clean on Darwin and Linux. Everything else is standard release plumbing.
