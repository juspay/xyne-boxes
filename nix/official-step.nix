# Official Smallstep release binary. We fetch it; we do not compile it.
{ lib
, stdenv
, stdenvNoCC
, autoPatchelfHook
, src
, pname ? "step"
, version ? "0.30.6"
  # raw = copy as shipped (nightly release assets).
  # !raw = patchelf on Linux so `nix run` works on NixOS.
, raw ? false
}:
let
  builder = if raw then stdenvNoCC else stdenv;
in
builder.mkDerivation {
  inherit pname version src;
  nativeBuildInputs = lib.optionals (!raw && stdenv.hostPlatform.isLinux) [ autoPatchelfHook ];
  buildInputs = lib.optionals (!raw && stdenv.hostPlatform.isLinux) [ stdenv.cc.cc.lib ];
  dontUnpack = true;
  dontConfigure = true;
  dontBuild = true;
  dontFixup = raw;
  installPhase = ''
    runHook preInstall
    mkdir -p "$out/bin"
    f=$(find "$src" -type f -name step | head -n 1)
    if [ -z "$f" ]; then
      echo "official-step.nix: no step binary in $src" >&2
      exit 1
    fi
    cp "$f" "$out/bin/step"
    chmod 755 "$out/bin/step"
    runHook postInstall
  '';
  meta = {
    description = "Official Smallstep CLI binary";
    homepage = "https://github.com/smallstep/cli";
    mainProgram = "step";
    sourceProvenance = [ lib.sourceTypes.binaryNativeCode ];
  };
}
