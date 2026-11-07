#!/usr/bin/env bash
# Build a release ZIP from committed tracked files. Never signs or publishes.
set -Eeuo pipefail
ROOT="$(git rev-parse --show-toplevel)"
cd "$ROOT"
[[ -z "$(git status --porcelain)" ]] || {
  echo 'Fehler: Git-Arbeitsverzeichnis ist nicht sauber. Bitte Änderungen committen oder sichern.' >&2
  exit 1
}
[[ -f VERSION ]] || { echo 'VERSION fehlt.' >&2; exit 1; }
VERSION="$(tr -d '\r\n' < VERSION)"
[[ "$VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] || {
  echo "Fehler: VERSION muss X.Y.Z sein: $VERSION" >&2
  exit 1
}
for f in install.sh app/public/index.php app/public/assets/app.js app/public/assets/app.css \
  app/set-password.php system/release/trusted-release-key.pem \
  system/usr-local-bin/bedrock-panel-verify-release \
  system/usr-local-bin/bedrock-panel-recovery \
  system/usr-local-bin/bedrock-panel-apply-release \
  system/usr-local-sbin/bedrock-panel-self-update-worker; do
  [[ -f "$f" && ! -L "$f" ]] || { echo "Datei fehlt oder ist Symlink: $f" >&2; exit 1; }
done
command -v git >/dev/null
command -v openssl >/dev/null
command -v unzip >/dev/null
openssl pkey -pubin -in system/release/trusted-release-key.pem -noout >/dev/null
mkdir -p dist
TAG="v$VERSION"
OUT="$ROOT/dist/Bedrock-Control-PRO-$TAG-Release.zip"
[[ ! -e "$OUT" ]] || { echo "Archiv existiert bereits: $OUT" >&2; exit 1; }
TMP="$OUT.tmp"
trap 'rm -f "$TMP"' EXIT
git archive --format=zip --prefix="bedrock-control-pro-$VERSION-installer/" \
  --output="$TMP" HEAD
unzip -tq "$TMP" >/dev/null
mv "$TMP" "$OUT"
trap - EXIT
printf 'Git-Commit: %s\n' "$(git rev-parse HEAD)"
printf 'Release-Archiv: %s\n' "$OUT"
sha256sum "$OUT"
echo 'Das Release ist UNSIGNIERT. Bitte nur auf einem vertrauenswürdigen Rechner signieren.'
