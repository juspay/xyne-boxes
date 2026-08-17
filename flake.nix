{
  inputs.nixpkgs.url = "https://channels.nixos.org/nixos-unstable/nixexprs.tar.xz";
  inputs.bun2nix.url = "github:nix-community/bun2nix/2.1.2";
  inputs.bun2nix.inputs.nixpkgs.follows = "nixpkgs";

  outputs =
    { self, nixpkgs, bun2nix, ... }:
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
          workspace = pkgs.callPackage ./nix/workspace.nix {
            root = ./.;
          };
          client = pkgs.callPackage ./packages/client {
            inherit workspace;
          };
          cli = pkgs.callPackage ./packages/cli {
            inherit workspace gitRev;
          };
          installer-test = pkgs.callPackage ./installer {
            root = ./.;
          };
        in
        {
          packages = {
            default = cli.xyne-boxes;
            bun2nix = pkgs.bun2nix;
          };
          checks = {
            client-tests = client.tests;
            client-typecheck = client.typecheck;
            cli-tests = cli.tests;
            cli-typecheck = cli.typecheck;
            inherit installer-test;
            package = cli.xyne-boxes;
          };
        };
    in
    {
      packages = eachSystem (system: (forSystem system).packages);

      checks = eachSystem (system: (forSystem system).checks);

      devShells = eachSystem (
        system:
        let
          pkgs = pkgsFor system;
        in
        {
          default = pkgs.mkShell {
            packages = [
              pkgs.bun
              pkgs.bun2nix
              pkgs.openssh
              pkgs.step-cli
              pkgs.nixpkgs-fmt
            ];
          };
        }
      );
    };
}
