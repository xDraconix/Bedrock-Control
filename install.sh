#!/usr/bin/env bash
set -Eeuo pipefail
[[ $EUID -eq 0 ]] || { echo 'Bitte als root ausführen.' >&2; exit 1; }
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SERVER=/home/mcserver/minecraft_bedrock
# A fresh Debian container may have no Minecraft server yet. The authenticated
# web wizard can install it later. Existing servers are never overwritten.
if [[ -e "$SERVER" && ! -f "$SERVER/server.properties" ]]; then
  echo "WARNUNG: $SERVER existiert ohne server.properties. Setup-Assistent wird vorhandene Daten nicht überschreiben."
fi
# Install Debian dependencies BEFORE changing the existing application.
# Existing Minecraft installation, user and systemd unit are intentionally prerequisites.
install_dependencies() {
  [[ -r /etc/os-release ]] || { echo 'Fehler: /etc/os-release fehlt.' >&2; exit 1; }
  . /etc/os-release
  [[ "${ID:-}" == "debian" || " ${ID_LIKE:-} " == *" debian "* ]] || {
    echo 'Automatische Paketinstallation ist nur für Debian-basierte Systeme vorgesehen.' >&2; exit 1;
  }
  command -v apt-get >/dev/null || { echo 'apt-get fehlt.' >&2; exit 1; }
  export DEBIAN_FRONTEND=noninteractive
  echo 'Prüfe und installiere benötigte Debian-Pakete (apt-get) ...'
  apt-get update
  apt-get install -y --no-install-recommends \
    openssl apache2 libapache2-mod-php php-cli php-common \
    python3 sudo zip unzip curl screen procps acl ca-certificates libcurl4 libstdc++6 zlib1g
  # CLI and Apache must use a compatible PHP version. Debian's default packages
  # provide the default Apache module; do not silently overwrite custom PHP.
  for c in apache2 php python3 sudo zip unzip curl screen pgrep visudo apache2ctl a2ensite; do
    command -v "$c" >/dev/null || { echo "Fehlendes Kommando nach Installation: $c" >&2; exit 1; }
  done
  php -r 'exit(extension_loaded("session") ? 0 : 1);' || { echo 'PHP Session-Modul fehlt.' >&2; exit 1; }
  PHPVER="$(php -r 'echo PHP_MAJOR_VERSION.".".PHP_MINOR_VERSION;')"
  if [[ ! -d "/etc/php/$PHPVER/apache2/conf.d" ]]; then
    echo "Fehler: Apache-PHP-Modul für PHP $PHPVER fehlt (CLI/Apache-Versionen weichen ggf. ab)." >&2
    echo "Bitte PHP-Versionen prüfen: php -v; ls /etc/php/*/apache2/conf.d" >&2
    exit 1
  fi
  # Enable PHP module when Debian did not activate it automatically.
  if [[ "$(/usr/sbin/apache2ctl -M 2>/dev/null)" != *php_module* ]]; then
    if command -v a2enmod >/dev/null && [[ -d "/etc/apache2/mods-available" ]]; then
      a2enmod "php${PHPVER}" >/dev/null
    fi
  fi
}
install_dependencies
# Runtime console directory uses the mcserver group even before Minecraft is
# installed. Create the service identity now; the web wizard installs the
# server files later and must not overwrite an existing installation.
if ! getent group mcserver >/dev/null; then
  groupadd --system mcserver
  echo 'Systemgruppe mcserver angelegt.'
fi
if ! id mcserver >/dev/null 2>&1; then
  useradd --system --gid mcserver --create-home \
    --home-dir /home/mcserver --shell /usr/sbin/nologin mcserver
  echo 'Systembenutzer mcserver angelegt (Minecraft wird später im Webpanel installiert).'
fi
# Apache runs the dashboard as www-data. Grant read-only journal access.
# -aG preserves all existing supplementary group memberships.
if ! getent group systemd-journal >/dev/null; then
  echo 'Fehler: Gruppe systemd-journal fehlt; Journal-Zugriff kann nicht eingerichtet werden.' >&2
  exit 1
fi
if [[ " $(id -nG www-data) " != *" systemd-journal "* ]]; then
  usermod -aG systemd-journal www-data
  echo 'Benutzer www-data zur Gruppe systemd-journal hinzugefügt.'
else
  echo 'Benutzer www-data besitzt bereits Zugriff auf die Gruppe systemd-journal.'
fi
if [[ -d /opt/bedrock-control-pro ]]; then
  dest="/root/bedrock-control-pro-preinstall-$(date +%Y%m%d-%H%M%S)"
  cp -a /opt/bedrock-control-pro "$dest"
  echo "Sicherung der bisherigen Anwendung: $dest"
fi
install -d -m 0755 /opt/bedrock-control-pro
cp -a "$ROOT/app/." /opt/bedrock-control-pro/
install -m 0644 -o root -g root "$ROOT/VERSION" /opt/bedrock-control-pro/VERSION
# Public web files must be readable by Apache (www-data). Source ZIPs may
# contain restrictive modes (e.g. index.php 0600 root:root).
# Do not apply these permissions recursively to config/ or other private data.
install -d -m 0750 -o root -g www-data /opt/bedrock-control-pro
chown root:www-data /opt/bedrock-control-pro/public
find /opt/bedrock-control-pro/public -type d -exec chown root:www-data {} + -exec chmod 0750 {} +
find /opt/bedrock-control-pro/public -type f -exec chown root:www-data {} + -exec chmod 0640 {} +
# Validate actual read access, including traversal of all parent directories.
if ! runuser -u www-data -- test -r /opt/bedrock-control-pro/public/index.php; then
  echo 'FEHLER: www-data kann public/index.php nicht lesen.' >&2
  namei -l /opt/bedrock-control-pro/public/index.php >&2
  exit 1
fi
if ! runuser -u www-data -- php -l /opt/bedrock-control-pro/public/index.php; then
  echo 'FEHLER: PHP-Datei ist für www-data nicht lesbar oder hat Syntaxfehler.' >&2
  exit 1
fi
while IFS= read -r -d '' webfile; do
  if ! runuser -u www-data -- test -r "$webfile"; then
    echo "FEHLER: www-data kann Webdatei nicht lesen: $webfile" >&2
    exit 1
  fi
done < <(find /opt/bedrock-control-pro/public -type f -print0)
echo 'Webdatei-Berechtigungen für www-data erfolgreich geprüft.'
install -d -m 0750 -o root -g www-data /opt/bedrock-control-pro/config
if [[ ! -f /opt/bedrock-control-pro/config/config.php ]]; then
  install -m 0640 -o root -g www-data "$ROOT/app/config/config.php.example" /opt/bedrock-control-pro/config/config.php
fi
chown root:www-data /opt/bedrock-control-pro/config/config.php
chmod 0640 /opt/bedrock-control-pro/config/config.php
if [[ -f /opt/bedrock-control-pro/config/password.hash ]]; then
  chown root:www-data /opt/bedrock-control-pro/config/password.hash
  chmod 0640 /opt/bedrock-control-pro/config/password.hash
fi
# Public verification key is shipped with the *trusted installer*.
# Never overwrite an existing key or trust a key obtained from an unverified update.
TRUST_DIR=/etc/bedrock-control-pro
TRUST_KEY="$TRUST_DIR/trusted-release-key.pem"
BUNDLED_KEY="$ROOT/system/release/trusted-release-key.pem"
[[ -f "$BUNDLED_KEY" && ! -L "$BUNDLED_KEY" ]] || {
  echo "FEHLER: Öffentlicher Release-Schlüssel im Installer fehlt oder ist ein Symlink." >&2
  exit 1
}
if ! /usr/bin/openssl pkey -pubin -in "$BUNDLED_KEY" -noout >/dev/null 2>&1; then
  echo "FEHLER: Mitgelieferter öffentlicher Release-Schlüssel ist ungültig." >&2
  exit 1
fi
[[ ! -L "$TRUST_DIR" ]] || { echo "FEHLER: $TRUST_DIR ist ein Symlink." >&2; exit 1; }
if [[ -e "$TRUST_DIR" ]]; then
  [[ -d "$TRUST_DIR" ]] || { echo "FEHLER: $TRUST_DIR ist kein Verzeichnis." >&2; exit 1; }
  [[ "$(stat -c %u "$TRUST_DIR")" == 0 ]] || { echo "FEHLER: $TRUST_DIR gehört nicht root." >&2; exit 1; }
  dir_mode="$(stat -c %a "$TRUST_DIR")"
  if (( (8#$dir_mode & 8#022) != 0 )); then
    echo "FEHLER: $TRUST_DIR ist durch Gruppe/Andere beschreibbar." >&2
    exit 1
  fi
else
  install -d -m 0755 -o root -g root "$TRUST_DIR"
fi
if [[ -e "$TRUST_KEY" || -L "$TRUST_KEY" ]]; then
  [[ -f "$TRUST_KEY" && ! -L "$TRUST_KEY" ]] || { echo "FEHLER: vorhandener Schlüssel ist kein reguläres File." >&2; exit 1; }
  [[ "$(stat -c %u "$TRUST_KEY")" == 0 ]] || { echo "FEHLER: vorhandener Schlüssel gehört nicht root." >&2; exit 1; }
  key_mode="$(stat -c %a "$TRUST_KEY")"
  if (( (8#$key_mode & 8#022) != 0 )); then
    echo "FEHLER: vorhandener Schlüssel ist durch Gruppe/Andere beschreibbar." >&2
    exit 1
  fi
  installed_fp="$(/usr/bin/openssl pkey -pubin -in "$TRUST_KEY" -outform DER 2>/dev/null | sha256sum | awk '{print $1}')"
  bundled_fp="$(/usr/bin/openssl pkey -pubin -in "$BUNDLED_KEY" -outform DER 2>/dev/null | sha256sum | awk '{print $1}')"
  if [[ "$installed_fp" != "$bundled_fp" ]]; then
    echo "FEHLER: vorhandener Release-Prüfschlüssel weicht vom Installer-Schlüssel ab." >&2
    echo "Der Schlüssel wird NICHT überschrieben; bitte Herausgeber und Fingerabdruck prüfen." >&2
    exit 1
  fi
  echo 'Release-Prüfschlüssel vorhanden und mit mitgeliefertem Schlüssel identisch; unverändert belassen.'
else
  install -m 0644 -o root -g root "$BUNDLED_KEY" "$TRUST_KEY"
  echo 'Öffentlichen Ed25519-Release-Prüfschlüssel eingerichtet.'
fi
/usr/bin/openssl pkey -pubin -in "$TRUST_KEY" -noout >/dev/null
install -d -m 0755 /usr/local/share/bedrock-control-pro
# Verifier is a root-owned tool; trusted public key was checked above.
install -m 0755 -o root -g root "$ROOT/system/usr-local-bin/bedrock-panel-verify-release" /usr/local/bin/bedrock-panel-verify-release
install -m 0755 -o root -g root "$ROOT/system/usr-local-bin/bedrock-panel-recovery" /usr/local/bin/bedrock-panel-recovery
install -m 0755 -o root -g root "$ROOT/system/usr-local-bin/bedrock-panel-update-test" /usr/local/bin/bedrock-panel-update-test
install -m 0755 -o root -g root "$ROOT/system/usr-local-bin/bedrock-panel-apply-release" /usr/local/bin/bedrock-panel-apply-release
install -m 0755 -o root -g root "$ROOT/system/usr-local-bin/bedrock-panel-system-plan" /usr/local/bin/bedrock-panel-system-plan
# Dedicated root-only directory. The web server has no write permission here.
# Updatekanal ist eine root-verwaltete Konfiguration und bleibt bei Upgrades erhalten.
CHANNEL_CONFIG=/etc/bedrock-control-pro/update-channel
if [[ ! -e "$CHANNEL_CONFIG" && ! -L "$CHANNEL_CONFIG" ]]; then
  install -m 0644 -o root -g root /dev/null "$CHANNEL_CONFIG"
  printf 'stable\n' > "$CHANNEL_CONFIG"
elif [[ -L "$CHANNEL_CONFIG" || ! -f "$CHANNEL_CONFIG" || "$(stat -c %u "$CHANNEL_CONFIG")" != 0 ]]; then
  echo 'FEHLER: Updatekanal-Datei ist nicht sicher eingerichtet.' >&2
  exit 1
fi
install -m 0755 -o root -g root "$ROOT/system/usr-local-sbin/bedrock-panel-self-update-worker" /usr/local/sbin/bedrock-panel-self-update-worker
install -m 0755 -o root -g root "$ROOT/system/usr-local-sbin/bedrock-panel-self-update-control" /usr/local/sbin/bedrock-panel-self-update-control
install -m 0644 -o root -g root "$ROOT/system/systemd/bedrock-panel-self-update.service" /etc/systemd/system/bedrock-panel-self-update.service
install -d -m 0700 -o root -g root /var/lib/bedrock-panel-update-staging
for f in start_server.sh stop_server.sh mcbedrock.service; do
  install -m 0644 -o root -g root "$ROOT/system/setup-assets/$f" "/usr/local/share/bedrock-control-pro/$f"
done
for file in "$ROOT"/system/usr-local-sbin/bedrock-*; do
  install -m 0755 -o root -g root "$file" "/usr/local/sbin/$(basename "$file")"
done
# Existing installations need the same narrowly scoped ACLs as new web setups.
if [[ -f "$SERVER/server.properties" ]]; then
  /usr/local/sbin/bedrock-config-access
else
  echo 'Minecraft noch nicht installiert: ACL-Prüfung erfolgt nach dem Web-Setup.'
fi
if [[ ! -e /root/update-mc2.sh ]]; then
  install -m 0700 -o root -g root "$ROOT/system/minecraft/update-mc2.sh" /root/update-mc2.sh
else
  echo 'Vorhandenes /root/update-mc2.sh bleibt unverändert.'
fi
# Install the verified graceful-stop fix; no service restart is triggered.
STOP_TARGET="$SERVER/stop_server.sh"
if [[ -f "$STOP_TARGET" ]]; then
  cp -a "$STOP_TARGET" "$STOP_TARGET.pre-bedrock-control-$(date +%Y%m%d-%H%M%S)"
fi
if id mcserver >/dev/null && [[ -f "$SERVER/server.properties" ]]; then
  install -m 0750 -o mcserver -g mcserver "$ROOT/system/minecraft/stop_server.sh" "$STOP_TARGET"
else
  echo 'Minecraft noch nicht vorhanden: Stoppskript wird beim Web-Setup eingerichtet.'
fi
install -d -m 0755 /etc/systemd/system/mcbedrock.service.d
install -m 0644 "$ROOT/system/systemd/mcbedrock.service.d/bedrock-control-pro.conf" /etc/systemd/system/mcbedrock.service.d/bedrock-control-pro.conf
# The helper is also called by the web setup worker after it creates the unit.
# Existing Minecraft services are not restarted during a panel upgrade.
/usr/local/sbin/bedrock-service-configure
printf '%s\n' 'Graceful-stop-Skript und TimeoutStopSec=150 installiert; Minecraft wurde NICHT neugestartet.'
install -d -m 0750 -o www-data -g www-data /var/lib/bedrock-panel/uploads
install -m 0440 -o root -g root "$ROOT/system/sudoers/bedrock-control-pro" /etc/sudoers.d/bedrock-control-pro
visudo -cf /etc/sudoers.d/bedrock-control-pro >/dev/null
install -m 0644 "$ROOT/system/tmpfiles/bedrock-control-pro.conf" /etc/tmpfiles.d/bedrock-control-pro.conf
systemd-tmpfiles --create /etc/tmpfiles.d/bedrock-control-pro.conf
install -m 0644 "$ROOT/system/tmpfiles/bedrock-panel-jobs.conf" /etc/tmpfiles.d/bedrock-panel-jobs.conf
systemd-tmpfiles --create /etc/tmpfiles.d/bedrock-panel-jobs.conf
install -m 0644 "$ROOT/system/tmpfiles/bedrock-world-exports.conf" /etc/tmpfiles.d/bedrock-world-exports.conf
systemd-tmpfiles --create /etc/tmpfiles.d/bedrock-world-exports.conf
install -m 0644 "$ROOT/system/apache/bedrock-control-pro.conf" /etc/apache2/sites-available/bedrock-control-pro.conf
if ! grep -RqsE '^[[:space:]]*Listen[[:space:]]+8088([[:space:]]|$)' /etc/apache2/ports.conf /etc/apache2/conf-enabled/ 2>/dev/null; then
  printf '\nListen 8088\n' >> /etc/apache2/ports.conf
fi
PHPVER="$(php -r 'echo PHP_MAJOR_VERSION.".".PHP_MINOR_VERSION;')"
if [[ ! -d /etc/php/$PHPVER/apache2/conf.d ]]; then
  echo "PHP Apache-Modul für Version $PHPVER fehlt. Bitte installieren und erneut ausführen." >&2
  exit 1
fi
install -m 0644 "$ROOT/system/php/99-bedrock-addon-upload.ini" "/etc/php/$PHPVER/apache2/conf.d/99-bedrock-addon-upload.ini"
a2ensite bedrock-control-pro.conf >/dev/null
apache2ctl configtest
# Restart (not reload): new Apache worker processes must inherit journal group access.
systemctl restart apache2
if ! runuser -u www-data -- journalctl -n 1 --no-pager -q >/dev/null 2>&1; then
  echo 'WARNUNG: Journal-Lesezugriff für www-data konnte noch nicht bestätigt werden.' >&2
  echo 'Prüfe: id www-data; runuser -u www-data -- journalctl -n 3 --no-pager' >&2
else
  echo 'Journal-Lesezugriff für www-data erfolgreich geprüft.'
fi
if [[ ! -s /opt/bedrock-control-pro/config/password.hash ]]; then
  echo 'Administrator-Passwort jetzt einrichten:'
  php /opt/bedrock-control-pro/set-password.php
fi
echo 'Installation abgeschlossen (v2.6.2): http://SERVER-IP:8088/'
echo 'Bestehende Minecraft-Server wurden nicht neu gestartet oder überschrieben. Bei Neuinstallation: Webpanel öffnen und Setup-Assistent verwenden.'
