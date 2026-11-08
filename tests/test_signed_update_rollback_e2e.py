#!/usr/bin/env python3
"""One-time, deliberately destructive signed update rollback test.

ONLY for a disposable Debian test container, with a Proxmox snapshot.
The test executes the repository's *current development updater source* in
this process, but does not replace the installed updater binary by hand.

Requirements:
 - root; explicit --confirm-fault-test
 - local installed version 2.6.1; both services active; HTTP 8088 healthy
 - pre-existing, properly signed v2.6.2 rollback fixture ZIP/manifest/signature
 - checkout of feature/full-system-updater-v2.6.0
 - not allowed on a production server

Injects an OSError on the THIRD atomic system-component replacement only,
then requires that the updater's real exception handler performs a rollback.
"""
import fcntl
import hashlib
import importlib.machinery
import json
import os
from pathlib import Path
import subprocess
import sys
import zipfile

VERSION = Path('/opt/bedrock-control-pro/VERSION')
REPO = Path(__file__).resolve().parents[1]
UPDATER = REPO/'system/usr-local-bin/bedrock-panel-apply-release'
VERIFY = Path('/usr/local/bin/bedrock-panel-verify-release')
BACKUPS = Path('/var/backups/bedrock-control-pro')
TAG = 'v2.6.2'
ZIP_NAME = 'Bedrock-Control-PRO-v2.6.2-Release.zip'
FAILURE = 'BEDROCK-E2E-INTENTIONAL-THIRD-COMPONENT-FAILURE'


def check(condition, msg):
    if not condition:
        raise RuntimeError(msg)


def read_state():
    result = subprocess.run(
        ['/usr/bin/systemctl', 'is-active', 'apache2', 'mcbedrock.service'],
        check=False, capture_output=True, text=True, timeout=20)
    return result.returncode == 0 and result.stdout.splitlines() == ['active', 'active']


def check_web():
    result = subprocess.run(['/usr/bin/curl', '--fail', '--silent', '--show-error',
                             '--max-time', '10', '-o', '/dev/null',
                             'http://127.0.0.1:8088/'],
                            check=False, capture_output=True, text=True, timeout=20)
    return result.returncode == 0


def snapshot_names():
    return {p.name for p in BACKUPS.glob('snapshot-*') if p.is_dir() and not p.is_symlink()}


def sha256(path):
    hasher = hashlib.sha256()
    with path.open('rb') as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b''):
            hasher.update(chunk)
    return hasher.hexdigest()


def compare_snapshot(snapshot):
    base = BACKUPS/snapshot
    manifest = json.loads((base/'manifest.json').read_text())
    mismatches = []
    for rel, record in manifest['files'].items():
        path = Path('/')/rel
        if path.is_symlink() or not path.is_file():
            mismatches.append('Datei fehlt / Symlink: '+str(path))
        elif sha256(path) != record['sha256']:
            mismatches.append('SHA-256 unterschiedlich: '+str(path))
    for name, record in manifest['ownership'].items():
        path = Path(name)
        if not path.exists() or path.is_symlink():
            mismatches.append('Pfad fehlt / Symlink: '+str(path))
            continue
        st=path.stat()
        if (st.st_uid,st.st_gid,st.st_mode & 0o7777)!=(
                record['uid'],record['gid'],record['mode']):
            mismatches.append('Besitzer/Rechte unterschiedlich: '+str(path))
    return len(manifest['files']), mismatches


def main():
    check(os.geteuid()==0, 'Nur root darf diesen Test ausführen')
    check(len(sys.argv)==3 and sys.argv[1]=='--confirm-fault-test',
          'Aufruf: python3 tests/test_signed_update_rollback_e2e.py '
          '--confirm-fault-test /root/bedrock-update-v2.6.2')
    check(VERSION.read_text().strip()=='2.6.1',
          'Der Test erwartet vor dem Update genau die installierte Version 2.6.1')
    current_branch=subprocess.run(
        ['/usr/bin/git','-C',str(REPO),'branch','--show-current'],
        capture_output=True,text=True,check=True,timeout=15).stdout.strip()
    check(current_branch=='feature/full-system-updater-v2.6.0',
          'Nur vom geprüften Entwicklungsbranch ausführen')
    check(read_state(), 'Apache und Minecraft müssen vor dem Test aktiv sein')
    check(check_web(), 'Panel muss vor dem Test via http://127.0.0.1:8088 erreichbar sein')

    release_dir=Path(sys.argv[2]).resolve(strict=True)
    check(release_dir.is_dir() and not release_dir.is_symlink(), 'Ungültiges Release-Verzeichnis')
    assets=[release_dir/ZIP_NAME,release_dir/(ZIP_NAME+'.manifest'),
            release_dir/(ZIP_NAME+'.manifest.sig')]
    for path in assets:
        check(path.is_file() and not path.is_symlink(), 'Release-Datei fehlt: '+str(path))
    check(VERIFY.is_file() and not VERIFY.is_symlink(), 'Installierter Signaturprüfer fehlt')
    print('Prüfe zunächst das signierte Original-Testpaket ...',flush=True)
    subprocess.run([str(VERIFY),TAG,*map(str,assets)],check=True,timeout=180)
    with zipfile.ZipFile(assets[0]) as archive:
        base='bedrock-control-pro-2.6.2-installer/'
        php=archive.read(base+'app/public/index.php')
        world=archive.read(base+'system/usr-local-sbin/bedrock-world-manager')
        check(b'ROLLBACK TEST ONLY: force the updater' in php,
              'Falsches Paket: erwarteter v2.6.2-Fehlertest fehlt')
        check(b'ROLLBACK TEST ONLY: v2.6.2 candidate marker' in world,
              'Falsches Paket: Root-Helper-Testmarker fehlt')

    module=importlib.machinery.SourceFileLoader('bedrock_dev_updater',str(UPDATER)).load_module()
    check(callable(getattr(module,'remove_new_system_files',None)),
          'Entwicklungsversion muss neue Datei-Bereinigung enthalten')
    lock_path=module.LOCK
    lock_path.parent.mkdir(parents=True,exist_ok=True)
    fd=os.open(lock_path,os.O_RDWR|os.O_CREAT|os.O_NOFOLLOW,0o600)
    try:
        fcntl.flock(fd,fcntl.LOCK_EX|fcntl.LOCK_NB)
        before_snapshots=snapshot_names()
        check(VERSION.read_text().strip()=='2.6.1', 'Version vor Transaktion abweichend')
        original_replace=module.os.replace
        writes=[0]

        def injected_replace(source,target):
            source_path=Path(source)
            target_path=Path(target)
            # Restrict injection to a root helper/config staging file.
            if source_path.name.startswith('.bedrock-component-'):
                check(str(target_path).startswith(('/usr/local/bin/','/usr/local/sbin/',
                      '/etc/apache2/','/etc/systemd/','/etc/sudoers.d/','/etc/tmpfiles.d/','/etc/php/')),
                      'Unerwartetes Updateziel')
                writes[0]+=1
                if writes[0]==3:
                    print('TEST: Simuliere Fehler vor Systemdatei-Austausch Nr. 3',flush=True)
                    raise OSError(FAILURE)
            return original_replace(source,target)

        # os is a process-global Python module. Always restore monkeypatch in finally.
        module.os.replace=injected_replace
        failure=None
        try:
            module.install(TAG,*assets)
        except OSError as exc:
            failure=exc
        finally:
            module.os.replace=original_replace
        check(failure is not None and FAILURE in str(failure),
              'Kein kontrollierter Abbruch beim dritten Komponententausch')
        check(writes[0]==3, 'Nicht genau beim dritten Komponententausch abgebrochen')
        new_snapshots=snapshot_names()-before_snapshots
        check(len(new_snapshots)==1,
              'Erwarte genau einen frischen Wiederherstellungs-Snapshot')
        snap=new_snapshots.pop()
        count,mismatches=compare_snapshot(snap)
        check(not mismatches,
              'ROLLBACK-ABWEICHUNGEN: '+'; '.join(mismatches[:12]))
        check(VERSION.read_text().strip()=='2.6.1',
              'Panel-Version nach Rollback nicht wiederhergestellt')
        check(b'Signed system-update fixture: v2.6.1' in
              Path('/usr/local/sbin/bedrock-world-manager').read_bytes(),
              'Root-Helper nach Rollback nicht wiederhergestellt')
        check(read_state() and check_web(),
              'Apache oder Minecraft oder HTTP-Panel nach Rollback nicht gesund')
        print('OK: Rollback nach Systemdateitausch Nr. 3 erfolgreich.',flush=True)
        print('OK: '+str(count)+' gesicherte Dateien sowie Eigentümer/Rechte identisch.',flush=True)
        print('OK: Version 2.6.1, Root-Helper, Apache, Minecraft und Webpanel.',flush=True)
        print('Recovery-Snapshot: '+snap,flush=True)
    finally:
        os.close(fd)


if __name__=='__main__':
    try:
        main()
    except (OSError,RuntimeError,ValueError,subprocess.CalledProcessError,
            subprocess.TimeoutExpired,BlockingIOError,KeyError,zipfile.BadZipFile) as error:
        print('TEST FEHLGESCHLAGEN: '+str(error),file=sys.stderr,flush=True)
        print('Bitte KEIN weiteres Update starten; Sicherung/Proxmox-Snapshot prüfen.',file=sys.stderr)
        sys.exit(1)
