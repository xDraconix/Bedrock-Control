#!/usr/bin/env python3
"""Fault-injection tests for a partial root-component update.

Everything runs in a TemporaryDirectory; no Minecraft or live root files.
Run as root because the installed updater always owns system files as root.
"""
import importlib.machinery
import os
from pathlib import Path
import tempfile

assert os.geteuid()==0, 'Run as root'
ROOT=Path(__file__).resolve().parents[1]
updater=importlib.machinery.SourceFileLoader(
    'component_update', str(ROOT/'system/usr-local-bin/bedrock-panel-apply-release')
).load_module()
updater.cmd=lambda *args,**kwargs: None

with tempfile.TemporaryDirectory(prefix='bedrock-rollback-test-') as tmp:
    root=Path(tmp)
    src=root/'signed/system/usr-local-sbin'
    src.mkdir(parents=True)
    live=root/'live'
    live.mkdir()

    existing=live/'bedrock-world-manager'
    old_content=b'#!/usr/bin/env python3\n# PRE-UPDATE\n'
    existing.write_bytes(old_content)
    os.chmod(existing,0o751)
    new_helper=live/'bedrock-test-new-component'
    failure_target=live/'bedrock-panel-control'

    (src/'new-helper').write_bytes(b'#!/usr/bin/env python3\n# NEW FILE\n')
    (src/'existing').write_bytes(b'#!/usr/bin/env python3\n# CHANGED\n')
    (src/'failure').write_bytes(b'#!/usr/bin/env python3\n# FAILURE\n')

    entries=[
        {'source':'system/usr-local-sbin/new-helper',
         'target':str(new_helper),'mode':'0755'},
        {'source':'system/usr-local-sbin/existing',
         'target':str(existing),'mode':'0755'},
        {'source':'system/usr-local-sbin/failure',
         'target':str(failure_target),'mode':'0755'},
    ]
    original_replace=updater.os.replace
    calls=[0]

    def fail_during_third_component(src,dst):
        calls[0]+=1
        if calls[0]==3:
            raise OSError('Intentional interrupted system-file exchange')
        return original_replace(src,dst)

    added=[]
    updater.os.replace=fail_during_third_component
    try:
        try:
            updater.install_system_files(root/'signed',entries,added)
        except OSError as exc:
            assert 'Intentional' in str(exc)
        else:
            raise AssertionError('Mid-transaction fault not raised')
    finally:
        updater.os.replace=original_replace

    assert calls[0]==3
    assert new_helper.exists(), 'First component should have been installed'
    assert b'CHANGED' in existing.read_bytes(), 'Second component should be installed'
    assert not failure_target.exists(), 'Failed third component must not be installed'
    assert added==[new_helper], 'Only newly installed files may be deleted on rollback'
    assert not list(live.glob('.bedrock-component-*')), 'Temp files must be cleaned up'

    # The ordinary recovery process restores files that existed in the snapshot.
    # Simulate that fixture-only restoration; then use the *real* extra-file cleanup.
    existing.write_bytes(old_content)
    os.chmod(existing,0o751)
    updater.remove_new_system_files(added)
    assert not new_helper.exists(), 'New file remains after rollback'
    assert existing.read_bytes()==old_content
    assert existing.stat().st_mode & 0o7777 == 0o751

    # A path replaced with a symlink must never be unlinked without inspection.
    new_helper.symlink_to('/etc/passwd')
    try:
        updater.remove_new_system_files([new_helper])
    except updater.UpgradeError as exc:
        assert 'Symlink' in str(exc)
    else:
        raise AssertionError('Unexpected symlink silently accepted')
    new_helper.unlink()

print('OK: midway install failure; modified component restored; new file deleted; tempfile and symlink safeguards')
