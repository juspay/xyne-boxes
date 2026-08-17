# installer/

Curl install for a **pristine** macOS (Apple Silicon) or Linux x86_64 machine. No Nix, no Homebrew, no preinstalled `step`.

```
curl -fsSL https://raw.githubusercontent.com/juspay/xyne-boxes/nightly/installer/install.sh | sh
```

Drops both binaries in `~/.local/bin`:

- `xyne-boxes` (+ `pu` symlink) — compiled CLI from the `nightly` tag
- `step` — official Smallstep CLI (Nix-fetched from the Smallstep release, pinned in `flake.nix`)

`ensureAuth()` needs `step`. The compiled binary also looks for `step` next to itself (`XYNE_STEP` overrides).

| File | Role |
| --- | --- |
| `install.sh` | What the user pipes to `sh` |

The script prints the nightly **commit hash** (baked in at publish, or read from the `COMMIT` asset). `xyne-boxes version` prints the same hash from the binary, so a cached download is obvious. Downloads go to a temp file in the dest dir, are checked against `SHA256SUMS`, then `mv`'d over the previous binary.

Push to `main` or `ts` updates the `nightly` tag.

Override install location or release with `XYNE_BOXES_BIN` / `XYNE_BOXES_RELEASE`. `XYNE_BOXES_COMMIT` overrides the printed hash.
