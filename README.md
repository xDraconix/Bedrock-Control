# Bedrock Control PRO 2.4.0 – Ersteinrichtungsassistent (Testversion)

Auf einem frischen Debian 13 als root `bash install.sh` ausführen. Danach `http://SERVER-IP:8088/` öffnen, mit dem bei der Installation vergebenen Admin-Passwort anmelden und im Menü „Minecraft einrichten“ den Bedrock Dedicated Server konfigurieren und installieren.

Der Assistent verwendet den offiziellen Minecraft-Download-Endpunkt, lädt das Linux-ZIP, prüft Archivpfade und installiert einen `mcserver`-Benutzer, SCREEN-Start/Stoppskripte und `mcbedrock.service`. Fortschritt wird im Webpanel angezeigt. Die Installation kann Internetzugang und mehrere Minuten benötigen.

**Sicherheit:** Installation nur nach Login + CSRF; feste sudo-Aktion; keine freie Shell. Bestehende Minecraft-Verzeichnisse oder systemd-Dienste werden nicht überschrieben. Die Installation ist noch nicht auf einem frisch aufgesetzten Debian-13-LXC getestet. Für bestehende Server bleibt der bisherige Installationspfad erhalten.

**Hinweise:** Der Assistent akzeptiert derzeit ASCII-Zeichen in Server- und Weltnamen; Port IPv4 1024–65534, IPv6 automatisch Port+1. Der Installer stellt keine Firewall- oder Routerfreigaben ein. Setup-Logs: `journalctl -u bedrock-panel-setup -n 100 --no-pager`; Statusdateien: `/run/bedrock-panel-jobs/`.

# Bedrock Control PRO 2.3.2 – automatische Abhängigkeiten

Basierend auf dem vollständigen Installationspaket 2.3.0; sämtliche Anwendungsfunktionen bleiben unverändert. Neu ist die automatische Installation der Debian-Abhängigkeiten über `apt-get update` und `apt-get install -y --no-install-recommends`.

Installierte Pakete: `apache2`, `libapache2-mod-php`, `php-cli`, `php-common`, `python3`, `sudo`, `zip`, `unzip`, `curl`, `screen`, `procps`, `ca-certificates`.

## Installation

```bash
unzip bedrock-control-pro-v2.3.2-auto-dependencies-installer.zip
cd bedrock-control-pro-v2.3.2-installer
bash install.sh
```

**Voraussetzungen, die bewusst nicht automatisch eingerichtet werden:** eine vorhandene Bedrock-Installation unter `/home/mcserver/minecraft_bedrock` einschließlich `server.properties`, der Benutzer `mcserver` und der systemd-Dienst `mcbedrock.service`. Das Paket ist kein Minecraft-Server-Neuinstaller.

Auf einem frischen Debian-Container benötigt APT funktionierende Paketquellen und Netzwerkzugriff. Der Installer muss als `root` ausgeführt werden. Bei Paketfehlern bricht er vor Änderungen an der Webanwendung ab. Eine bestehende Webanwendung wird weiterhin gesichert. Minecraft wird nicht automatisch neugestartet.

**PHP-Sonderfall:** Bei manuell installierten PHP-Versionen (z. B. PHP 8.4 aus einem Fremd-Repository) müssen CLI- und Apache-PHP-Version zueinander passen. Das Skript prüft dies und bricht bei einem Versionskonflikt mit Diagnose ab, statt willkürlich PHP-Versionen umzustellen.

**Sicherheit:** Der Installer nutzt reguläre Debian-Paketquellen und aktiviert die bestehende Apache-Site auf Port 8088. Auf öffentlich erreichbaren Systemen den Zugriff auf das Administrationspanel zusätzlich per Firewall/VPN einschränken.

---

# Bedrock Control PRO 2.3.0

Upgrade von 2.2.0. Neuer Menüpunkt **Server-Einstellungen** mit Formularfeldern für vorhandene Einträge in `server.properties`. Werte werden serverseitig geprüft; Kommentare und unbekannte Einträge bleiben erhalten. Vor dem Speichern wird eine Sicherung `server.properties.backup-*` erstellt. Optimistische Konfliktkontrolle über SHA-256; kein automatischer Minecraft-Neustart.

Installation als root: `bash install.sh`. Der Installer sichert die vorhandene Anwendung. Bestehende Welten, Watchdog und Dienste bleiben erhalten.

**Hinweis:** Werte in `server.properties` können versionsabhängig sein. Unbekannte Optionen werden als Text angezeigt; der Editor fügt keine neuen Optionen hinzu.

# Bedrock Control PRO 2.2.0 – Milestone Release

**Stabiler Funktionsstand von Version 1.8.5.** Dies ist bewusst ein reines Versions- und Dokumentationsrelease: keine neuen Funktionen und keine Änderungen an der Serversteuerung oder am NetherNet-Watchdog.

## Installation

Als `root` auf dem Minecraft-Debian-Container:

```bash
unzip bedrock-control-pro-v2.2.0-installer.zip
cd bedrock-control-pro-v2.2.0-installer
bash install.sh
```

Die vorhandene Webanwendung wird unter `/root/bedrock-control-pro-preinstall-...` gesichert. Die bestehende Konfiguration und das Administratorpasswort bleiben erhalten. Minecraft wird durch den Installer nicht neu gestartet.

## Umfang des Meilensteins

- Server starten, stoppen und neustarten über Hintergrundaufträge
- Statusanzeige einschließlich NetherNet-Bereitschaft
- Bestehender systemd-NetherNet-Watchdog bleibt unverändert
- Minecraft-Update- und Backup-Manager
- Welten auswählen, vorbereiten, importieren und als ZIP oder `.mcworld` exportieren
- Lesbare Exportdateinamen mit Weltname und Zeitstempel
- Add-on-Manager, Live-Konsole, Spielerverwaltung und Protokolle

## Welten-Downloads


Im Welten-Manager hat jede Welt zwei Export-Buttons: **ZIP** (Weltordner enthalten) und **.mcworld** (Weltdateien direkt im Archivwurzelverzeichnis). Der Export läuft als `systemd-run`-Hintergrundauftrag. Die Oberfläche zeigt den Status und startet nach erfolgreicher Komprimierung den authentifizierten Download.

**Wichtig:** Minecraft muss vor dem Export gestoppt sein. Dies ist erforderlich, damit LevelDB-Dateien nicht während des Packens verändert werden. Der Export stoppt Minecraft **nicht** automatisch. Beim Export wird vor und nach dem Archivieren geprüft, dass Minecraft gestoppt ist. Für strikte Konsistenz sollte Minecraft während der Archivierung nicht parallel manuell gestartet werden.

Archivgröße: maximal 2 GiB unkomprimierte Quelldaten, maximal 30.000 Dateien. Archive werden nicht im Webroot gespeichert, sondern unter `/var/lib/bedrock-panel/exports/` und sind nur für root und die Apache-Gruppe lesbar. Der Download ist nur nach Anmeldung im Dashboard möglich. Ältere Archive werden beim nächsten Export nach 24 Stunden bereinigt.

### Fehlerdiagnose

```bash
journalctl -u 'bedrock-world-export-*' --no-pager -n 80
ls -lh /var/lib/bedrock-panel/exports/
```

Die bisherige systemd-Konfiguration einschließlich NetherNet-Watchdog bleibt unverändert.


## Releasehinweis

Version 2.2.0 übernimmt den funktionierenden Stand von 1.8.5. Aktualisiert wurden die Versionsdatei, die Cache-Versionen der Web-Assets, die sichtbare Versionsangabe im Footer und die Dokumentation. Das bestehende Start-/Stoppskript wird vom vollständigen Installer wie bisher gesichert und erneut installiert; bei laufendem Minecraft erfolgt kein automatischer Neustart.

Die vollständige Funktion auf deinem Debian-Server lässt sich erst nach Installation überprüfen.

## 2.2.0 – Minecraft-inspirierte Optik
- Stein-/Gras-Farbwelt und kantigere Komponenten
- Statusfarben: grün (online), gelb (startet/NetherNet nicht bereit), rot (offline/failed)
- Serverdaten als übersichtliche Kacheln, mit server.properties als Fallback
- Keine Änderungen an Steuerung, Watchdog, Welten, Updates oder Exporten

## 2.2.0 – Systemübersicht

- Neue Ressourcenkacheln: RAM-Gesamtwert, RAM-Verbrauch mit Auslastungsbalken, verfügbare CPU-Kapazität, sichtbare logische CPUs, Laufzeit und Load Average.
- Berücksichtigt unter cgroup v2 (Debian LXC) nach Möglichkeit `memory.max`, `memory.current`, `cpu.max` und `cpuset.cpus.effective`. Ohne Container-Limit erfolgt ein Fallback auf `/proc`.
- CPU-Kapazität ist **kein** CPU-Auslastungswert. Load Average ist kein CPU-Prozentwert. Die Werte aus `/proc` können bei LXC hostweit statt containerspezifisch sein.
- Technische systemd-Daten bleiben ausklappbar erhalten.
- Kein Eingriff in Startskripte, Watchdog, Minecraft-Daten oder bestehende Hintergrundjobs.


## Version 2.3.2 – Journal-Berechtigungen

Der Installer fügt den Apache-Benutzer `www-data` mit `usermod -aG` zur
Gruppe `systemd-journal` hinzu, ohne bestehende Gruppen zu ersetzen.
Anschließend wird Apache neu gestartet (kein bloßes Reload), damit die
Gruppenmitgliedschaft für neue Prozesse wirksam wird. Der Zugriff wird
mit `runuser -u www-data -- journalctl -n 1 --no-pager -q` geprüft.
Minecraft selbst wird nicht neu gestartet.

Die Mitgliedschaft in `systemd-journal` erlaubt `www-data`, sämtliche
Systemjournale zu lesen, nicht nur die Minecraft-Protokolle. Dies ist
eine bewusst erweiterte Leseberechtigung.


## v2.3.5: Dynamischer NetherNet-Port

- Dashboard liest `server-port` bei jedem Statusabruf aus `server.properties`.
- Fehlende, unlesbare oder ungültige Konfiguration wird als konkreter Fehler angezeigt.
- Kein stiller Rückfall auf den falschen Port 19132.
- Ein vorhandener `bedrock-nethernet-check` wird gesichert und auf dynamische Port-Erkennung umgestellt.
- Fehlt der Watchdog, wird er nicht ungefragt als neue systemd-Überwachung aktiviert.
- Installationsroutine und alle bisherigen Funktionen bleiben erhalten.

## 2.3.5: Webdatei-Berechtigungen

Nach dem Kopieren setzt der Installer ausschließlich im Verzeichnis `public/` die Eigentümergruppe auf `www-data`, Verzeichnisse auf `0750` und Dateien auf `0640`. Der Zugriff auf `index.php` und alle öffentlichen Dateien wird als `www-data` geprüft; außerdem wird `php -l` ausgeführt. Private Konfigurationsdateien außerhalb von `public/` bleiben von dieser Korrektur unberührt.


### Änderung in 2.3.5
Die PHP-Session-Prüfung verwendet `extension_loaded("session")` statt `php -m | grep -q`, um Pipeline-/SIGPIPE-Fehler bei `set -o pipefail` zu vermeiden.


## 2.4.2: Berechtigungen nach Web-Installation
- Das Paket `acl` wird automatisch installiert.
- `bedrock-config-access` setzt gezielte ACLs auf `/home/mcserver`, das Minecraft-Verzeichnis und `server.properties`; zusätzlich auf die Versionsdatei, falls vorhanden.
- Die Web-Installation ruft die ACL-Prüfung vor dem Minecraft-Start auf.
- Bei bestehenden Installationen repariert `install.sh` den Lesezugriff.
- Der Eigenschaften- und Welten-Manager stellen die Datei-ACL nach atomarem Austausch der Konfiguration wieder her.
- Es werden keine pauschalen Gruppenzugriffe auf Welten oder Server-Binärdateien vergeben.


## v2.4.3: NetherNet-Watchdog nach Webinstallation

- Gemeinsames Skript `/usr/local/sbin/bedrock-service-configure` für CLI-Installer und Web-Setup.
- Installiert ein systemd-Drop-in mit `ExecStartPost=/usr/local/sbin/bedrock-nethernet-check`.
- Dynamischer Port aus `server.properties`, bis zu 90 Sekunden Wartezeit.
- `Restart=on-failure`, `RestartSec=5`, `StartLimitBurst=3` innerhalb von 600 Sekunden.
- Prüft die effektive systemd-Konfiguration.
- Das Upgrade startet bestehende Minecraft-Dienste **nicht** neu. Der neue Watchdog greift beim nächsten Start.
- Falls andere Drop-ins `ExecStartPost` oder `Restart` überschreiben, meldet der Installer einen Fehler.
