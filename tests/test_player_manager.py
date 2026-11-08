#!/usr/bin/env python3
"""Isolated tests for player management; never talks to a Minecraft server."""
import importlib.machinery
import io
import json
import pathlib
import tempfile
from contextlib import redirect_stdout
from unittest.mock import patch

root=pathlib.Path(__file__).resolve().parents[1]
mod=importlib.machinery.SourceFileLoader(
    'console_manager',str(root/'system/usr-local-sbin/bedrock-console-manager')).load_module()

with tempfile.TemporaryDirectory() as tmp:
    mod.BASE=pathlib.Path(tmp)
    (mod.BASE/'allowlist.json').write_text(json.dumps([
        {'name':'Alex Builder','xuid':'12345','ignoresPlayerLimit':False},
        {'name':'No Xuid'},
        {'name':'Invalid"Name','xuid':'99'},
    ]),encoding='utf-8')
    (mod.BASE/'permissions.json').write_text(json.dumps([
        {'xuid':'12345','permission':'operator'}]),encoding='utf-8')
    (mod.BASE/'server.properties').write_text('server-name=Foo\nallow-list=true\n')
    out=io.StringIO()
    with redirect_stdout(out):
        mod.player_state()
    data=json.loads(out.getvalue())
    assert data['allowlist_enabled'] is True
    assert len(data['players'])==2
    assert next(x for x in data['players'] if x['name']=='Alex Builder')['operator'] is True
    assert next(x for x in data['players'] if x['name']=='No Xuid')['permission_known'] is False
    assert all('xuid' not in x for x in data['players'])
    (mod.BASE/'allowlist.json').unlink()
    (mod.BASE/'allowlist.json').symlink_to('/etc/passwd')
    out=io.StringIO()
    with redirect_stdout(out):
        mod.player_state()
    data=json.loads(out.getvalue())
    assert not data['players']
    assert data['warnings']

sent=[]
class FakeResult:
    returncode=0
    stderr=''
def fake_screen(*args):
    sent.append(args)
    return FakeResult()

with patch.object(mod,'screen',fake_screen),patch.object(mod.subprocess,'run',return_value=FakeResult()):
    for kind,value,expected in [
        ('allowlist-add','Alex Builder','allowlist add "Alex Builder"\r'),
        ('allowlist-remove','Alex Builder','allowlist remove "Alex Builder"\r'),
        ('op','Steve','op "Steve"\r'),
        ('deop','Steve','deop "Steve"\r'),
        ('kick','Steve','kick "Steve"\r'),
        ('allowlist-list','','allowlist list\r'),
    ]:
        sent.clear()
        with patch.object(mod.sys,'argv',['bedrock-console-manager','send',kind,value]):
            with redirect_stdout(io.StringIO()):
                mod.main()
        assert sent[-1][-1]==expected,(kind,sent)
    for value in ['Bad"Name','Bad\nName','../etc/passwd','  padded','Steve;stop']:
        with patch.object(mod.sys,'argv',['bedrock-console-manager','send','op',value]):
            try:
                with redirect_stdout(io.StringIO()):
                    mod.main()
            except ValueError:
                pass
            else:
                raise AssertionError('Invalid name accepted: '+repr(value))
print('OK: roster/permissions mapping, symlink protection and safe Bedrock player commands')
