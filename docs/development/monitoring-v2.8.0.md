# Bedrock Control PRO v2.8.0 – Live-Monitoring (Entwicklung)

## Ziel

Dauerhafte historische Servermetriken, **auch bei geschlossenem Webbrowser**, ohne Minecraft-Welten, Spielerdateien oder Add-ons zu verändern. Die v2.7.1-Produktivinstallation bleibt unangetastet.

### Architektur

- Root-eigener Sammler: `/usr/local/sbin/bedrock-monitor-manager`.
- Systemd-Units: `bedrock-monitor.service` (oneshot) und `bedrock-monitor.timer` (alle 60 Sekunden).
- SQLite-Datenbank: `/var/lib/bedrock-control-pro/monitoring.sqlite3`, root-only 0600; Verzeichnis 0700.
- Pro Erhebung: Minecraft-Dienststatus, kumulierte CPU-Nanosekunden und Dienst-RAM via `systemctl show`, Spielerzahl via vorhandene read-only `bedrock-console-manager online`-Bridge.
- CPU-Quote: Differenz kumulierter CPU-Zeit / reale Zeit, multipliziert mit 100. **100 % entspricht der vollständigen Auslastung eines CPU-Kerns**; auf mehreren Kernen kann der Wert größer als 100 % sein. Die erste Probe und ein Neustart des CPU-Zählers haben keinen zuverlässigen Delta-Wert.
- Offline: 0 Online-Spieler, RAM/CPU möglicherweise nicht verfügbar. Bei fehlgeschlagener Spielerabfrage wird ein NULL-Wert gespeichert, nicht 0.
- Automatische Aufbewahrung bis zu 30 Tagen, ohne Namen, XUIDs oder Spielerhistorie.
- Authentifizierte API: `GET /?api=monitor-history&window=1h|6h|24h|7d|30d`, maximal 450 aggregierte Zeitpunkte. `history` wird via explizit freigegebenem sudoers-Befehl ausgeführt, nur der Timer darf `sample` als root starten.
- Browser: selbst gezeichnete Canvas-Diagramme, ohne Drittanbieter-JavaScript oder externe APIs. Automatische Aktualisierung alle 60 Sekunden, **wenn Monitoring geöffnet ist**.

## Testablauf auf Minecraft-Test-2

```bash
cd /root/Bedrock-Control
git fetch origin refs/heads/feature/live-monitoring-v2.8.0:refs/remotes/origin/feature/live-monitoring-v2.8.0
git worktree add --detach /root/Bedrock-Control-v280-test refs/remotes/origin/feature/live-monitoring-v2.8.0
cd /root/Bedrock-Control-v280-test
python3 tests/test_monitoring.py
python3 -m py_compile system/usr-local-sbin/bedrock-monitor-manager
php -l app/public/index.php
```

**Für einen ersten manuellen, isolierten Test** nach einem Proxmox-Snapshot ausschließlich auf `Minecraft-Test-2`:

```bash
cd /root/Bedrock-Control-v280-test
install -m 0755 -o root -g root system/usr-local-sbin/bedrock-monitor-manager /usr/local/sbin/bedrock-monitor-manager
install -m 0644 -o root -g root system/systemd/bedrock-monitor.service /etc/systemd/system/bedrock-monitor.service
install -m 0644 -o root -g root system/systemd/bedrock-monitor.timer /etc/systemd/system/bedrock-monitor.timer
install -d -m 0700 -o root -g root /var/lib/bedrock-control-pro
install -m 0440 -o root -g root system/sudoers/bedrock-control-pro /etc/sudoers.d/bedrock-control-pro
visudo -cf /etc/sudoers.d/bedrock-control-pro
systemctl daemon-reload
systemctl enable --now bedrock-monitor.timer
systemctl start bedrock-monitor.service
/usr/local/sbin/bedrock-monitor-manager history 1h
install -m 0640 -o root -g www-data app/public/index.php /opt/bedrock-control-pro/public/index.php
install -m 0640 -o root -g www-data app/public/assets/app.js /opt/bedrock-control-pro/public/assets/app.js
install -m 0640 -o root -g www-data app/public/assets/app.css /opt/bedrock-control-pro/public/assets/app.css
```

Geprüfte Syntax, systemd-Timerstatus und Fehlerdiagnose:

```bash
systemctl status bedrock-monitor.timer bedrock-monitor.service --no-pager
journalctl -u bedrock-monitor.service -n 30 --no-pager
runuser -u www-data -- sudo -n /usr/local/sbin/bedrock-monitor-manager history 1h
```

Wenn `CPUUsageNSec` oder `MemoryCurrent` nicht verfügbar sind, zeigt der Prototyp **keine erfundenen Werte** an; vor einer Stable-Freigabe werden Container-Metrikquellen auf `Minecraft-Test-2` überprüft.

## Besondere Upgrade-Sicherheit

Die auf v2.7.1 **installierte** Signatur-Update-Allowlist kann die neuen systemd-Units und den neuen Helper **noch nicht** installieren. Eine signierte 2.8.0-Veröffentlichung darf deshalb nicht als einfaches Ein-Klick-Upgrade beworben werden, bevor ein vertrauenswürdiger Bootstrap-/Installerpfad bestätigt ist. Ein späteres 2.8.x-Release kann die erweiterte Allowlist nutzen, nachdem der neue System-Planer installiert wurde. **Nicht eigenmächtig die Root-Sicherheits-Allowlist im Produktivsystem aufweiten.**

## UI-Verbesserungen nach dem ersten Livetest (9. November 2026)

Der erste Livetest lieferte 54 Messungen innerhalb einer Stunde: **42 bestätigte Nullwerte** für die Spielerzahl, **12 fehlgeschlagene SCREEN-Abfragen** (`null`) und **keinen Wert über null**. Es war laut Betreiber tatsächlich niemand online. Null ist daher ein korrekter Messwert, `null` eine echte Abfragelücke, die auch künftig nicht zu 0 umgedeutet wird.

Die Monitoring-Grafiken wurden um folgende Funktionen erweitert:

- Gemeinsames, festes Zeitraster und identische X-Achsen-Beschriftungen für CPU, RAM und Spieler.
- Mauszeiger/Touch auf der Grafik zeigt den ausgewählten Zeitstempel und Wert an; bei aggregierten Zeiträumen wird auf Mittelwerte hingewiesen.
- Synchronisierter vertikaler Cursor über alle drei Grafiken, sodass Werte zu derselben Zeit verglichen werden können.
- Tastatursteuerung für fokussierbare Grafiken: `Pfeil links/rechts`, `Pos1`, `Ende` und `Esc`.
- Minimum, Mittelwert und Maximum je Grafik über gültige aggregierte Intervallwerte; Intervallwerte ohne Daten werden ausgeschlossen und als fehlend bezeichnet.
- Sowohl `0 Spieler` als auch `Keine Messung` und `Wert nicht verfügbar` werden korrekt unterschieden.
- Reine Frontend-Erweiterung, **keine Änderung an den gespeicherten SQLite-Daten**.

Die unabhängigen Node-Tests in `tests/test_monitoring_ui.cjs` prüfen Statistikwerte, Darstellung von 0 und NULL, die UI-Elemente und Maus-/Tastatur-Verknüpfungen.

## Offene Testpunkte

- [ ] Erster manueller Bootstrap auf dem isolierten Testcontainer
- [ ] systemd-Timer sammelt bei geschlossenem Panel über mehrere Minuten
- [ ] Tatsächliche CPU-Nanosekunden und MemoryCurrent des Containers prüfen
- [ ] 1h/24h/7d-Zeitraum und mobile Darstellung im Browser prüfen
- [ ] Sicheren Übergang aus v2.7.1 vor einem Stable-Release festlegen
