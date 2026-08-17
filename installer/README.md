# installer/

Curl install for a **pristine** macOS (Apple Silicon) or Linux x86_64 machine. No Nix, no Homebrew, no preinstalled `step`.

```
curl -fsSL https://github.com/juspay/xyne-boxes/releases/download/nightly/install.sh | sh
```

Drops both binaries in `~/.local/bin`:

- `xyne-boxes` (+ `pu` symlink) — compiled CLI from the `nightly` tag
- `step` — official Smallstep CLI, version in [`step-version`](step-version)

`ensureAuth()` needs `step`. The compiled binary also looks for `step` next to itself (`XYNE_STEP` overrides).

| File | Role |
| --- | --- |
| `install.sh` | What the user pipes to `sh` |
| `fetch-step.sh` | CI: download official `step` for `darwin-arm64` / `linux-x64` |
| `step-version` | Pinned Smallstep release |

Override install location or release with `XYNE_BOXES_BIN` / `XYNE_BOXES_RELEASE`.
