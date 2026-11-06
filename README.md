# Bedrock Control PRO

Webbasiertes Verwaltungs- und Installationspanel für **Minecraft Bedrock Dedicated Server** unter **Debian 13**.

## Projektstatus

- **Letzte erfolgreich getestete Version:** 2.4.3
- **Geplant:** 2.5.0 mit integriertem Panel-Updater über GitHub Releases
- **Plattform:** Debian 13 (einschließlich Proxmox-LXC-Container)
- **Weboberfläche:** Apache und PHP

## Funktionen

- Bedrock Dedicated Server direkt über den webbasierten Einrichtungsassistenten installieren
- Minecraft starten, stoppen und neu starten
- Serverkonfiguration sowie Welten und Add-ons verwalten
- Konsole, Logs, Backups und Updates verwenden
- NetherNet-Bereitschaft dynamisch anhand von `server.properties` prüfen
- Automatische systemd-Einrichtung mit Watchdog und kontrollierten Neustarts

## Installation

Die Veröffentlichung des vollständigen, geprüften **v2.4.3-Quellcodes** und eines Installationspakets als GitHub Release wird vorbereitet. Bis dahin bitte **keine unbestätigten Release-Downloads oder fremde Installer** verwenden.

## Sicherheit

Das Panel bietet privilegierte Verwaltungsaktionen. Die Weboberfläche sollte ausschließlich über ein vertrauenswürdiges Netz oder VPN erreichbar sein. Passwortdateien, private Konfigurationen, Minecraft-Welten, Backups und Zugangsdaten gehören **nicht** in dieses Repository.

## Geplante Update-Infrastruktur (v2.5.0)

GitHub Releases dienen als Updatequelle. Release-Pakete werden vor der Installation kryptografisch verifiziert, die bestehende Installation gesichert und bei fehlgeschlagenen Prüfungen zurückgesetzt.

> Status: Die GitHub-Veröffentlichung und das automatische Panel-Update sind noch nicht abgeschlossen.
