<div align="center">

<img src="site/og.svg" alt="xyne-boxes — a remote box, one command away" width="640">

# xyne-boxes

**Remote Linux dev boxes, one SSH away.**

### → [Setup &amp; usage guide](https://juspay.github.io/xyne-boxes/)

</div>

---

Install on a pristine Mac (Apple Silicon) or Linux x86_64. No Nix.

```
curl -fsSL https://raw.githubusercontent.com/juspay/xyne-boxes/nightly/installer/install.sh | sh
```

That drops `xyne-boxes` and official `step` in `~/.local/bin`. Then:

```
xyne-boxes create mybox
xyne-boxes connect mybox
```

Setup, Tailscale, and the rest of the happy path: **[website](https://juspay.github.io/xyne-boxes/)**.

### Alternative: Nix

If you already have [Nix](https://juspay.github.io/nixone/), skip the curl installer. This wraps bun, openssh, and step-cli:

```
nix run https://github.com/juspay/xyne-boxes/archive/main.zip -- <command>
```

## Commands

| Command | Description |
| --- | --- |
| `create <name>` | Create a box |
| `fork <source> <name>` | Fork an existing box |
| `connect <name>` | SSH into a box |
| `destroy <name> [name ...]` | Destroy one or more boxes |
| `list` | List your boxes |
| `version` | Print package, commit, bun, ssh, and step-cli versions |

## Library

[`packages/client`](packages/client/) is the Effect library. [`packages/cli`](packages/cli/) is the terminal (the only thing that execs `ssh`).

```ts
import { Client } from "xyne-boxes"
import { Effect } from "effect"
import { NodeServices } from "@effect/platform-node"

const program = Effect.gen(function* () {
  const client = yield* Client.make()
  const listed = yield* client.list()
  const ssh = yield* client.sshConfig("mybox")
  return { listed, ssh }
}).pipe(Effect.provide(NodeServices.layer))
```

Connecting is CLI-only (`xyne-boxes connect`). The library returns SSH config; the caller runs `ssh`. Auth (`ensureAuth`, Smallstep `step`) is in the library.

## Support

Questions or feedback? Join `#xyne-boxes-feedback` on Xyne Spaces.

## The website

The site in [`site/`](site/) deploys to GitHub Pages via
[`.github/workflows/pages.yml`](.github/workflows/pages.yml) on `main`.
