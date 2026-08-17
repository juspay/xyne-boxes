# The thing `nix run` launches.
{ pkgs
, lib
, bun2nix
, workspace
, gitRev ? "unknown"
, step
,
}:
let
  bunCheck =
    name: script:
    pkgs.stdenv.mkDerivation (workspace.bunCommon // {
      pname = "xyne-boxes-cli-${name}";
      nativeBuildInputs = [
        pkgs.bun
        bun2nix.hook
      ];
      buildPhase = script;
      installPhase = ''
        mkdir -p "$out"
        echo ok > "$out/${name}"
      '';
    });
in
{
  xyne-boxes = bun2nix.writeBunApplication (workspace.bunCommon // {
    pname = "xyne-boxes";
    inheritPath = true;
    runtimeInputs = [
      pkgs.bun
      pkgs.openssh
      step
      pkgs.bash
      pkgs.coreutils
    ];
    startScript = ''
      export XYNE_COMMIT=${lib.escapeShellArg gitRev}
      bun packages/cli/src/cli.ts "$@"
    '';
    postInstall = ''
      ln -s xyne-boxes "$out/bin/pu"
    '';
    meta = {
      description = "CLI for xyne-boxes";
      mainProgram = "xyne-boxes";
    };
  });

  tests = bunCheck "tests" ''
    bun test ./packages/cli
  '';
  typecheck = bunCheck "typecheck" ''
    bunx tsc --noEmit -p packages/cli
  '';
}
