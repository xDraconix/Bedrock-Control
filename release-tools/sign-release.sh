#!/usr/bin/env bash
set -Eeuo pipefail
if [[ $# -ne 3 ]]; then
  echo 'Aufruf: sign-release.sh vX.Y.Z /pfad/Bedrock-Control-PRO-vX.Y.Z-Release.zip /SICHERER-ORT/release-private.pem' >&2
  exit 2
fi
TAG="$1"; ZIP="$2"; PRIVATE="$3"
[[ "$TAG" =~ ^v[0-9]+\.[0-9]+\.[0-9]+$ ]] || { echo 'Nur stabile Tags vX.Y.Z erlaubt.' >&2; exit 2; }
[[ "$(basename "$ZIP")" == "Bedrock-Control-PRO-$TAG-Release.zip" ]] || { echo 'Archivname passt nicht zum Tag.' >&2; exit 2; }
[[ -f "$ZIP" && -f "$PRIVATE" && ! -L "$PRIVATE" ]] || { echo 'ZIP oder privater Schlüssel fehlt.' >&2; exit 2; }
MANIFEST="${ZIP}.manifest"; SIGNATURE="${MANIFEST}.sig"
HASH="$(sha256sum "$ZIP" | cut -d' ' -f1)"
SIZE="$(stat -c %s "$ZIP")"
printf 'bedrock-control-pro-release-v1\nversion=%s\nasset=%s\nsha256=%s\nsize=%s\n' "$TAG" "$(basename "$ZIP")" "$HASH" "$SIZE" > "$MANIFEST"
openssl pkeyutl -sign -rawin -inkey "$PRIVATE" -in "$MANIFEST" -out "$SIGNATURE"
echo "Signiert: $MANIFEST + $SIGNATURE"
echo 'WICHTIG: Den privaten Schlüssel niemals in GitHub, im Release oder auf dem Webserver veröffentlichen!'
