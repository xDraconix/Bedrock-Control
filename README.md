# Bedrock Control PRO 2.5.3 – signiertes Web-Update (Test-Release)

Dies ist ein Test-Release für den Web-Updater von 2.5.2-beta7. Nur auf dem Testcontainer erproben.

- Das signierte Release-ZIP wird vor dem Update geprüft.
- Der Update-Dienst sichert das bestehende Panel und installiert ausschließlich `app/public/`, `app/set-password.php` und `VERSION`.
- System-Helper, systemd-Konfiguration und Minecraft werden bei einem Web-Update nicht aktualisiert.
- Apache wird nach dem Dateiaustausch neu gestartet. Bei kontrollierten Fehlern wird zurückgerollt.
- Ein Proxmox-Snapshot vor dem ersten Test wird dringend empfohlen.
- Die Web-Oberfläche und ihre Versionsangaben werden auf 2.5.3 aktualisiert.

## Release-Dateien

Der Web-Updater erwartet im GitHub Release v2.5.3 exakt:

- `Bedrock-Control-PRO-v2.5.3-Release.zip`
- `Bedrock-Control-PRO-v2.5.3-Release.zip.manifest`
- `Bedrock-Control-PRO-v2.5.3-Release.zip.manifest.sig`

Das Manifest muss mit dem privaten Ed25519-Schlüssel signiert werden, dessen öffentlicher Schlüssel auf dem Testserver unter `/etc/bedrock-control-pro/trusted-release-key.pem` liegt.

Der private Schlüssel gehört **nicht** auf GitHub oder den Minecraft-Server.
