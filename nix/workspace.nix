# Shared bun workspace: one lock, one fileset. Not a package.
{ lib
, bun2nix
, root
,
}:
let
  version = (lib.importJSON (root + "/packages/client/package.json")).version;

  src = lib.fileset.toSource {
    root = root;
    fileset = lib.fileset.unions [
      (root + /package.json)
      (root + /bun.lock)
      (root + /bunfig.toml)
      (root + /bun.nix)
      (root + /tsconfig.json)
      (root + /packages/client)
      (root + /packages/cli)
    ];
  };

  bunDeps = bun2nix.fetchBunDeps {
    bunNix = root + /bun.nix;
  };

  bunCommon = {
    inherit src bunDeps version;
    dontUseBunBuild = true;
    dontUseBunCheck = true;
    dontRunLifecycleScripts = true;
    dontFixup = true;
  };
in
{
  inherit src bunDeps version bunCommon;
}
