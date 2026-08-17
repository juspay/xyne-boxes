# Library checks only. No writeBunApplication — Client is not an executable.
{ pkgs
, bun2nix
, workspace
,
}:
let
  bunCheck =
    name: script:
    pkgs.stdenv.mkDerivation (workspace.bunCommon // {
      pname = "xyne-boxes-client-${name}";
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
  tests = bunCheck "tests" ''
    bun test ./packages/client
  '';
  typecheck = bunCheck "typecheck" ''
    bunx tsc --noEmit -p packages/client
  '';
}
