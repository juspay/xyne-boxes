# Prefer `nix run .` / `nix build .`. Shim for callPackage users.
{ pkgs
, gitRev ? "unknown"
,
}:
let
  workspace = pkgs.callPackage ./nix/workspace.nix {
    root = ./.;
  };
in
(pkgs.callPackage ./packages/cli {
  inherit workspace gitRev;
}).xyne-boxes
