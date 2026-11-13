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
const interpolateStart=js.indexOf('function monitorDisplayValues(points,key)');
const interpolateEnd=js.indexOf('function monitorChartColor(',interpolateStart);
assert(interpolateStart>=0 && interpolateEnd>interpolateStart);
const interpolateSource=js.slice(interpolateStart,interpolateEnd);
const monitorDisplayValues=new Function(interpolateSource+'\nreturn monitorDisplayValues')();
const isolated=[
 {ts:0,cpu_pct:2,players:0},
 {ts:60,cpu_pct:null,players:null},
 {ts:120,cpu_pct:4,players:0}
];
assert.deepEqual(monitorDisplayValues(isolated,'cpu_pct'),[2,3,4]);
assert.deepEqual(monitorDisplayValues(isolated,'players'),[0,0,0],'zero / unknown / zero displays a zero estimate');
assert.equal(isolated[1].cpu_pct,null,'original sample stays unchanged');
assert.deepEqual(monitorStats(isolated,'cpu_pct'),{min:2,mean:3,max:4,count:2},'statistics exclude estimated points');
assert.deepEqual(monitorDisplayValues([
 {ts:0,cpu_pct:2},{ts:60,cpu_pct:null},{ts:120,cpu_pct:null},{ts:180,cpu_pct:8}
],'cpu_pct'),[2,null,null,8],'long gaps must remain gaps');
assert.deepEqual(monitorDisplayValues([
 {ts:0,cpu_pct:2},{ts:60,cpu_pct:null},{ts:300,cpu_pct:8}
],'cpu_pct'),[2,null,8],'non-uniform timeline must not interpolate');
assert.deepEqual(monitorDisplayValues([
 {ts:0,players:null},{ts:60,players:0},{ts:120,players:null}
],'players'),[null,0,null],'do not extrapolate endpoints');
assert(js.includes('(geschätzt)'), 'hover tooltip must disclose interpolation');

assert(js.includes('monitorX(index,points.length,width)'), 'shared aligned x position');
assert(js.includes("canvas.addEventListener('pointermove'"), 'pointer-driven inspection');
assert(js.includes("canvas.addEventListener('keydown'"), 'keyboard inspection');
assert(js.includes("p.samples===0?'Keine Messung':'Wert nicht verfügbar'"),'missing sample semantics');
console.log('OK: monitoring chart statistics, zero/null distinctions, synchronized tooltip and keyboard hooks');

assert(html.includes('id="dashboardAlerts"'),'dashboard must contain the alert summary');
const overviewMarkup=html.slice(html.indexOf('<section id="overview"'),html.indexOf('<section id="monitor"'));
assert(overviewMarkup.includes('class="cols overview-controls"'),'dashboard has compact controls row');
const cardOrder=[
 overviewMarkup.indexOf('<h2>Serversteuerung</h2>'),
 overviewMarkup.indexOf('<h2>Serverwarnungen</h2>'),
 overviewMarkup.indexOf('<h2>Update & Sicherung</h2>')
];
assert(cardOrder[0]>=0&&cardOrder[0]<cardOrder[1]&&cardOrder[1]<cardOrder[2],
 'server warnings card sits between server controls and backup/update');
const css=fs.readFileSync(path.join(base,'app/public/assets/app.css'),'utf8');
assert(css.includes('#overview .overview-controls'),'responsive grid styles scoped to overview');
assert(css.includes('grid-template-columns:minmax(0,1.2fr) minmax(0,0.85fr) minmax(0,1.2fr)'),
 'desktop 3-column layout with narrower middle card');
assert(css.includes('@media(max-width:1150px)'),'responsive stacking breakpoint');
assert(css.includes('margin-top:0;'),'avoid double gap after metric cards');
assert(css.includes('margin-bottom:18px;'),'restore gap before server information cards');


assert(html.includes('id="dashboardAlertsDetail"'),'dashboard should link to detailed monitoring');
assert(js.includes("async function loadDashboardAlerts()"),'dashboard polls existing history endpoint');
assert(js.includes("api('monitor-history&window=1h')"),'dashboard uses authenticated monitoring API');
assert(js.includes("if(a.dataset.tab==='overview')loadDashboardAlerts()"),'dashboard reloads on navigation');
assert(js.includes("if(!$('app').hidden&&!$('overview').hidden)loadDashboardAlerts()"),'dashboard only polls while visible');
assert(js.includes("description.textContent=alert.message"),'dashboard alerts must not render HTML');
console.log('OK: overview alert summary, safe rendering and visible-only polling');
