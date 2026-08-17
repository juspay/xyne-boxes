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
      builtFor = system: (pkgsFor system).callPackage ./default.nix { inherit gitRev; };
    in
    {
      packages = eachSystem (system: {
        default = (builtFor system).xyne-boxes;
        bun2nix = (pkgsFor system).bun2nix;
      });

      checks = eachSystem (system: {
        inherit (builtFor system) tests typecheck installer-test;
        package = (builtFor system).xyne-boxes;
      });

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
