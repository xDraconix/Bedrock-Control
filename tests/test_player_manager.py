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
    mod.CACHE_DIR=pathlib.Path(tmp)/'cache'
    (mod.BASE/'allowlist.json').write_text(json.dumps([
        {'name':'Alex Builder','xuid':'12345','ignoresPlayerLimit':False},
        {'name':'No Xuid'},
        {'name':'Visitor','xuid':'55555'},
        {'name':'Invalid"Name','xuid':'99'},
    ]),encoding='utf-8')
    (mod.BASE/'permissions.json').write_text(json.dumps([
        {'xuid':'12345','permission':'operator'},
        {'xuid':'55555','permission':'visitor'}]),encoding='utf-8')
    (mod.BASE/'server.properties').write_text('server-name=Foo\nallow-list=true\n')
    out=io.StringIO()
    with redirect_stdout(out):
        mod.player_state()
    data=json.loads(out.getvalue())
    assert data['allowlist_enabled'] is True
    assert len(data['players'])==3
    assert next(x for x in data['players'] if x['name']=='Alex Builder')['operator'] is True
    assert next(x for x in data['players'] if x['name']=='No Xuid')['permission_known'] is False
    assert next(x for x in data['players'] if x['name']=='Visitor')['permission']=='visitor'
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


# Regression based on the actual Bedrock 1.26.63.1 list output supplied
# by the test-container operator. A line break separates each player.
sample='''[2026-11-08 14:26:36:355 INFO] There are 1/10 players online:
F4U DraconiX
allowlist add "F4U DraconiX"
[2026-11-08 14:29:41:112 INFO] Added F4U DraconiX to the allowlist
'''
parsed=mod.parse_online_list(sample)
assert parsed is not None, 'Online header not detected'
assert parsed['players']==['F4U DraconiX']
assert parsed['count']==1 and parsed['max_players']==10
assert mod.parse_online_list('[2026-11-08 14:26:36:355 INFO] There are 2/10 players online:\nF4U DraconiX\n') is None
assert mod.parse_online_list('[2026-11-08 14:26:36:355 INFO] There are 0/10 players online:\n') is not None
assert mod.parse_online_list('Some old player joined') is None
assert mod.parse_online_list('[2026-11-08 14:26:36:355 INFO] There are 1/10 players online:\nBad"name\n') is None

# A new response must be distinct from the preexisting screen history.
existing=sample+'list\n'
fresh=existing+'''[2026-11-08 15:30:08:015 INFO] There are 2/10 players online:
F4U DraconiX
Player Two
'''
assert mod.parse_online_list(fresh)['players']==['F4U DraconiX','Player Two']
assert mod.parse_online_list(existing)['response_id']!=mod.parse_online_list(fresh)['response_id']
print('OK: live player list parser rejects malformed, partial or stale responses')


# v2.7.1 regression: Bedrock permission records contain XUID and role only.
# The identity name can be resolved from allowlist.json without querying SCREEN.
with tempfile.TemporaryDirectory() as tmp:
    mod.BASE=pathlib.Path(tmp)
    permissions=[
        {'permission':'operator','xuid':'2535419664549744'},
        {'permission':'member','xuid':'2535414163148361'},
        {'permission':'operator','xuid':'2535450289183308'},
        {'permission':'operator','xuid':'2535411371068598'},
        {'permission':'member','xuid':'2535460183415229'},
    ]
    (mod.BASE/'permissions.json').write_text(json.dumps(permissions),encoding='utf-8')
    (mod.BASE/'server.properties').write_text('allow-list=false\n',encoding='utf-8')
    (mod.BASE/'allowlist.json').write_text('null',encoding='utf-8')
    with redirect_stdout(out:=io.StringIO()):
        mod.player_state()
    null_data=json.loads(out.getvalue())
    assert null_data['players']==[], 'JSON null means no allowlist entries'
    assert not any('ungültige Daten' in w for w in null_data['warnings'])
    (mod.BASE/'allowlist.json').write_text('[]',encoding='utf-8')
    with redirect_stdout(out:=io.StringIO()):
        mod.player_state()
    empty=json.loads(out.getvalue())
    assert empty['players']==[], 'without name-to-XUID mapping, permissions must not be guessed'

    entries=[
        {'name':'F4U DraconiX','xuid':'2535419664549744'},
        {'name':'Second Member','xuid':'2535414163148361'},
        {'name':'No Permission','xuid':'99999999'},
        {'name':'No Xuid'}
    ]
    (mod.BASE/'allowlist.json').write_text(json.dumps(entries),encoding='utf-8')
    with redirect_stdout(out:=io.StringIO()):
        mod.player_state()
    data=json.loads(out.getvalue())
    by_name={p['name']:p for p in data['players']}
    assert by_name['F4U DraconiX']['permission']=='operator'
    assert by_name['F4U DraconiX']['operator'] is True
    assert by_name['F4U DraconiX']['permission_known'] is True
    assert by_name['Second Member']['permission']=='member'
    assert by_name['Second Member']['operator'] is False
    assert by_name['No Permission']['permission_known'] is False
    assert by_name['No Xuid']['permission_known'] is False
    assert any('zuordenbare XUID' in w for w in data['warnings'])
    assert all('xuid' not in p and '_xuid' not in p for p in data['players'])
    assert data['allowlist_enabled'] is False, 'a saved allowlist can exist when enforcement is off'
print('OK: actual Bedrock XUID-only permissions and name-to-XUID allowlist mapping')


# Realistic console line from Bedrock 1.26.63.1, parsed only for identity.
connect='''[2026-11-08 14:25:41:839 INFO] Player connected: F4U DraconiX, xuid: 2535419664549744
[2026-11-08 14:25:47:838 INFO] Player Spawned: F4U DraconiX xuid: 2535419664549744
'''
assert mod.connection_events(connect)=={'f4u draconix':'2535419664549744'}
assert mod.connection_events(connect+'[2026-11-08 14:26:41:839 INFO] Player connected: F4U DraconiX, xuid: 1111111111111111\n')=={}
assert mod.connection_events('Player connected: Bad, xuid: 123')=={}
assert mod.connection_events('[2026-11-08 14:25:41:839 INFO] Player connected: Bad"Name, xuid: 123\n')=={}

with tempfile.TemporaryDirectory() as tmp:
    mod.BASE=pathlib.Path(tmp)
    mod.CACHE_DIR=pathlib.Path(tmp)/'cache'
    (mod.BASE/'allowlist.json').write_text(json.dumps([{
        'name':'F4U DraconiX', 'ignoresPlayerLimit':False
    }]),encoding='utf-8')
    (mod.BASE/'permissions.json').write_text(json.dumps([{
        'xuid':'2535419664549744','permission':'operator'
    }]),encoding='utf-8')
    (mod.BASE/'server.properties').write_text('allow-list=true\n',encoding='utf-8')
    with patch.object(mod,'screen_capture',return_value=connect) as capture:
        with redirect_stdout(out:=io.StringIO()):
            mod.player_state()
        first=json.loads(out.getvalue())
        assert capture.call_count==1, 'screen history scanned on first cache miss'
    assert first['players'][0]['operator'] is True
    assert first['players'][0]['permission_known'] is True
    assert all('xuid' not in p for p in first['players'])
    cachefile=mod.CACHE_DIR/'player-identities.json'
    assert json.loads(cachefile.read_text())=={'f4u draconix':'2535419664549744'}
    assert cachefile.stat().st_mode & 0o077==0
    with patch.object(mod,'screen_capture',side_effect=AssertionError('unexpected rescan')):
        with redirect_stdout(out:=io.StringIO()):
            mod.player_state()
        assert json.loads(out.getvalue())['players'][0]['operator'] is True
    assert json.loads(out.getvalue())['players'][0]['permission_known'] is True

    # Roles are always read fresh from permissions.json, never cached.
    (mod.BASE/'permissions.json').write_text(json.dumps([{
        'xuid':'2535419664549744','permission':'member'
    }]),encoding='utf-8')
    with patch.object(mod,'screen_capture',side_effect=AssertionError('unexpected rescan')):
        with redirect_stdout(out:=io.StringIO()):
            mod.player_state()
    assert json.loads(out.getvalue())['players'][0]['operator'] is False

    # Cached identity storage must not follow symlinks.
    cachefile.unlink()
    cachefile.symlink_to(mod.BASE/'permissions.json')
    with redirect_stdout(out:=io.StringIO()):
        mod.player_state()
    assert json.loads(out.getvalue())['players'][0]['permission_known'] is False
    assert any('Identitäts-Cache nicht verfügbar' in w for w in json.loads(out.getvalue())['warnings'])
    cachefile.unlink()
    (mod.BASE/'allowlist.json').write_text('[]',encoding='utf-8')
    with patch.object(mod,'screen_capture',return_value=connect):
        mod.identity_cache({'f4u draconix'})
    with redirect_stdout(out:=io.StringIO()):
        mod.player_state()
    cached=json.loads(out.getvalue())
    assert cached['players']==[]
    assert cached['identified_players']==[{'name':'f4u draconix','operator':False,
           'permission_known':True,'permission':'member','allowlisted':False}]

print('OK: Bedrock join log → secure persistent identity cache → fresh permissions with no rescan')
