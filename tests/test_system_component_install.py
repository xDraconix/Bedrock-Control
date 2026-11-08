#!/usr/bin/env python3
"""Transactional component write smoke tests in temporary directories. Run as root."""
import importlib.machinery
import os
import pathlib
import stat
import tempfile

assert os.geteuid()==0, 'Run using sudo python3'
ROOT=pathlib.Path(__file__).resolve().parents[1]
module=importlib.machinery.SourceFileLoader(
    'apply_release',str(ROOT/'system/usr-local-bin/bedrock-panel-apply-release')).load_module()
# No real systemd change or Apache restart in this isolated unit test.
module.cmd=lambda *args, **kwargs: None

with tempfile.TemporaryDirectory() as directory:
    work=pathlib.Path(directory)
    installer=work/'signed-installer'
    (installer/'system/usr-local-sbin').mkdir(parents=True)
    target_dir=work/'live'
    target_dir.mkdir()
    source=installer/'system/usr-local-sbin/bedrock-world-manager'
    source.write_text('#!/usr/bin/env python3\nprint("new")\n')
    existing=target_dir/'bedrock-world-manager'
    existing.write_text('old')
    additional=target_dir/'bedrock-panel-self-update-worker'
    entries=[
        {'source':'system/usr-local-sbin/bedrock-world-manager',
         'target':str(existing),'mode':'0755'},
    ]
    added=[]
    module.install_system_files(installer,entries,added)
    assert 'print("new")' in existing.read_text()
    assert stat.S_IMODE(existing.stat().st_mode)==0o755
    assert existing.stat().st_uid==0
    assert not added, 'Existing components must not be treated as newly added'
    symlink=target_dir/'bedrock-wrong'
    symlink.symlink_to('/etc/passwd')
    try:
        module.install_system_files(installer,[{'source':entries[0]['source'],
            'target':str(symlink),'mode':'0755'}],added)
    except module.UpgradeError:
        pass
    else:
        raise AssertionError('Symlink replacement was accepted')
    assert symlink.is_symlink()
    entries[0]['target']=str(additional)
    module.install_system_files(installer,entries,added)
    assert additional.read_bytes()==source.read_bytes()
    assert added==[additional],added

print('OK: atomic component replacement, root permissions, new-file tracking, symlink rejection')
