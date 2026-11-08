# Bedrock Control PRO

Bedrock Control PRO verwaltet einen **Minecraft Bedrock Dedicated Server auf Debian 13** über ein lokales Webpanel. Minecraft kann auf einem frischen Debian-System direkt über das Panel installiert werden.

## Version

**2.5.5** – Entwicklungskandidat mit Weltseed- und Metadatenanzeige (auf Basis v2.5.4 Stable).

> Wichtig: Die Sicherheitsprüfung und der Web-Updateablauf wurden auf Testcontainern erfolgreich erprobt. Ein browsergestütztes Panel-Update aktualisiert derzeit **nur** Webdateien und Panel-Versionsdatei, nicht sämtliche Root-Helper, systemd-Units oder sudoers-Regeln. Versionswechsel mit geänderten Systemkomponenten müssen mit `bash install.sh` ausgeführt werden.

## Neue Funktion in 2.5.5

Im **Welten-Manager** werden der signierte 64-Bit-Weltseed aus Bedrocks `level.dat` sowie verfügbare Metadaten (Spielmodus, Schwierigkeit und Levelname) ausschließlich lesend angezeigt. Negative Seeds werden unterstützt und bleiben als Dezimalzeichenfolge unverändert; ein Kopieren-Button ist vorhanden. Nicht lesbare oder beschädigte Dateien werden als „Nicht verfügbar“ angezeigt. Die Funktion benötigt die aktualisierte Root-Komponente `bedrock-world-manager` und wird daher **nicht allein durch das Panel-Webupdate** installiert. Zum Testen den Entwicklungszweig auf einem Testcontainer auschecken und `bash install.sh` ausführen.

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

## Ein-Befehl-Release auf dem vertrauenswürdigen Rechner

Benötigt: Linux oder WSL, `git`, `openssl`, `unzip` und für die Veröffentlichung die [GitHub CLI](https://cli.github.com/) (`gh`). Einmalig `gh auth login` durchführen. Für die Veröffentlichung benötigt das angemeldete GitHub-Konto entsprechende Repository-Rechte.

Der **private Ed25519-Schlüssel** bleibt lokal und wird ausschließlich zum Signieren benutzt. Das Skript lädt den aktuellen `main`-Commit, prüft das zugehörige öffentliche Schlüsselpaar, baut das ZIP, signiert das Manifest und überprüft das Ergebnis.

Nur lokal vorbereiten:

```bash
bash release-tools/prepare-signed-release.sh /SICHERER-ORT/release-private.pem
```

Optional alles einschließlich GitHub-Release automatisch veröffentlichen:

```bash
bash release-tools/prepare-signed-release.sh /SICHERER-ORT/release-private.pem --publish
```

Die Veröffentlichung benötigt **eine ausdrückliche Eingabe des Versions-Tags** (beispielsweise `v2.5.5`). Wenn dieser Tag oder das Release bereits existiert, wird abgebrochen. Uploads ersetzen keine vorhandenen Dateien. Die drei Dateien werden unter `~/Bedrock-Control-Releases/vX.Y.Z/` abgelegt. Optional: `--output /ZIEL/VERZEICHNIS`.

**Hinweis:** Der lokale Build erfordert keine Veröffentlichung. Der Modus `--publish` erstellt ein öffentliches **stabiles** Release (kein Pre-Release). Er sollte erst verwendet werden, nachdem der beabsichtigte Commit freigegeben und getestet wurde. Bei fehlgeschlagenem Upload bleiben die lokal signierten Dateien erhalten; Fehler sind vor einem erneuten Versuch auf GitHub zu prüfen.

## Release für Herausgeber erstellen

Das Installationspaket wird aus einem **sauberen, geprüften Git-Commit** gebaut:

```bash
bash release-tools/build-release.sh
```

Das erzeugte Archiv `dist/Bedrock-Control-PRO-v2.5.5-Release.zip` anschließend **auf dem vertrauenswürdigen Signierrechner** signieren:

```bash
bash release-tools/sign-release.sh v2.5.5 \
  dist/Bedrock-Control-PRO-v2.5.5-Release.zip \
  /SICHERER-ORT/release-private.pem
```

Genau drei Dateien als GitHub-Release-Assets veröffentlichen: ZIP, `.manifest`, `.manifest.sig`. Das Signierpaket niemals mit dem privaten Schlüssel verteilen.

## Entwicklung und Dokumentation

- [Release Notes v2.5.5](docs/releases/v2.5.5.md)
- [Entwicklungsnotizen zum Update-Manager](docs/development/panel-updater-v2.5.0.md)
- Quellcode: https://github.com/xDraconix/Bedrock-Control
