# Bedrock Control PRO 2.6.0 – Full-system signed update (development)

## Goal

A signed release can install **only explicitly allowlisted Bedrock Control components** in addition to the existing web assets. Never execute `install.sh` or arbitrary scripts from the signed ZIP during a web update.

**Do not deploy to production.** This branch requires real failure/rollback tests on `Minecraft-Test-2` before beta publication.

## Scope

The old updater swaps `app/public/`, `app/set-password.php` and `VERSION`. The new transactional executor extends this with:

- Exactly named `/usr/local/sbin/bedrock-*` panel helpers (fixed name allowlist)
- Exactly named `/usr/local/bin/bedrock-panel-*` helpers including updater, verifier, recovery and planner
- `/etc/systemd/system/bedrock-panel-self-update.service`
- `/etc/sudoers.d/bedrock-control-pro`
- `/etc/apache2/sites-available/bedrock-control-pro.conf`
- Project-owned `/etc/tmpfiles.d/bedrock-*.conf`
- Project PHP configuration `/etc/php/X.Y/apache2/conf.d/99-bedrock-addon-upload.ini` for the local CLI/Apache version

The protected paths include all Minecraft worlds, `server.properties`, `mcbedrock.service`, Minecraft's start/stop scripts, and `/etc/bedrock-control-pro/trusted-release-key.pem`. No operation to `systemctl restart mcbedrock.service` is permitted.

**Important:** This is not a general system/package-manager updater. Only the fixed allowlist may be changed; some installer operations remain manual.

## Order of operations

1. Root-only staging, verify Ed25519 signature, manifest SHA-256 and ZIP integrity with the *previously trusted* public key.
2. Preflight PHP syntax, installed allowlist planner, script syntax, sudoers candidate and Apache state.
3. Create and verify a read-only recovery snapshot covering all touched panel/component files and relevant units.
4. Atomically replace web assets and root component files. Changes to the updater's own executable take effect on the next invocation. Do not invoke arbitrary files from the release.
5. `systemctl daemon-reload` (**not** restart Minecraft), validate sudoers, PHP, Apache and HTTP health. Assert Minecraft service active state is identical before and after.
6. On failure, restore the **old recovery script from the snapshot**, remove newly added allowlisted files and reload unit metadata. Leave snapshot for manual recovery if rollback itself fails.

## Bootstrap caveat

The 2.5.5 updater **cannot retroactively gain system-file transaction support** merely by downloading v2.6.0; it only installs web files. Therefore **v2.6.0 must initially be installed through the audited `bash install.sh` on a test host**. Only *subsequent* signed updates executed by the 2.6.0+ updater can replace system components.

## Manual signed end-to-end failure test on the disposable container

After a successful signed v2.6.1 installation and the signed v2.6.2 intentional HTTP-503 rollback test, the latest **development source code** contains a dedicated harness to inject an error during the third root-system-component replacement. The harness loads the **new updater implementation only in memory** and invokes the full signed install/verify/snapshot/rollback transaction; the installed updater binary remains unchanged.

Do not run this on any production server. Create a fresh Proxmox snapshot first.

```bash
cd /root/Bedrock-Control
git fetch origin refs/heads/feature/full-system-updater-v2.6.0:refs/remotes/origin/feature/full-system-updater-v2.6.0
git merge --ff-only origin/feature/full-system-updater-v2.6.0
python3 tests/test_signed_update_rollback_e2e.py --confirm-fault-test /root/bedrock-update-v2.6.2 \
  2>&1 | tee /root/bedrock-mid-component-rollback-e2e.log
```

For accurate command status, run `set -o pipefail` before the piped test. The harness **requires** the original, properly signed v2.6.2 HTTP-failure fixture (not one of the tampered copies), the already-installed v2.6.1 version, healthy Apache/Minecraft and an exact development branch name. It takes the existing exclusive update lock. A simulated system-component write failure must be followed by automatic recovery, comparison of all snapshot file hashes/owners/permissions, v2.6.1 version and world-manager marker restoration, plus healthy Apache/Minecraft/HTTP. Test exits nonzero if any condition is violated.

The separate tempdir unit test `sudo python3 tests/test_system_component_rollback.py` additionally covers **newly created files** not present in the pre-update snapshot. A real E2E test with an actually newly introduced helper is still outside this test's coverage.

## Required testing before merge

- GitHub Actions syntax, fixture plan tests and signed archive build
- Live update from 2.6.0 test bootstrap to newer signed prerelease; ensure root helper versions actually update
- Induced failure during component installation, after Apache restart, and during a health check
- Snapshot integrity and automatic rollback including recovery, sudoers, Apache config, systemd unit and newly created files
- Negative tests for symlink/traversal, unknown helper names and unsigned/altered archives
- Minecraft server remains active throughout; verify world data and server config hashes before/after
- Reboot persistence of new systemd unit and retained root-only update key/channel

## Release

Remain in `feature/full-system-updater-v2.6.0` until all tests pass. Do not change `main` or publish a Stable release based only on CI results.
