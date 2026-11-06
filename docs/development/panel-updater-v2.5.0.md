# Bedrock Control PRO 2.5.0 – Panel-Updater

## Entwicklungszweig

Dieses Dokument gehört zum Entwicklungszweig `feature/panel-updater-v2.5.0`. Die stabile Version auf `main` bleibt v2.4.3.

## Phase 1: GitHub-Release-Prüfung (lokale Testversion v2.5.0-beta1)

Ein vorbereitetes Installer-ZIP steht zunächst als ChatGPT-Testartefakt zur Verfügung; **sein Quellcode wurde noch nicht auf diesen Zweig übertragen**.

- Neue, separat erreichbare Ansicht **Panel-Updates**; Minecraft-Updates bleiben unverändert.
- Nur nach Anmeldung zugängliche `GET ?api=panel-release`-Schnittstelle.
- Abfrage ausschließlich des festen GitHub-Repositories `xDraconix/Bedrock-Control` über HTTPS.
- Nur stabile, veröffentlichte Releases mit numerischen `vX.Y.Z`-Tags.
- Vergleich mit der lokal installierten VERSION-Datei.
- Release Notes, Versionsstand und Release-URL im Webpanel anzeigen.
- Kein Download und **keine Ausführung** von Release-Code über die API.

## Phase 2: Signierte Veröffentlichungen

- Herausgeber-Schlüssel **außerhalb** des Webpanels erzeugen und privat halten.
- Den öffentlichen Prüfschlüssel im Panel-Installer verankern.
- Das Release-ZIP samt SHA-256-Digest mit diesem Schlüssel signieren.
- Release-Metadaten und Datei-Hash mit signierter Manifestdatei binden.
- Prüfen, dass der Signatur-Schlüssel und die signierte Version zum erwarteten Release passen.
- Bestehende Release-Assets von v2.4.3 sind bisher nur durch SHA-256 dokumentiert, **nicht signiert**.

## Phase 3: Kontrollierte Installation

- Benutzerbestätigung, CSRF und strikt begrenzter Root-Helper.
- ZIP herunterladen, begrenzen und gegen Zip-Slip, Symlinks und Archivbomben schützen.
- Signatur und Hash **vor** Entpacken und Installation prüfen.
- Panel-Konfiguration, Webdateien, Hilfsskripte, Units und Berechtigungen konsistent sichern.
- Prüfen und installieren, mit Fortschrittsprotokoll und Rollback bei Fehlern.
- Minecraft selbst sowie Welten und Add-ons werden nicht verändert oder neu gestartet.
- Fehlgeschlagene Updates dürfen nicht in einer Schleife wiederholt werden.

## Testplan

1. Erste Versionsabfrage bei installiertem Beta-Panel liefert stabiles Release v2.4.3.
2. Offline / GitHub-Rate-Limit erzeugt verständliche Fehlermeldung ohne Server-Auswirkungen.
3. Ungültige Release-Daten, nicht vertrauenswürdige Assets und fehlende Prüfsummen werden abgelehnt.
4. Für Phase 3 zusätzlich erfolgreicher Update-Test und erzwungener Rollback im Debian-13-Testcontainer.
