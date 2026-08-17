{ bun2nix
, pkgs
, lib
, gitRev ? "unknown"
,
}:
let
  version = (lib.importJSON ./packages/client/package.json).version;

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

  bunDeps = bun2nix.fetchBunDeps {
    bunNix = ./bun.nix;
  };

  bunCommon = {
    inherit src bunDeps version;
    dontUseBunBuild = true;
    dontUseBunCheck = true;
    dontRunLifecycleScripts = true;
    dontFixup = true;
  };

  xyne-boxes = bun2nix.writeBunApplication (bunCommon // {
    pname = "xyne-boxes";
    inheritPath = true;
    runtimeInputs = with pkgs; [
      bun
      openssh
      step-cli
      bash
      coreutils
    ];
    startScript = ''
      export XYNE_COMMIT=${lib.escapeShellArg gitRev}
      bun packages/client/src/cli.ts "$@"
    '';
    postInstall = ''
      ln -s xyne-boxes "$out/bin/pu"
    '';
    meta = {
      description = "CLI for xyne-boxes";
      mainProgram = "xyne-boxes";
    };
  });

  bunCheck =
    name: script:
    pkgs.stdenv.mkDerivation (bunCommon // {
      pname = "xyne-boxes-${name}";
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
  inherit xyne-boxes;
  tests = bunCheck "tests" ''
    bun test ./packages/client
  '';
  typecheck = bunCheck "typecheck" ''
    bunx tsc --noEmit -p packages/client
  '';
  installer-test = pkgs.stdenv.mkDerivation {
    pname = "xyne-boxes-installer-test";
    inherit version;
    src = lib.fileset.toSource {
      root = ./.;
      fileset = ./installer;
    };
    nativeBuildInputs = [
      pkgs.curl
      pkgs.coreutils
      pkgs.gnugrep
      pkgs.gawk
      pkgs.gnutar
      pkgs.gzip
    ];
    buildPhase = ''
      chmod +x installer/install.sh installer/install.test.sh \
        installer/fetch-step.sh installer/fetch-step.test.sh
      sh installer/install.test.sh
      sh installer/fetch-step.test.sh
    '';
    installPhase = ''
      mkdir -p "$out"
      echo ok > "$out/installer-test"
    '';
  };
}
