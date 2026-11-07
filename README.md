# Bedrock Control PRO

Bedrock Control PRO verwaltet einen **Minecraft Bedrock Dedicated Server auf Debian 13** über ein lokales Webpanel. Minecraft kann auf einem frischen Debian-System direkt über das Panel installiert werden.

## Version

**2.5.4** – Stable-Release-Kandidat mit signiertem Panel-Selbstupdate.

> Wichtig: Die Sicherheitsprüfung und der Web-Updateablauf wurden auf Testcontainern erfolgreich erprobt. Ein browsergestütztes Panel-Update aktualisiert derzeit **nur** Webdateien und Panel-Versionsdatei, nicht sämtliche Root-Helper, systemd-Units oder sudoers-Regeln. Versionswechsel mit geänderten Systemkomponenten müssen mit `bash install.sh` ausgeführt werden.

## Funktionen

- Minecraft-Server per Web-Assistenten installieren und konfigurieren
- Start, Stop, Neustart, Konsole und Journal-Protokolle
- Welten, Add-ons, Backups und Serverupdates verwalten
- NetherNet-Watchdog mit dynamischer Porterkennung
- GitHub-Release-Prüfung über **Stabil** oder **Testversionen**
- Signaturprüfung mit gepinntem **Ed25519-Public-Key** und SHA-256
- Vor einem signierten Panel-Webupdate: Backup und Integritätsprüfung
- Bei kontrolliertem Fehler: automatische Wiederherstellung

## Neuinstallation auf Debian 13

```bash
apt update && apt install -y git ca-certificates
git clone https://github.com/xDraconix/Bedrock-Control.git
cd Bedrock-Control
bash install.sh
```

Nach dem Einrichten des Administratorpassworts das Panel unter `http://SERVER-IP:8088/` öffnen. Wenn Minecraft noch nicht vorhanden ist, den Assistenten **Minecraft einrichten** verwenden.

Alternativ kann das **offizielle, signierte Installations-ZIP** aus einem veröffentlichten GitHub Release verwendet werden. Nicht das von GitHub automatisch erzeugte „Source code“-Archiv mit dem signierten Installationspaket verwechseln.

**Sicherheit:** Das Panel besitzt administrative Funktionen. Den Webzugriff auf ein vertrauenswürdiges Netzwerk oder VPN beschränken; bei Zugriff aus nicht vertrauenswürdigen Netzen HTTPS und geeignete zusätzliche Schutzmaßnahmen verwenden.

## Vertrauenswürdige Updates

Der Installer installiert den offiziellen **öffentlichen** Release-Prüfschlüssel aus `system/release/trusted-release-key.pem` unter:

```text
/etc/bedrock-control-pro/trusted-release-key.pem
```

Existiert ein abweichender Schlüssel, wird die Installation verweigert, statt ihn unbemerkt zu ersetzen. **Der private Signaturschlüssel darf niemals ins Repository oder auf den Minecraft-Server gelangen.**

Die Einstellung für den Updatekanal wird unter `/etc/bedrock-control-pro/update-channel` (Werte `stable` oder `test`) außerhalb der Webdateien gespeichert. Der Browser übergibt dem Root-Updater keine beliebigen Shellbefehle, Dateipfade oder Download-URLs.

GitHub-Releases: https://github.com/xDraconix/Bedrock-Control/releases

## Release für Herausgeber erstellen

Das Installationspaket wird aus einem **sauberen, geprüften Git-Commit** gebaut:

```bash
bash release-tools/build-release.sh
```

Das erzeugte Archiv `dist/Bedrock-Control-PRO-v2.5.4-Release.zip` anschließend **auf dem vertrauenswürdigen Signierrechner** signieren:

```bash
bash release-tools/sign-release.sh v2.5.4 \
  dist/Bedrock-Control-PRO-v2.5.4-Release.zip \
  /SICHERER-ORT/release-private.pem
```

Genau drei Dateien als GitHub-Release-Assets veröffentlichen: ZIP, `.manifest`, `.manifest.sig`. Das Signierpaket niemals mit dem privaten Schlüssel verteilen.

## Entwicklung und Dokumentation

- [Freigabe und Testprotokoll](docs/releases/v2.5.4.md)
- [Entwicklungsnotizen zum Update-Manager](docs/development/panel-updater-v2.5.0.md)
- Quellcode: https://github.com/xDraconix/Bedrock-Control
