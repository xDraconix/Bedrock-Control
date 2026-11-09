#!/usr/bin/env node
'use strict';
// Lightweight, dependency-free tests of monitoring chart data semantics.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const base=path.resolve(__dirname,'..');
const js=fs.readFileSync(path.join(base,'app/public/assets/app.js'),'utf8');
const html=fs.readFileSync(path.join(base,'app/public/index.php'),'utf8');
const start=js.indexOf('const monitorUnitValue=');
const end=js.indexOf('function updateMonitorSummaries()',start);
assert(start>=0 && end>start,'monitor formatting/statistics helpers present');
const helpers=js.slice(start,end);
const {monitorUnitValue,monitorFormat,monitorDate,monitorStats}=
 new Function(helpers+'\nreturn {monitorUnitValue,monitorFormat,monitorDate,monitorStats}')();
const data=[
 {ts:1,cpu_pct:2,ram_bytes:1073741824,players:0,samples:1},
 {ts:2,cpu_pct:null,ram_bytes:null,players:null,samples:1},
 {ts:3,cpu_pct:4,ram_bytes:2147483648,players:0,samples:2},
 {ts:4,cpu_pct:6,ram_bytes:3221225472,players:2,samples:1}
];
assert.deepEqual(monitorStats(data,'cpu_pct'),{min:2,mean:4,max:6,count:3});
assert.deepEqual(monitorStats(data,'players'),{min:0,mean:2/3,max:2,count:3});
assert.deepEqual(monitorStats([{players:null},{players:null}],'players'),null);
assert(monitorFormat(0,'players').startsWith('0'),'genuine zero must display');
assert.equal(monitorFormat(null,'players'),'–','missing player count must not display as zero');
assert.equal(monitorUnitValue(2147483648,'ram'),2);
assert(monitorFormat(2,'cpu').includes('%'));
assert(monitorDate(1794255051).includes('2026'));
for(const name of ['monitorCpuChart','monitorRamChart','monitorPlayersChart']){
 assert(html.includes('id="'+name+'"'),'chart exists '+name);
 assert(html.includes('tabindex="0"'),'keyboard-accessible canvas');
}
for(const id of ['monitorCpuSummary','monitorRamSummary','monitorPlayersSummary',
  'monitorCpuTooltip','monitorRamTooltip','monitorPlayersTooltip']){
 assert(html.includes('id="'+id+'"'),'metric element exists '+id);
}
assert(js.includes('monitorX(index,points.length,width)'), 'shared aligned x position');
assert(js.includes("canvas.addEventListener('pointermove'"), 'pointer-driven inspection');
assert(js.includes("canvas.addEventListener('keydown'"), 'keyboard inspection');
assert(js.includes("p.samples===0?'Keine Messung':'Wert nicht verfügbar'"),'missing sample semantics');
console.log('OK: monitoring chart statistics, zero/null distinctions, synchronized tooltip and keyboard hooks');
