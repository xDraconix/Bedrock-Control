# Bedrock Control PRO

Webbasierte Installation und Verwaltung eines **Minecraft Bedrock Dedicated Servers** auf **Debian 13** (auch in Proxmox-LXC-Containern).

**Aktueller getesteter Stand: v2.4.3** · **Geplant: v2.5.0 mit Panel-Selbstupdate via GitHub Releases**

> Dieses Projekt enthält privilegierte Administrationsfunktionen. Die Weboberfläche nur in einem vertrauenswürdigen Netz bzw. über VPN erreichbar machen. Die Installation sollte zunächst auf einem Testsystem erfolgen.

## Funktionen

- Minecraft Bedrock über einen Assistenten im Webpanel installieren (auch auf einem Debian-Container ohne vorhandenen Bedrock-Server)
- Server starten, stoppen und neu starten; Live-Konsole und Journal-Protokolle
- Server-Einstellungen (`server.properties`), Welten und Add-ons verwalten
- Backups und Minecraft-Serverupdates anstoßen
- NetherNet-Verfügbarkeit über den aus `server.properties` gelesenen Port prüfen
- systemd-Watchdog mit bis zu 90 Sekunden Bereitschaftsprüfung und begrenzten Neustartversuchen
- Gezielte ACL-Leserechte für den Webserver auf `server.properties`

## Voraussetzungen

- Debian 13 mit funktionierender Internetverbindung und APT-Paketquellen
- `root`-Zugriff zur Erstinstallation
- Ausreichend Speicherplatz für Minecraft, Welten und Backups
- Freie benötigte Ports; die Weboberfläche verwendet standardmäßig **TCP 8088**, Bedrock-Spielports werden in der Serverkonfiguration festgelegt

Der Installer richtet benötigte Pakete wie Apache, PHP, Python, SCREEN und ACL ein. Ein vorhandener Minecraft-Server kann weiterverwendet werden.

## Installation

**Für v2.4.3 das vollständige Installations-ZIP verwenden**, nicht allein das automatisch von GitHub generierte „Source code“-Archiv. Die ZIP-Datei enthält den Ordner `bedrock-control-pro-v2.4.3-installer`.

```bash
unzip bedrock-control-pro-v2.4.3-installer.zip
cd bedrock-control-pro-v2.4.3-installer
bash install.sh
```

Danach im Browser öffnen:

```text
http://SERVER-IP:8088/
```

Administratorpasswort während der Installation vergeben. Wenn Minecraft noch nicht installiert ist, im angemeldeten Webpanel den Assistenten **„Minecraft einrichten“** öffnen und die gewünschten Servereinstellungen festlegen.

**Wichtig:** Ein GitHub Release mit dem offiziellen Installations-ZIP wird vorbereitet. Bis es verfügbar ist, keinen Download als offiziell voraussetzen.

## Pfade und Diagnose

| Zweck | Pfad / Befehl |
| --- | --- |
| Webpanel | `/opt/bedrock-control-pro/` |
| Weboberfläche | `/opt/bedrock-control-pro/public/` |
| Minecraft-Server | `/home/mcserver/minecraft_bedrock/` |
| Minecraft-Dienst | `mcbedrock.service` |
| Minecraft-Protokoll | `journalctl -u mcbedrock.service -n 100 --no-pager` |
| Assistenten-Protokoll | `journalctl -u bedrock-panel-setup -n 100 --no-pager` |
| Laufende Setup-Statusdateien | `/run/bedrock-panel-jobs/` |

Der Installer sichert eine vorhandene Webpanel-Installation, bevor er sie aktualisiert. Ein Minecraft-Server wird durch das Panel-Upgrade nicht absichtlich neu gestartet. Trotzdem vor größeren Änderungen ein separates Backup vorhalten.

## Sicherheit und Veröffentlichung

Keine privaten Konfigurationen, Passwort-Hashes, Weltdateien, Backups oder Schlüssel in dieses **öffentliche** Repository hochladen. Die Beispielkonfiguration `app/config/config.php.example` ist für die Veröffentlichung vorgesehen, nicht die tatsächlich verwendete Datei `/opt/bedrock-control-pro/config/config.php`.

Die Updatefunktion für das Panel ist **noch nicht implementiert**. Für Version 2.5.0 sind GitHub Releases als Updatequelle, kryptografisch geprüfte Installationspakete, Backups und Rollback vorgesehen. Eine gewöhnliche SHA-256-Datei allein beweist nicht die Authentizität eines Updates.

## Veröffentlichungen

- **v2.4.3:** Erfolgreich auf einem frischen Debian-13-Testcontainer installiert und mit webbasiertem Minecraft-Setup getestet; systemd-/NetherNet-Watchdog vereinheitlicht
- **v2.4.2:** ACL-Berechtigungen für den Apache-Zugriff auf `server.properties`
- **v2.4.1:** `mcserver`-Benutzer und Gruppe bereits vor der systemd-tmpfiles-Einrichtung anlegen
- **v2.3.5:** PHP-Session-Erkennung unabhängig von fehleranfälliger Pipe/`grep -q`-Prüfung
- **v2.3.4:** Zugriffsrechte der öffentlichen PHP-/CSS-/JS-Dateien korrigiert

Details zu v2.4.3: [Release Notes](docs/releases/v2.4.3.md).
