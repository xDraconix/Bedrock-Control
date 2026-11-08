#!/usr/bin/env bash
# Run on trusted Linux/WSL computer. Private key never uploaded.
set -Eeuo pipefail
umask 077
usage() {
  echo 'Aufruf: bash release-tools/prepare-signed-release.sh /SICHER/RELEASE-PRIVATE.pem [--output VERZEICHNIS] [--publish]' >&2
}
if (( $# < 1 )); then usage; exit 2; fi
PRIVATE=$1
shift
PUBLISH=0
DESTROOT=$HOME/Bedrock-Control-Releases
while (( $# )); do
  case "$1" in
    --publish) PUBLISH=1; shift;;
    --output)
      (( $# >= 2 )) || { usage; exit 2; }
      DESTROOT=$2; shift 2;;
    *) usage; exit 2;;
  esac
done
for c in git openssl unzip sha256sum mktemp cp cmp grep mv chmod mkdir rm realpath stat awk bash; do
  command -v "$c" >/dev/null || { echo "Fehlendes Kommando: $c" >&2; exit 1; }
done
if (( PUBLISH )); then
  command -v gh >/dev/null || { echo 'GitHub CLI fehlt. Installation: https://cli.github.com/' >&2; exit 1; }
  gh auth status --hostname github.com >/dev/null || {
    echo 'GitHub CLI ist nicht angemeldet. Bitte zuerst: gh auth login' >&2
    exit 1
  }
fi
[[ -f "$PRIVATE" && ! -L "$PRIVATE" ]] || { echo 'Ungültiger privater Schlüsselpfad.' >&2; exit 1; }
PRIVATE=$(realpath "$PRIVATE")
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
# Never publish over an existing tag or release. Verify errors rather than
# mistaking authentication/network failures for a missing release.
if (( PUBLISH )); then
  echo '[1a/7] Prüfe GitHub: Tag und Release dürfen noch nicht existieren ...'
  REPO='xDraconix/Bedrock-Control'
  existing_tags=$(git ls-remote --tags origin "refs/tags/$TAG" "refs/tags/$TAG^{}") || {
    echo 'GitHub-Tags konnten nicht abgefragt werden.' >&2; exit 1;
  }
  [[ -z "$existing_tags" ]] || {
    echo "ABBRUCH: Git-Tag $TAG existiert bereits; Veröffentlichung verweigert." >&2; exit 1;
  }
  if gh api --include "repos/$REPO/releases/tags/$TAG" > "$TEMP/existing-release" 2>&1; then
    echo "ABBRUCH: GitHub-Release $TAG existiert bereits." >&2; exit 1
  else
    last_status=$(grep -E '^HTTP/[0-9.]+ [0-9]{3}' "$TEMP/existing-release" | tail -n 1 || true)
    if [[ "$last_status" != *' 404'* ]]; then
      echo 'ABBRUCH: Release-Status konnte nicht eindeutig geprüft werden.' >&2
      cat "$TEMP/existing-release" >&2
      exit 1
    fi
  fi
  NOTES="docs/releases/$TAG.md"
  [[ -s "$NOTES" && ! -L "$NOTES" ]] || {
    echo "ABBRUCH: Release-Notes fehlen: $NOTES" >&2; exit 1;
  }
fi
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
if (( PUBLISH )); then
  echo
  echo 'GitHub-Release wird als STABLE veröffentlicht (nicht als Pre-Release).'
  printf 'Repository: %s\nVersion: %s\nCommit: %s\n' "$REPO" "$TAG" "$(git rev-parse HEAD)"
  if [[ ! -t 0 ]]; then
    echo 'ABBRUCH: Veröffentlichung erfordert eine interaktive Bestätigung.' >&2; exit 1
  fi
  read -r -p "Zur endgültigen Veröffentlichung $TAG exakt eintippen: " CONFIRM
  [[ "$CONFIRM" == "$TAG" ]] || {
    echo 'Veröffentlichung abgebrochen. Lokale Release-Dateien bleiben erhalten.' >&2; exit 1;
  }
  echo 'Veröffentliche ZIP, Manifest und Signatur über GitHub CLI ...'
  gh release create "$TAG" \
    "$FINAL/$BASE" "$FINAL/$BASE.manifest" "$FINAL/$BASE.manifest.sig" \
    --repo "$REPO" \
    --target "$(git rev-parse HEAD)" \
    --title "Bedrock Control PRO $TAG Stable" \
    --notes-file "$NOTES" \
    --latest
  gh release view "$TAG" --repo "$REPO" --json tagName,isDraft,isPrerelease,assets,url \
    --jq '{tag:.tagName,draft:.isDraft,prerelease:.isPrerelease,assets:(.assets|map(.name)),url:.url}'
  echo 'Veröffentlichung abgeschlossen. Bitte drei Assets und Signatur im Release noch einmal kontrollieren.'
else
  echo 'Der private Schlüssel bleibt lokal. Es wurde nichts auf GitHub veröffentlicht.'
  echo 'Für automatisches Veröffentlichen: Skript mit --publish starten.'
fi
