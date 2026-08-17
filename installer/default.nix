# Curl-installer tests. Fileset is installer/ only.
{ pkgs
, lib
, root
,
}:
pkgs.stdenv.mkDerivation {
  pname = "xyne-boxes-installer-test";
  version = (lib.importJSON (root + "/packages/client/package.json")).version;
  src = lib.fileset.toSource {
    inherit root;
    fileset = root + /installer;
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
}
