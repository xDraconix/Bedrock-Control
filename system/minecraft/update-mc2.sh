#!/usr/bin/env bash
set -Eeuo pipefail

SERVER_DIR=/home/mcserver/minecraft_bedrock
SERVICE=mcbedrock.service
BACKUP_DIR=/home/mcserver/backups
API=https://net-secondary.web.minecraft-services.net/api/v1.0/download/links
TMP_DIR=$(mktemp -d)
STOPPED=0
BACKUP=''

cleanup() { rm -rf -- "$TMP_DIR"; }
recover() {
  local rc=$?
  trap - ERR
  if (( rc != 0 && STOPPED == 1 )); then
    echo 'FEHLER: Wiederherstellung der bisherigen Installation ...' >&2
    systemctl stop "$SERVICE" || true
    if [[ -n "$BACKUP" && -f "$BACKUP" ]]; then
      tar -xzf "$BACKUP" -C /home/mcserver || true
      chown -R mcserver:mcserver "$SERVER_DIR" || true
    fi
    systemctl start "$SERVICE" || true
  fi
  exit "$rc"
}
trap cleanup EXIT
trap recover ERR

for cmd in curl python3 unzip tar systemctl; do
  command -v "$cmd" >/dev/null || { echo "Fehlendes Programm: $cmd" >&2; exit 1; }
done
[[ $EUID -eq 0 ]] || { echo 'Bitte als root ausführen.' >&2; exit 1; }
[[ -d "$SERVER_DIR/worlds" && -f "$SERVER_DIR/bedrock_server" ]] || { echo 'Serververzeichnis unvollständig.' >&2; exit 1; }

printf 'Ermittle offizielle Linux-Downloadadresse ...\n'
curl -fsSL --retry 3 --connect-timeout 15 --max-time 60 "$API" -o "$TMP_DIR/links.json"
DOWNLOAD_URL=$(python3 - "$TMP_DIR/links.json" <<'PY'
import json, re, sys
from urllib.parse import urlparse
with open(sys.argv[1], encoding='utf-8') as f:
    data = json.load(f)
found = set()
def scan(obj):
    if isinstance(obj, dict):
        for v in obj.values(): scan(v)
    elif isinstance(obj, list):
        for v in obj: scan(v)
    elif isinstance(obj, str):
        for url in re.findall(r'https://[^\s"<>]+', obj):
            url = url.rstrip('),;')
            parsed = urlparse(url)
            if (parsed.hostname in {'www.minecraft.net', 'minecraft.net'}
                and re.fullmatch(r'/bedrockdedicatedserver/bin-linux/bedrock-server-\d+(?:\.\d+)+\.zip', parsed.path)):
                found.add(url)
scan(data)
if not found:
    sys.exit('Keine passende offizielle Linux-Downloadadresse gefunden. API-Format pruefen.')
def version(url):
    return tuple(map(int, re.search(r'bedrock-server-([\d.]+)\.zip', url).group(1).split('.')))
print(max(found, key=version))
PY
)
NEW_VERSION=$(sed -E 's/.*bedrock-server-([0-9.]+)\.zip.*/\1/' <<< "$DOWNLOAD_URL")
echo "Gefundene Version: $NEW_VERSION"
echo "Download: $DOWNLOAD_URL"

# Bereits erfolgreich installierte Version erkennen.
if [[ -f "$SERVER_DIR/.installed-bedrock-version" ]]; then
  CURRENT_VERSION=$(cat "$SERVER_DIR/.installed-bedrock-version")
  if [[ "$CURRENT_VERSION" == "$NEW_VERSION" ]]; then
    echo 'Diese Version ist bereits installiert. Kein Update erforderlich.'
    exit 0
  fi
fi

curl -fL --retry 3 --connect-timeout 15 --max-time 600 \
  -A 'Mozilla/5.0' "$DOWNLOAD_URL" -o "$TMP_DIR/server.zip"
unzip -tq "$TMP_DIR/server.zip" >/dev/null
if ! unzip -Z1 "$TMP_DIR/server.zip" > "$TMP_DIR/zip-contents.txt"; then
    echo 'FEHLER: ZIP-Inhaltsverzeichnis konnte nicht gelesen werden.' >&2
    exit 1
fi

if ! grep -Fxq 'bedrock_server' "$TMP_DIR/zip-contents.txt"; then
    echo 'FEHLER: Archiv enthält keinen Bedrock-Server.' >&2
    exit 1
fi

echo 'Bedrock-Server im Archiv gefunden.'

mkdir -p "$BACKUP_DIR"
BACKUP="$BACKUP_DIR/minecraft-$(date +%Y%m%d-%H%M%S).tar.gz"
echo 'Stoppe Server für konsistentes Backup ...'
systemctl stop "$SERVICE"
STOPPED=1
if systemctl is-active --quiet "$SERVICE"; then
  echo 'Server konnte nicht gestoppt werden.' >&2
  exit 1
fi

echo "Sichere Installation nach $BACKUP ..."
tar -czf "$BACKUP" -C /home/mcserver minecraft_bedrock
# Neues Paket separat auspacken und nur Programmdateien aktualisieren.
mkdir "$TMP_DIR/new"
unzip -q "$TMP_DIR/server.zip" -d "$TMP_DIR/new"

# Bewahrt sämtliche bestehenden Dateien, die nicht zum Standardpaket gehören.
# Insbesondere Welten, Packs, eigene Skripte und Konfigurationen bleiben erhalten.
while IFS= read -r -d '' file; do
  relative=${file#"$TMP_DIR/new/"}
  case "$relative" in
    worlds/*|behavior_packs/*|resource_packs/*|development_behavior_packs/*|development_resource_packs/*|development_skin_packs/*|config/*|logs/*|server.properties|permissions.json|allowlist.json|whitelist.json|valid_known_packs.json|*.log|*.sh)
      continue ;;
  esac
  target="$SERVER_DIR/$relative"
  mkdir -p "$(dirname "$target")"
  cp -p "$file" "$target"
done < <(find "$TMP_DIR/new" -type f -print0)

chmod +x "$SERVER_DIR/bedrock_server"
printf '%s\n' "$NEW_VERSION" > "$SERVER_DIR/.installed-bedrock-version"
chown -R mcserver:mcserver "$SERVER_DIR"

echo 'Starte Minecraft ...'
systemctl start "$SERVICE"
sleep 3
systemctl is-active --quiet "$SERVICE" || { echo 'Server startet nicht.' >&2; exit 1; }
STOPPED=0
echo "Update auf $NEW_VERSION abgeschlossen. Backup: $BACKUP"
echo 'Bitte anschließend die Minecraft-Konsole und Add-ons prüfen.'
