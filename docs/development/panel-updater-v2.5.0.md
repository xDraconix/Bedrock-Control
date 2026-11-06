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

## Implementierter Zwischenstand: v2.5.0-beta3

- Implementiert sind Ed25519-Signaturerstellung (Release-Publisher) und ein lokaler Offline-Verifier unter `/usr/local/bin/bedrock-panel-verify-release`.
- Release-ZIP und signiertes Manifest werden anhand eines **lokal separat hinterlegten** Root-eigenen öffentlichen Schlüssels überprüft. Privater Schlüssel wird niemals vom Installer verteilt.
- Der Verifier prüft außerdem SHA-256, Archivgröße und ZIP-Sicherheitskriterien (Traversal, Symlinks, Dateianzahl und Größenlimits).
- Der Webbereich meldet, ob ein GitHub Release die erwarteten Signatur-Assets enthält und ob ein vertrauenswürdiger öffentlicher Schlüssel lokal eingerichtet wurde. Eine Anzeige ist **keine erfolgte Verifikation**.
- Erfolgs- und Manipulationstest mit lokal erzeugtem Testschlüssel durchgeführt. Noch kein Test in einem Debian-13-LXC und kein Rollback-Funktionstest.
- **Kein automatisches Update freigeschaltet**. Der nächste Schritt ist ein strikt begrenzter Hintergrund-Installer mit konsistentem Backup und getestetem Rollback.
- Das neue Installations-ZIP ist noch **nicht** auf GitHub veröffentlicht; der Zweig enthält bislang diesen Entwicklungsbericht, nicht den Beta-3-Quellcode.


## Zwischenstand: v2.5.0-beta5 (Testpaket)

- Root-only CLI `bedrock-panel-update-test` mit dem Befehl `simulate-failure --confirm-test`.
- Sicherung und Verifikation werden vor dem simulierten Updatefehler ausgeführt; danach folgt automatisch ein Restore sowie die Überprüfung von PHP, Apache und HTTP 200.
- `stage TAG ZIP MANIFEST SIGNATURE` verifiziert signierte Releases und entpackt sie nur in einen isolierten Root-Stagingbereich; **keine Installation oder Ausführung**.
- Das Werkzeug ist nicht in der Apache-sudoers-Freigabe enthalten. Der Minecraft-Dienst wird nicht gestoppt oder gestartet.
- Lokale isolierte Tests: signiertes ZIP für Staging akzeptiert; absichtlich ausgelöster Fehler führt zum Snapshot-Rollback.
- **Nicht getestet**: Ablauf auf Debian 13 mit Live-Apache und die Installation eines echten signierten Release. Beides ist noch nicht freigeschaltet.
- Das Installations-ZIP liegt als Testartefakt im Chat; der neue Beta-5-Quellcode ist bislang **nicht in diesem GitHub-Zweig** veröffentlicht.

## Beta 6: signiertes lokales Panel-Upgrade

- Neues ausschließlich als `root` ausführbares Werkzeug: `bedrock-panel-apply-release install-local TAG ZIP MANIFEST SIGNATUR --confirm-update`.
- Prüft Release mit lokal verankertem Ed25519-Schlüssel, SHA-256, Archivgrößen und ZIP-Pfaden, prüft außerdem Versions-Metadaten im Paket.
- Legt verifizierte Daten im root-eigenen Staging ab, sichert die laufende Installation und prüft den Snapshot.
- Übernimmt **nur** `app/public/`, `app/set-password.php` und `VERSION`; führt **nicht** `install.sh` oder andere Shell-Dateien aus dem Release aus; keine Änderungen an Minecraft-Diensten.
- Nach dem Austausch: PHP-Lint als `www-data`, Apache-Konfigurationsprüfung, Apache-Neustart, HTTP-Funktionsprüfung und Vergleich des Minecraft-Dienststatus.
- Bei Fehler nach Änderungsbeginn: automatischer Restore des Snapshots; bei fehlgeschlagenem Restore bleibt die Snapshot-ID zur manuellen Reparatur erhalten.
- Bisher nur im isolierten Test überprüft: gültig signierte Fixture, manipuliertes ZIP abgelehnt, erfolgreicher Upgradepfad und HTTP-Fehler mit anschließendem Rollback. **Noch kein Praxistest im Debian-13-Testcontainer.**
- Bewusste Grenzen: kein Download direkt aus GitHub, kein Browser-Auslöser, keine Aktualisierung der Root-Helper/Systemd-Units über diesen Pfad, keine Garantie bei abruptem Stromausfall oder SIGKILL.
- Beta-6-Installer befindet sich zunächst als Chat-Artefakt außerhalb des GitHub-Branches; der Branch enthält weiterhin nur die Dokumentation zu Beta 6.
