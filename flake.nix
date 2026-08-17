{
  inputs.nixpkgs.url = "https://channels.nixos.org/nixos-unstable/nixexprs.tar.xz";
  inputs.bun2nix.url = "github:nix-community/bun2nix/2.1.2";
  inputs.bun2nix.inputs.nixpkgs.follows = "nixpkgs";
  # Official Smallstep release binaries. Fetched, not compiled.
  inputs.step-linux-x64 = {
    url = "https://github.com/smallstep/cli/releases/download/v0.30.6/step_linux_0.30.6_amd64.tar.gz";
    flake = false;
  };
  inputs.step-darwin-arm64 = {
    url = "https://github.com/smallstep/cli/releases/download/v0.30.6/step_darwin_0.30.6_arm64.tar.gz";
    flake = false;
  };

  outputs =
    { self
    , nixpkgs
    , bun2nix
    , step-linux-x64
    , step-darwin-arm64
    , ...
    }:
    let
      systems = [
        "x86_64-linux"
        "aarch64-linux"
        "aarch64-darwin"
        "x86_64-darwin"
      ];
      eachSystem = nixpkgs.lib.genAttrs systems;
      pkgsFor =
        system:
        import nixpkgs {
          inherit system;
          overlays = [ bun2nix.overlays.default ];
        };
      gitRev =
        if self ? rev && self.rev != null then self.rev
        else if self ? dirtyRev then self.dirtyRev
        else "unknown";
      forSystem =
        system:
        let
          pkgs = pkgsFor system;
          officialStep = src: raw: pname:
            pkgs.callPackage ./nix/official-step.nix {
              inherit src raw pname;
            };
          step-linux-x64-bin = officialStep step-linux-x64 true "step-linux-x64";
          step-darwin-arm64-bin = officialStep step-darwin-arm64 true "step-darwin-arm64";
          step =
            if system == "x86_64-linux" then officialStep step-linux-x64 false "step"
            else if system == "aarch64-darwin" then officialStep step-darwin-arm64 false "step"
            else pkgs.step-cli;
          workspace = pkgs.callPackage ./nix/workspace.nix {
            root = ./.;
          };
          client = pkgs.callPackage ./packages/client {
            inherit workspace;
          };
          cli = pkgs.callPackage ./packages/cli {
            inherit workspace gitRev step;
          };
          installer-test = pkgs.callPackage ./installer {
            root = ./.;
          };
        in
        {
          packages = {
            default = cli.xyne-boxes;
            bun2nix = pkgs.bun2nix;
            inherit step;
            step-linux-x64 = step-linux-x64-bin;
            step-darwin-arm64 = step-darwin-arm64-bin;
          };
          checks = {
            client-tests = client.tests;
            client-typecheck = client.typecheck;
            cli-tests = cli.tests;
            cli-typecheck = cli.typecheck;
            inherit installer-test;
            package = cli.xyne-boxes;
            inherit step-linux-x64-bin step-darwin-arm64-bin;
          };
        };
    in
    {
      packages = eachSystem (system: (forSystem system).packages);

      checks = eachSystem (system: (forSystem system).checks);

      devShells = eachSystem (
        system:
        let
          inherit (forSystem system) packages;
          pkgs = pkgsFor system;
        in
        {
          default = pkgs.mkShell {
            packages = [
              pkgs.bun
              pkgs.bun2nix
              pkgs.openssh
              packages.step
              pkgs.nixpkgs-fmt
            ];
          };
        }
      );
    };
}
