{
  bun2nix,
  pkgs,
  lib,
}:
let
  version = (lib.importJSON ./packages/client/package.json).version;
in
bun2nix.writeBunApplication {
  pname = "xyne-boxes";
  inherit version;

  src = lib.fileset.toSource {
    root = ./.;
    fileset = lib.fileset.unions [
      ./package.json
      ./bun.lock
      ./bunfig.toml
      ./bun.nix
      ./tsconfig.json
      ./packages/client
    ];
  };

  dontUseBunBuild = true;
  dontUseBunCheck = true;
  dontRunLifecycleScripts = true;
  inheritPath = true;

  # Fresh machines only need Nix. These land on PATH ahead of anything the
  # user may or may not have installed (openssh, step-cli, bash for ProxyCommand).
  runtimeInputs = with pkgs; [
    bun
    openssh
    step-cli
    bash
    coreutils
  ];

  startScript = ''
    bun packages/client/src/cli.ts "$@"
  '';

  bunDeps = bun2nix.fetchBunDeps {
    bunNix = ./bun.nix;
  };

  postInstall = ''
    ln -s xyne-boxes "$out/bin/pu"
  '';

  meta = {
    description = "CLI for xyne-boxes";
    mainProgram = "xyne-boxes";
  };
}
