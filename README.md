<div align="center">

<img src="site/og.svg" alt="xyne-boxes — a remote box, one command away" width="640">

# xyne-boxes

**Remote Linux dev boxes, one SSH away.**

### → [Setup &amp; usage](https://juspay.github.io/xyne-boxes/)

</div>

Library: [`packages/client`](packages/client/).

## Use as an Agent Plugin

The repository root is also an [Agent Plugin](https://agent-plugins.org/specification) (v1.0.0), so any Agent Plugins client can reference it directly:

```sh
AI_PROFILE=github:juspay/xyne-boxes agent-distro omp
```

Clients that read the plugin get the `pu` skill (`skills/pu/`) — provisioning and driving Incus boxes with `pu create/connect/destroy`. Existing [APM](https://microsoft.github.io/apm/) consumers keep working through `apm.yml`; `.apm/skills/pu` is a symlink to the same skill directory, so there is one copy.
