#!/usr/bin/env bash
set -Eeuo pipefail
SESSION="mcbedrock"
TIMEOUT=120
# This script is executed by systemd with User=mcserver.
if ! /usr/bin/screen -ls | /usr/bin/grep -Eq "[0-9]+\.${SESSION}[[:space:]]"; then
  echo "Keine SCREEN-Sitzung gefunden."
  exit 0
fi
echo "Sende STOP an Minecraft Bedrock ..."
/usr/bin/screen -S "$SESSION" -p 0 -X stuff $'stop\r'
echo "Warte auf das vollständige Herunterfahren ..."
for ((i=0; i<TIMEOUT; i++)); do
  if ! /usr/bin/screen -ls | /usr/bin/grep -Eq "[0-9]+\.${SESSION}[[:space:]]"; then
    echo "Minecraft Bedrock wurde beendet."
    exit 0
  fi
  /usr/bin/sleep 1
done
echo "FEHLER: Minecraft wurde innerhalb von ${TIMEOUT}s nicht beendet." >&2
exit 1
