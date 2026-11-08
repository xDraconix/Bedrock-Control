# Bedrock Control PRO v2.7.0 – Spielerverwaltung (Entwicklung)

## Funktionen (erste Ausbaustufe)

- Allowlist-Einträge aus `allowlist.json` werden ausschließlich lesend angezeigt, einschließlich Warnhinweis, wenn `allow-list=false` in `server.properties` gesetzt ist.
- Soweit Allowlist und `permissions.json` dieselbe XUID enthalten, wird der Operatorstatus zugeordnet. Bei fehlender XUID erscheint ausdrücklich „Operatorstatus nicht zuordenbar“ statt eines falschen Status.
- Spieler hinzufügen/entfernen über offizielle Bedrock-Konsolenbefehle `allowlist add` und `allowlist remove`.
- Operatorrechte über `op` und `deop` setzen bzw. entfernen, Spieler über `kick` aus der Sitzung entfernen.
- Listenausgaben über bestehende GNU-SCREEN-Konsole: `list` und `allowlist list`.
- Bestätigungsdialog für administrative Aktionen und reine Zeichenvalidierung für Gamertags gegen Zeilenumbrüche, Anführungszeichen und Befehlsinjektion.

## Einschränkungen

- Online-Spielernamen werden alle 15 Sekunden über eine **frische** `list`-Antwort aus GNU SCREEN abgefragt; bei Timeout oder unvollständiger Antwort zeigt die Oberfläche keinen veralteten Stand. Die Spielerzahl auf dem Dashboard stammt weiterhin von NetherNet.
- Die Abfrage nutzt die vorhandene Konsole, benötigt weder neue Add-ons noch einen Neustart. GNU SCREEN liefert auf dem Testserver pro Name eine eigene Zeile nach `There are N/M players online:`. Bei Formatänderungen der Bedrock-Version kann die Erkennung einen Fehler statt falscher Namen anzeigen.
- Nach einem Konsolenbefehl bestätigt das Panel nur die Übergabe an GNU SCREEN, nicht die erfolgreiche Anwendung durch Minecraft. Bei Änderungen die Live-Konsole kontrollieren.
- `permissions.json` enthält XUIDs ohne zwingende Zuordnung zum Gamertag. Ein Spieler ohne XUID kann daher durchaus Operator sein, obwohl dies die Ansicht nicht bestimmen kann.
- Die Allowlist wird erst dann zur Zugangssperre, wenn `allow-list=true` aktiv ist. Für eine Änderung dieser Servereigenschaft können weitere Schritte nötig sein.
- Vanilla Bedrock Dedicated Server unterstützt die aus Java bekannten Befehle `ban` und `pardon` nicht als verlässliche serverseitige Sperre. Die alte Auswahl wird in dieser Ansicht durch Allowlist und Operatorfunktionen ersetzt.
- Keine direkten Änderungen an `allowlist.json` oder `permissions.json`; Minecraft verwaltet seine eigenen Dateien selbst.

## Test / Release

- Branch: `feature/player-management-v2.7.0`
- APIs: `GET /?api=players-state` (Allowlist und Rollen), `GET /?api=players-online` (frische Bedrock-Konsolenantwort), bestehende authentifizierte/CSRF-geschützte `console-send`-API für Aktionen.
- Root-Konsole: `/usr/local/sbin/bedrock-console-manager players` sowie `send allowlist-add|allowlist-remove|op|deop|kick NAME`.
- Test: `python3 tests/test_player_manager.py`
- Das v2.6.0-Update-System kann den geänderten, signierten Root-Helper künftig selbst aktualisieren; für Tests auf bestehendem v2.6.0-Container ist `bash install.sh` aus dem Entwicklungsbranch möglich.
- **Nicht auf Produktion ausrollen**, bevor die Testinstanz die Bedienung mit echten Gamertags und Rollenzuordnung bestätigt.
