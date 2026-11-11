#!/usr/bin/env python3
"""Signed bridge compatibility and monitoring timer activation tests."""
import importlib.machinery
import pathlib
import tempfile
from unittest.mock import patch

BASE=pathlib.Path(__file__).resolve().parents[1]
plan=importlib.machinery.SourceFileLoader('bridge_plan',str(BASE/'system/usr-local-bin/bedrock-panel-system-plan')).load_module()
apply=importlib.machinery.SourceFileLoader('bridge_apply',str(BASE/'system/usr-local-bin/bedrock-panel-apply-release')).load_module()
MONITOR=apply.MONITOR_TARGETS
assert MONITOR==frozenset({
 '/usr/local/sbin/bedrock-monitor-manager',
 '/etc/systemd/system/bedrock-monitor.service',
 '/etc/systemd/system/bedrock-monitor.timer'})
assert 'bedrock-monitor-manager' in plan.ALLOWED_SBIN
assert plan.FIXED['system/systemd/bedrock-monitor.service'][0] in MONITOR
assert plan.FIXED['system/systemd/bedrock-monitor.timer'][0] in MONITOR

def write(root,path):
 p=root/path
 p.parent.mkdir(parents=True,exist_ok=True)
 p.write_bytes(b'#!/usr/bin/env python3\n# fixture\n')
 return p

with tempfile.TemporaryDirectory() as tmp:
 root=pathlib.Path(tmp)/'signed'
 root.mkdir()
 for item in plan.REQUIRED:
  write(root,item)
 old=plan.plan(root)
 assert not apply.monitoring_install_required(old['system_components'])
 assert not any(e['target'] in MONITOR for e in old['system_components'])
 write(root,'system/usr-local-sbin/bedrock-monitor-manager')
 try:
  apply.monitoring_install_required(plan.plan(root)['system_components'])
 except apply.UpgradeError as exc:
  assert 'unvollständig' in str(exc)
 else:
  raise AssertionError('Partial monitoring package accepted')
 write(root,'system/systemd/bedrock-monitor.service')
 write(root,'system/systemd/bedrock-monitor.timer')
 full=plan.plan(root)
 assert apply.monitoring_install_required(full['system_components']) is True
 commands=[]
 with patch.object(apply,'cmd',side_effect=lambda *args,**kw:commands.append((args,kw))):
  assert apply.activate_monitoring_timer(full['system_components']) is True
 assert commands==[(('/usr/bin/systemctl','enable','--now','bedrock-monitor.timer'),{'timeout':45})]
 commands.clear()
 with patch.object(apply,'cmd',side_effect=lambda *args,**kw:commands.append((args,kw))):
  apply.rollback_monitoring_timer(True,False,False)
 assert [item[0][1] for item in commands]==['stop','disable']
 commands.clear()
 with patch.object(apply,'cmd',side_effect=lambda *args,**kw:commands.append((args,kw))):
  apply.rollback_monitoring_timer(True,True,True)
 assert not commands, 'Existing enabled and active timer must not be disabled'
 commands.clear()
 with patch.object(apply,'cmd',side_effect=lambda *args,**kw:commands.append((args,kw))):
  assert apply.activate_monitoring_timer(old['system_components']) is False
 assert not commands, 'Bridge must never enable monitoring'
 suspicious=write(root,'system/usr-local-sbin/bedrock-root-shell')
 try:plan.plan(root)
 except ValueError as exc:assert 'Nicht erlaubter' in str(exc)
 else:raise AssertionError('Unknown root helper allowed')
 suspicious.unlink()

bridge_files=set((BASE/'system/usr-local-sbin').glob('bedrock-monitor-manager'))
assert not bridge_files, 'v2.7.2 must not ship monitoring code or units'
assert not (BASE/'system/systemd/bedrock-monitor.service').exists()
assert not (BASE/'system/systemd/bedrock-monitor.timer').exists()
print('OK: compatible v2.7.2 bridge without monitoring; complete signed v2.8.0 timer activation and rollback')
