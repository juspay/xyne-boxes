# xyne-boxes docs

- [brainstorming/](brainstorming/) — decisions that are not code yet, and why the alternatives lost.
- [brainstorming/installer.md](brainstorming/installer.md) — curl install on a pristine Mac or Linux box (no Nix, no Homebrew, no preinstalled `step`). Nightly assets and `installer/`.
- [brainstorming/step-ts.md](brainstorming/step-ts.md) — what it would take to stop shelling out to `step` and do CA bootstrap / Google device-login / SSH certs in TypeScript.

The TypeScript library and CLI are documented in [packages/client/README.md](../packages/client/README.md). The curl installer itself lives in [installer/](../installer/). End-user setup is the [website](https://juspay.github.io/xyne-boxes/).
