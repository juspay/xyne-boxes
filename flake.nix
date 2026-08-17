{
  inputs.nixpkgs.url = "https://channels.nixos.org/nixos-unstable/nixexprs.tar.xz";
  inputs.bun2nix.url = "github:nix-community/bun2nix/2.1.2";
  inputs.bun2nix.inputs.nixpkgs.follows = "nixpkgs";

  nixConfig = {
    extra-substituters = [ "https://nix-community.cachix.org" ];
    extra-trusted-public-keys = [
      "nix-community.cachix.org-1:mB9FSh9qf2dCimDSUo8Zy7bkq5CX+/rkCWyvRCYg3Fs="
    ];
  };

  outputs =
    { nixpkgs, bun2nix, ... }:
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
    in
    {
      packages = eachSystem (system: {
        default = (pkgsFor system).callPackage ./default.nix { };
        bun2nix = (pkgsFor system).bun2nix;
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
