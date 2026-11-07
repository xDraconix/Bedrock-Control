#!/usr/bin/env bash
# Run on trusted Linux/WSL computer. Private key never uploaded.
set -Eeuo pipefail
umask 077
if (( $# < 1 || $# > 2 )); then
  echo 'Aufruf: bash release-tools/prepare-signed-release.sh /SICHER/RELEASE-PRIVATE.pem [AUSGABEORDNER]' >&2
  exit 2
fi
for c in git openssl unzip sha256sum mktemp cp cmp grep mv chmod mkdir rm realpath stat awk bash; do
  command -v "$c" >/dev/null || { echo "Fehlendes Kommando: $c" >&2; exit 1; }
done
PRIVATE=$1
[[ -f "$PRIVATE" && ! -L "$PRIVATE" ]] || { echo 'Ungültiger privater Schlüsselpfad.' >&2; exit 1; }
PRIVATE=$(realpath "$PRIVATE")
DESTROOT=$HOME/Bedrock-Control-Releases
if (( $# == 2 )); then DESTROOT=$2; fi
[[ ! -L "$DESTROOT" ]] || { echo 'Ausgabe darf kein Symlink sein.' >&2; exit 1; }
mkdir -p "$DESTROOT"
DESTROOT=$(cd "$DESTROOT" && pwd -P)
[[ "$PRIVATE" != "$DESTROOT/"* ]] || { echo 'Privater Schlüssel darf nicht im Ausgabeordner liegen.' >&2; exit 1; }
TEMP=$(mktemp -d)
trap 'rm -rf -- "$TEMP"' EXIT
echo '[1/6] Hole den aktuellen main-Branch von GitHub ...'
git clone --quiet --depth 1 --single-branch --branch main \
  https://github.com/xDraconix/Bedrock-Control.git "$TEMP/source"
cd "$TEMP/source"
VERSION=$(tr -d '\r\n' < VERSION)
[[ "$VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] || { echo 'Ungültige Version.' >&2; exit 1; }
TAG="v$VERSION"
BASE="Bedrock-Control-PRO-$TAG-Release.zip"
PUBLIC=system/release/trusted-release-key.pem
echo '[2/6] Prüfe den privaten Schlüssel gegen den öffentlichen Herausgeber-Schlüssel ...'
openssl pkey -in "$PRIVATE" -pubout -outform DER > "$TEMP/pub-from-private.der"
openssl pkey -pubin -in "$PUBLIC" -outform DER > "$TEMP/pub-from-repo.der"
cmp -s "$TEMP/pub-from-private.der" "$TEMP/pub-from-repo.der" || {
  echo 'ABBRUCH: privater Schlüssel und öffentlicher Herausgeber-Schlüssel passen nicht zusammen.' >&2; exit 1;
}
FINAL="$DESTROOT/$TAG"
[[ ! -e "$FINAL" && ! -L "$FINAL" ]] || {
  echo "ABBRUCH: $FINAL existiert schon; keine Release-Dateien überschrieben." >&2; exit 1;
}
echo '[3/6] Baue das Installationspaket ...'
bash release-tools/build-release.sh
ZIP="dist/$BASE"
unzip -tq "$ZIP" >/dev/null
echo '[4/6] Signiere Manifest ...'
bash release-tools/sign-release.sh "$TAG" "$ZIP" "$PRIVATE"
MANIFEST="$ZIP.manifest"
SIGNATURE="$MANIFEST.sig"
echo '[5/6] Prüfe Signatur, SHA-256 und Archivdaten ...'
openssl pkeyutl -verify -pubin -inkey "$PUBLIC" -rawin -in "$MANIFEST" -sigfile "$SIGNATURE"
grep -Fxq "version=$TAG" "$MANIFEST"
grep -Fxq "asset=$BASE" "$MANIFEST"
grep -Fxq "sha256=$(sha256sum "$ZIP" | awk '{print $1}')" "$MANIFEST"
grep -Fxq "size=$(stat -c %s "$ZIP")" "$MANIFEST"
STAGE="$DESTROOT/.$TAG-staging-$$"
mkdir -m 0700 "$STAGE"
trap 'rm -rf -- "$STAGE" "$TEMP"' EXIT
cp -- "$ZIP" "$MANIFEST" "$SIGNATURE" "$STAGE/"
chmod 0644 "$STAGE/"*
mv -- "$STAGE" "$FINAL"
trap 'rm -rf -- "$TEMP"' EXIT
echo '[6/6] Erfolgreich! Diese drei Dateien in das GitHub-Release hochladen:'
printf '  %s\n' "$FINAL/$BASE" "$FINAL/$BASE.manifest" "$FINAL/$BASE.manifest.sig"
printf 'Git-Commit: %s\n' "$(git rev-parse HEAD)"
echo 'Der private Schlüssel bleibt lokal. Es wurde nichts auf GitHub veröffentlicht.'
