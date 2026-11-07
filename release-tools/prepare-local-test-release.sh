#!/usr/bin/env bash
# Generates an UNSIGNED v2.5.1 test release using the beta6 installer payload.
# Run on a separate trusted computer where you keep the private signing key.
set -Eeuo pipefail
[[ $# -eq 1 ]] || { echo 'Aufruf: prepare-local-test-release.sh /pfad/zum/bedrock-control-pro-v2.5.0-beta6-installer' >&2; exit 2; }
SOURCE="$(realpath "$1")"
[[ -f "$SOURCE/VERSION" && -f "$SOURCE/app/public/index.php" && -f "$SOURCE/release-tools/sign-release.sh" ]] || { echo 'Installer-Verzeichnis fehlt oder ist unvollständig.' >&2; exit 1; }
command -v python3 >/dev/null || { echo 'Python3 fehlt.' >&2; exit 1; }
ROOT="$(mktemp -d)"
trap 'rm -rf "$ROOT"' EXIT
DEST="$ROOT/bedrock-control-pro-2.5.1-installer"
cp -a "$SOURCE" "$DEST"
printf '2.5.1\n' > "$DEST/VERSION"
# Make the test version identifiable in the browser and avoid cached assets.
python3 - "$DEST" <<'PY'
import pathlib,sys
root=pathlib.Path(sys.argv[1]); p=root/'app/public/index.php'
s=p.read_text().replace('2.5.0-beta6','2.5.1')
p.write_text(s)
PY
ARCHIVE="$(pwd)/Bedrock-Control-PRO-v2.5.1-Release.zip"
python3 - "$ROOT" "$ARCHIVE" <<'PY'
import pathlib,sys,zipfile
root=pathlib.Path(sys.argv[1]); target=pathlib.Path(sys.argv[2]);
with zipfile.ZipFile(target,'w',compression=zipfile.ZIP_DEFLATED,compresslevel=8) as z:
    for file in sorted(root.rglob('*')):
        if file.is_file() and '__pycache__' not in file.parts and file.suffix!='.pyc':
            z.write(file,file.relative_to(root).as_posix())
print('Nicht signiertes Test-Release:',target)
PY
echo 'Jetzt auf dem vertrauenswürdigen Rechner mit dem PRIVATEN Ed25519-Schlüssel signieren:'
echo "  bash \"$SOURCE/release-tools/sign-release.sh\" v2.5.1 \"$ARCHIVE\" /PFAD/ZU/release-private.pem"
echo 'Den privaten Schlüssel NICHT auf den Minecraft-Server kopieren.'
