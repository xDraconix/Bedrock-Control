#!/usr/bin/env python3
"""Read-only isolated CPU/RAM/player history tests (no Minecraft interaction)."""
import importlib.machinery
import json
import pathlib
import tempfile
from unittest.mock import patch

ROOT=pathlib.Path(__file__).resolve().parents[1]
mod=importlib.machinery.SourceFileLoader(
    'monitor_manager',str(ROOT/'system/usr-local-sbin/bedrock-monitor-manager')).load_module()
with tempfile.TemporaryDirectory() as tmp:
    mod.DB_DIR=pathlib.Path(tmp)/'monitor'
    mod.DB_FILE=mod.DB_DIR/'monitoring.sqlite3'
    with patch.object(mod.os,'geteuid',return_value=mod.os.geteuid()):
        with mod.storage() as db:
            a=mod.take_sample(db,1000,True,100_000_000_000,500_000_000,1)
            assert a['cpu_pct'] is None
            b=mod.take_sample(db,1060,True,130_000_000_000,550_000_000,3)
            assert b['cpu_pct']==50.0, b
            c=mod.take_sample(db,1120,True,190_000_000_000,600_000_000,None)
            assert c['cpu_pct']==100.0, c
            d=mod.take_sample(db,1180,True,100_000_000,400_000_000,2)
            assert d['cpu_pct'] is None, 'CPU counter reset after restart'
            e=mod.take_sample(db,1240,False,None,None,0)
            assert e['online'] is False
            assert e['players']==0
            hist=mod.history(db,'1h',1260)
            assert hist['interval_seconds']==60
            assert len(hist['points'])==5
            assert hist['latest']['players']==0
            assert hist['points'][2]['players'] is None, 'unavailable player counts are not fake zeros'
            assert all(p['ts']<=1260 for p in hist['points'])
            assert (mod.DB_FILE.stat().st_mode & 0o077)==0
            try:
                mod.history(db,'../../etc/passwd',1260)
            except ValueError:
                pass
            else:
                raise AssertionError('unsupported time window accepted')
        bad=mod.DB_FILE
        bad.unlink()
        bad.symlink_to('/etc/passwd')
        try:
            mod.storage()
        except ValueError:
            pass
        else:
            raise AssertionError('Symlink database accepted')
print('OK: private SQLite history, 60-second CPU deltas, gaps, restart, retention and symlinks')

class Result:
    def __init__(self,out,code=0):
        self.stdout=out
        self.stderr=''
        self.returncode=code
with patch.object(mod,'command',return_value=Result(
    'ActiveState=active\nCPUUsageNSec=188000000000\nMemoryCurrent=734003200\n')):
    assert mod.service_snapshot()==(True,188000000000,734003200)
with patch.object(mod,'command',return_value=Result('ActiveState=inactive\nCPUUsageNSec=[not set]\nMemoryCurrent=[not set]\n')):
    assert mod.service_snapshot()==(False,None,None)
with patch.object(mod,'command',return_value=Result(json.dumps({'count':3,'online':True}))):
    assert mod.online_count()==3
with patch.object(mod,'command',return_value=Result('',1)):
    assert mod.online_count() is None
print('OK: safe and nullable systemd and Minecraft data collection')

service=(ROOT/'system/systemd/bedrock-monitor.service').read_text()
timer=(ROOT/'system/systemd/bedrock-monitor.timer').read_text()
assert 'ExecStart=/usr/local/sbin/bedrock-monitor-manager sample' in service
assert 'OnUnitActiveSec=1min' in timer
assert 'WantedBy=timers.target' in timer
print('OK: persistent systemd service and timer configuration')
