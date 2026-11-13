#!/usr/bin/env python3
"""Fixture tests for allowlisted system update planning (no root writes)."""
import importlib.machinery
import pathlib
import tempfile

SCRIPT=pathlib.Path(__file__).resolve().parents[1]/'system/usr-local-bin/bedrock-panel-system-plan'
mod=importlib.machinery.SourceFileLoader('system_plan',str(SCRIPT)).load_module()

def write(root,relative,data=b'#!/usr/bin/env python3\n'):
    target=root/relative
    target.parent.mkdir(parents=True,exist_ok=True)
    target.write_bytes(data)
    return target

with tempfile.TemporaryDirectory() as tmp:
    source=pathlib.Path(tmp)/'signed'
    source.mkdir()
    # Exactly the required set, which must all be present.
    for name in mod.REQUIRED:
        write(source,name)
    result=mod.plan(source)
    assert result['mode']=='plan-only'
    assert result['minecraft_untouched'] is True
    assert len(result['system_components'])==len(mod.REQUIRED)
    assert 'system/usr-local-sbin/dracorock-backup-manager' in mod.REQUIRED
    assert any(x['target']=='/usr/local/sbin/dracorock-backup-manager' for x in result['system_components'])
    assert all(x['target'].startswith(('/usr/local/','/etc/')) for x in result['system_components'])
    assert all('/home/mcserver/' not in x['target'] for x in result['system_components'])
    write(source,'system/minecraft/update-mc2.sh',b'NEVER INSTALL THIS\n')
    assert mod.plan(source)['files_count']==len(mod.REQUIRED)
    bad=write(source,'system/usr-local-sbin/bedrock-unknown-privileged-tool')
    try:
        mod.plan(source)
    except ValueError as exc:
        assert 'Nicht erlaubter' in str(exc)
    else:
        raise AssertionError('Unknown privileged helper accepted')
    bad.unlink()
    symlink=(source/'system/usr-local-sbin/bedrock-unknown-privileged-tool')
    symlink.symlink_to('/etc/passwd')
    try:
        mod.plan(source)
    except ValueError as exc:
        assert 'Symlink' in str(exc)
    else:
        raise AssertionError('Symlink accepted')
    symlink.unlink()
    (source/'system/usr-local-bin/bedrock-panel-recovery').unlink()
    try:
        mod.plan(source)
    except ValueError as exc:
        assert 'fehlen' in str(exc)
    else:
        raise AssertionError('Missing mandatory recovery component accepted')

print('OK: explicit system component allowlist, protected Minecraft files, symlinks, required recovery')
