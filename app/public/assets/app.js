'use strict';let csrf='',busy=false;const $=id=>document.getElementById(id);const txt=(id,value)=>{$(id).textContent=value??'–'};async function api(path,opts={}){const r=await fetch('?api='+path,{credentials:'same-origin',cache:'no-store',...opts});const d=await r.json();if(!r.ok)throw Error(d.error||d.message||'Anfrage fehlgeschlagen');return d}let noticeTimer=null;
function showNotice(s,bad=false,persistent=false){const el=$('notice');if(noticeTimer)clearTimeout(noticeTimer);el.hidden=false;el.textContent=s;el.classList.toggle('bad',bad);el.classList.toggle('pending',persistent);if(!persistent)noticeTimer=setTimeout(()=>{el.hidden=true;noticeTimer=null},bad?12000:7000)}
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function awaitJob(name,jobId){
 const deadline=Date.now()+30*60*1000;
 while(Date.now()<deadline){
  await sleep(2000);
  try{
   const d=await api('job-status&id='+encodeURIComponent(jobId));
   if(['queued','running'].includes(d.state)){showNotice(d.message||'Hintergrundauftrag läuft …',false,true);continue;}
   if(d.state==='success'){
    showNotice(d.message||'Auftrag erfolgreich abgeschlossen.');
    refreshAll();return;
   }
   showNotice(d.message||'Auftrag fehlgeschlagen. Bitte Protokoll prüfen.',true);
   refreshAll();return;
  }catch(e){
   // Temporary HTTP errors do not imply a failed background job.
  }
 }
 showNotice('Der Auftrag konnte innerhalb von 30 Minuten nicht bestätigt werden. Bitte Protokoll prüfen.',true);
}
function showApp(){ $('login').hidden=true;$('app').hidden=false;refreshAll()}function fmt(n){if(n===null||n===undefined)return '–';return (n/1073741824).toFixed(1)+' GB'}function renderServerInfo(d){
 const el=$('bedrockDetails');el.replaceChildren();
 const props=d.properties||{},b=d.bedrock||{};
 const modeNames={'0':'Survival','1':'Creative','2':'Adventure','survival':'Survival','creative':'Creative','adventure':'Adventure'};
 const val=(v)=>v===undefined||v===null||v===''?'–':String(v);
 const fields=[
  ['Servername',b.name||props['server-name'],'server'],
  ['Weltname',b.level||props['level-name'],'world'],
  ['Bedrock-Version',b.version||d.version,'version'],
  ['Spielmodus',modeNames[String(b.gameType??props.gamemode)]||props.gamemode,'mode'],
  ['Schwierigkeit',props.difficulty,'difficulty'],
  ['Spieler',b.players!==undefined?`${b.players} / ${b.maxPlayers}`:props['max-players']?`– / ${props['max-players']}`:null,'players'],
  ['Port (IPv4)',props['server-port'],'port'],
  ['Port (IPv6)',props['server-portv6'],'port'],
  ['Online-Modus',props['online-mode']==='true'?'Aktiv':props['online-mode']==='false'?'Inaktiv':null,'shield']
 ];
 for(const [label,value,kind] of fields){
  const item=document.createElement('div');item.className='server-info-item';
  const k=document.createElement('span');k.className='server-info-label';k.textContent=label;
  const v=document.createElement('strong');v.className='server-info-value';v.textContent=val(value);
  item.dataset.kind=kind;item.append(k,v);el.append(item);
 }
 if(!d.nethernet_online){
  const note=document.createElement('p');note.className='server-info-note';
  note.textContent=d.nethernet_error||('NetherNet antwortet auf Port '+(d.nethernet_port||'?')+' momentan nicht. Die Konfigurationswerte stammen aus server.properties.');
  el.append(note);
 }
}
function renderSystemMetrics(d){
 const root=$('systemInfo');root.replaceChildren();const m=d.system_metrics||{};
 const bytes=n=>Number.isFinite(n)?(n/1073741824).toLocaleString('de-DE',{maximumFractionDigits:2})+' GiB':'–';
 const number=n=>Number.isFinite(n)?n.toLocaleString('de-DE',{maximumFractionDigits:2}):'–';
 const hours=n=>Number.isFinite(n)?`${Math.floor(n/86400)} T · ${Math.floor(n%86400/3600)} Std`:'–';
 const items=[
  ['RAM verfügbar',bytes(m.ram_total),m.ram_scope||''],
  ['RAM verwendet',bytes(m.ram_used),m.ram_total&&m.ram_used!==null?`${Math.round(100*m.ram_used/m.ram_total)} % belegt`:''],
  ['CPU-Kapazität',number(m.cpu_count),'Für Container verfügbar (ggf. Quota)'],
  ['Sichtbare CPUs',number(m.cpu_physical_visible),'Logische Prozessoren'],
  ['Systemlaufzeit',hours(m.uptime_seconds),'Seit letztem Start'],
  ['Systemlast',Array.isArray(m.load_average)?m.load_average.map(number).join(' / '):'–','1 / 5 / 15 Minuten']
 ];
 for(const [label,value,detail] of items){const card=document.createElement('div');card.className='system-metric';
  const a=document.createElement('span');a.className='system-metric-label';a.textContent=label;
  const b=document.createElement('strong');b.className='system-metric-value';b.textContent=value;
  const c=document.createElement('small');c.className='system-metric-detail';c.textContent=detail;
  card.append(a,b,c);
  if(label==='RAM verwendet'&&m.ram_total>0&&Number.isFinite(m.ram_used)){
   const bar=document.createElement('div');bar.className='system-ram-track';bar.setAttribute('role','progressbar');bar.setAttribute('aria-label','RAM-Auslastung');bar.setAttribute('aria-valuemin','0');bar.setAttribute('aria-valuemax','100');const pct=Math.min(100,Math.max(0,100*m.ram_used/m.ram_total));bar.setAttribute('aria-valuenow',String(Math.round(pct)));
   const fill=document.createElement('span');fill.style.width=pct+'%';if(pct>=90)fill.classList.add('critical');else if(pct>=75)fill.classList.add('warning');bar.append(fill);card.append(bar);
  }
  root.append(card);
 }
 txt('systemTechnical',(d.service_info||'')+'\n'+(d.update_job||''));
}
async function status(){try{
 const d=await api('status');csrf=d.csrf;
 const state=d.online?(d.nethernet_online?'online':'starting'):(['activating','reloading'].includes(d.service)?'starting':d.service==='failed'?'failed':'offline');
 const names={online:'ONLINE',starting:d.online?'NET HERNET STARTET …':'STARTET …',offline:'OFFLINE',failed:'FEHLER'};
 names.starting=d.online?'INITIALISIERT …':'STARTET …';
 txt('state',names[state]);$('state').className='server-state '+state;
 txt('version',d.version);txt('updateVersion',d.version);
 txt('players',d.bedrock?d.bedrock.players+' / '+d.bedrock.maxPlayers:'– / –');
 txt('playerCount',d.bedrock?'Aktuell '+d.bedrock.players+' von '+d.bedrock.maxPlayers+' Spielern online':'Spielerzahl nicht verfügbar');
 txt('nethernet',d.nethernet_error|| (d.nethernet_online?'NetherNet erreichbar (Port '+d.nethernet_port+')':'NetherNet nicht erreichbar (Port '+(d.nethernet_port||'?')+')'));
 renderServerInfo(d);txt('disk',fmt(d.free_bytes));renderSystemMetrics(d);txt('updateInfo',d.update_job);
 const p=$('statusPill');p.textContent={online:'● Server online',starting:'● Server startet / NetherNet wartet',offline:'● Server offline',failed:'● Serverfehler'}[state];p.className='pill '+state;
 }catch(e){if(e.message==='Nicht angemeldet'){$('app').hidden=true;$('login').hidden=false;return;}showNotice(e.message,true)}
}
// Monitoring consumes only bounded, aggregated server metrics. No external chart libraries.
let monitoringBusy=false, monitoringPoints=[], monitoringWindow='24h';
const monitorDefinitions=[
 ['monitorCpuChart','cpu_pct','%','cpu'],
 ['monitorRamChart','ram_bytes','GiB','ram'],
 ['monitorPlayersChart','players','Spieler','players']
];
function drawMonitorChart(canvas,points,key,unit,metric){
 const box=canvas.getBoundingClientRect();
 const width=Math.max(240,Math.round(box.width)),height=220;
 const scale=Math.max(1,Math.min(2,window.devicePixelRatio||1));
 canvas.width=Math.round(width*scale);canvas.height=height*scale;
 const c=canvas.getContext('2d');if(!c)return;
 c.scale(scale,scale);c.clearRect(0,0,width,height);
 const dark=getComputedStyle(document.body).color;
 const color=metric==='cpu'?'#73db91':metric==='ram'?'#66b9ea':'#dfb36e';
 const left=43,right=12,top=13,bottom=29,plotW=width-left-right,plotH=height-top-bottom;
 const values=points.map(p=>Number.isFinite(p[key])?p[key]:null);
 const valid=values.filter(v=>v!==null);
 c.font='12px system-ui,sans-serif';c.fillStyle=dark;
 if(!valid.length){c.fillText('Noch keine Messwerte verfügbar',left,Math.round(height/2));return}
 const numericValid=valid.map(v=>metric==='ram'?v/1073741824:v);
 const observedMax=Math.max(...numericValid);
 const ceiling=metric==='players'?Math.max(1,Math.ceil(observedMax)):Math.max(metric==='cpu'?1:0.1,Math.ceil(observedMax*1.3*10)/10);
 const steps=metric==='players'?Math.min(4,Math.ceil(ceiling)):4;
 const yFor=v=>top+plotH-(metric==='ram'?v/1073741824:v)/ceiling*plotH;
 c.globalAlpha=.23;c.strokeStyle=dark;c.lineWidth=1;
 for(let i=0;i<=steps;i++){const y=top+plotH*i/steps;c.beginPath();c.moveTo(left,y);c.lineTo(width-right,y);c.stroke()}
 c.globalAlpha=.85;c.fillStyle=dark;
 for(let i=0;i<=steps;i++){
  const v=ceiling*(steps-i)/steps;
  const label=metric==='players'?v.toLocaleString('de-DE',{maximumFractionDigits:0}):v.toLocaleString('de-DE',{maximumFractionDigits:1});
  c.fillText(label,2,top+plotH*i/steps+4);
 }
 if(points.length>0){const tickCount=Math.min(4,points.length-1);for(let i=0;i<=tickCount;i++){const idx=Math.round(i*(points.length-1)/Math.max(1,tickCount));const ts=points[idx].ts;const label=new Date(ts*1000).toLocaleString('de-DE',{month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'});const x=left+(idx/Math.max(1,points.length-1))*plotW;c.fillText(label,Math.max(left,Math.min(width-95,x-28)),height-6)}}
 c.globalAlpha=1;c.strokeStyle=color;c.lineWidth=2.2;c.lineJoin='round';c.lineCap='round';
 let open=false;
 values.forEach((v,i)=>{if(v===null){open=false;return}const x=left+(i/Math.max(1,values.length-1))*plotW,y=yFor(v);if(!open){c.beginPath();c.moveTo(x,y);open=true}else c.lineTo(x,y);const next=values[i+1];if(next===null||i===values.length-1){c.stroke();open=false}});
}
function redrawMonitoring(){
 for(const [id,key,unit,metric] of monitorDefinitions)drawMonitorChart($(id),monitoringPoints,key,unit,metric);
}
async function loadMonitoring(){
 if(monitoringBusy)return;
 monitoringBusy=true;txt('monitorState','Lade historische Messwerte …');
 try{
  const d=await api('monitor-history&window='+encodeURIComponent(monitoringWindow));
  if(!Array.isArray(d.points)||d.points.length>450)throw Error('Ungültige Monitoring-Antwort');
  monitoringPoints=d.points;
  const latest=d.latest;
  const fresh=latest && Number.isInteger(latest.ts) && Date.now()/1000-latest.ts<180;
  txt('monitorCpu',fresh && Number.isFinite(latest.cpu_pct)?latest.cpu_pct.toLocaleString('de-DE',{maximumFractionDigits:1})+' %':'–');
  txt('monitorRam',fresh && Number.isFinite(latest.ram_bytes)?(latest.ram_bytes/1073741824).toLocaleString('de-DE',{maximumFractionDigits:2})+' GiB':'–');
  txt('monitorPlayers',fresh && Number.isFinite(latest.players)?String(latest.players):'–');
  txt('monitorTime',latest?new Date(latest.ts*1000).toLocaleTimeString('de-DE'):'–');
  txt('monitorState',(Number.isInteger(d.samples_count)?d.samples_count:d.points.filter(p=>p.samples>0).length)+' Messungen · Intervall 60 Sekunden · '+(fresh?'Aktuelle Messungen verfügbar':'Keine aktuelle Messung – Timer prüfen'));
  redrawMonitoring();
 }catch(e){monitoringPoints=[];redrawMonitoring();txt('monitorState','Monitoring nicht verfügbar: '+e.message)}
 finally{monitoringBusy=false}
}
$('monitorReload').addEventListener('click',loadMonitoring);
$('monitorWindow').addEventListener('change',e=>{monitoringWindow=e.target.value;loadMonitoring()});
window.addEventListener('resize',()=>{if(!$('monitor').hidden)redrawMonitoring()});
setInterval(()=>{if(!$('app').hidden&&!$('monitor').hidden)loadMonitoring()},60000);

async function backups(){try{const d=await api('backups');const el=$('backupList');el.replaceChildren();if(!d.files.length){el.textContent='Noch keine Backups gefunden.';return}for(const f of d.files){const row=document.createElement('div'),a=document.createElement('span'),b=document.createElement('span');a.textContent=f.name;b.textContent=fmt(f.size)+' · '+f.date;row.append(a,b);el.append(row)}}catch(e){showNotice(e.message,true)}}async function logs(){try{const d=await api('logs&type='+encodeURIComponent($('logType').value));txt('logOutput',d.logs||'Keine Einträge.')}catch(e){showNotice(e.message,true)}}function refreshAll(){status();backups();logs()}async function action(name){
 if(busy)return;
 const labels={start:'Server starten',stop:'Server stoppen',restart:'Server neu starten',update:'Update starten (Server wird ggf. neu gestartet)',backup:'Backup erstellen (kurze Unterbrechung möglich)'};
 if(!confirm(labels[name]+'?'))return;
 busy=true;document.querySelectorAll('[data-action]').forEach(b=>b.disabled=true);
 try{
  showNotice(labels[name]+' – Auftrag wird ausgeführt …',false,true);
  const d=await api('action',{method:'POST',headers:{'Content-Type':'application/json','X-CSRF-Token':csrf},body:JSON.stringify({action:name})});
  if(d.ok===false)throw Error(d.message||'Aktion fehlgeschlagen');
  {
   showNotice(labels[name]+' – Hintergrundauftrag läuft, Abschluss wird überwacht …',false,true);
   if(!d.job_id)throw Error('Auftrag gestartet, aber keine Auftrags-ID empfangen. Bitte Protokoll prüfen.');
   await awaitJob(name,d.job_id);
  }
 }catch(e){showNotice(e.message,true)}
 finally{busy=false;document.querySelectorAll('[data-action]').forEach(b=>b.disabled=false)}
}
// Release notes come from GitHub and are treated as untrusted text.
// Build Markdown-like formatting with DOM text nodes (never innerHTML).
function renderReleaseMarkdown(markdown){
 const container=$('panelReleaseNotes');container.replaceChildren();
 const lines=String(markdown||'Keine Release Notes hinterlegt.').replace(/\r\n?/g,'\n').split('\n');
 let list=null,code=null,paragraph=null;
 const inline=(parent,source)=>{
  const chunks=String(source).split(/(`[^`\n]+`|\*\*[^*\n]+\*\*|\[[^\]\n]+\]\(https:\/\/[^\s)]+\))/g);
  for(const chunk of chunks){if(!chunk)continue;
   let el;
   if(/^`[^`\n]+`$/.test(chunk)){el=document.createElement('code');el.textContent=chunk.slice(1,-1);}
   else if(/^\*\*[^*\n]+\*\*$/.test(chunk)){el=document.createElement('strong');el.textContent=chunk.slice(2,-2);}
   else if(/^\[[^\]\n]+\]\(https:\/\/[^\s)]+\)$/.test(chunk)){
    const m=chunk.match(/^\[([^\]]+)\]\((https:\/\/[^\s)]+)\)$/);
    try{const u=new URL(m[2]);if(u.protocol!=='https:')throw Error('URL');el=document.createElement('a');el.href=u.href;el.target='_blank';el.rel='noopener noreferrer';el.textContent=m[1];}catch(_){el=document.createTextNode(chunk);}
   }else{el=document.createTextNode(chunk)}
   parent.append(el);
  }
 };
 for(const line of lines){
  if(/^\s*```/.test(line)){
   if(code){code=null;}else{list=null;paragraph=null;code=document.createElement('pre');container.append(code)}
   continue;
  }
  if(code){code.textContent+=(code.textContent?'\n':'')+line;continue}
  if(!line.trim()){list=null;paragraph=null;continue}
  const head=line.match(/^(#{1,4})\s+(.+)$/);
  if(head){list=null;paragraph=null;const h=document.createElement(head[1].length===1?'h3':'h4');inline(h,head[2]);container.append(h);continue}
  const bullet=line.match(/^\s*[-*+]\s+(.+)$/);
  if(bullet){paragraph=null;if(!list){list=document.createElement('ul');container.append(list)}const li=document.createElement('li');inline(li,bullet[1]);list.append(li);continue}
  list=null;
  if(!paragraph){paragraph=document.createElement('p');container.append(paragraph)}else{paragraph.append(document.createElement('br'))}
  inline(paragraph,line);
 }
}
async function loadPanelSecurity(){
 try{
  const d=await api('panel-security');
  txt('panelTrustKeyState',d.trusted_key_configured?'Gültig und eingerichtet':'Nicht einsatzbereit');
  txt('panelTrustKeyFingerprint',d.trusted_key_configured && /^[0-9a-f]{64}$/.test(d.trusted_key_fingerprint||'')
   ? 'SHA-256 (öffentlicher PEM): '+d.trusted_key_fingerprint.match(/.{1,16}/g).join(' ')
   : (d.trusted_key_error||'Kein Fingerabdruck verfügbar'));
  txt('panelAutoInstallState','Prüfe Verfügbarkeit …');
 }catch(e){txt('panelTrustKeyState','Prüfung fehlgeschlagen');txt('panelTrustKeyFingerprint','Schlüsselstatus konnte nicht geladen werden.');}
}
let panelSelectedChannel='stable';
async function loadPanelChannel(){
 try{
  const d=await api('panel-update-channel');
  panelSelectedChannel=d.channel==='test'?'test':'stable';
  $('panelUpdateChannel').value=panelSelectedChannel;
  txt('panelChannelState',panelSelectedChannel==='test'?'Testkanal aktiv – veröffentlichte Pre-Releases':'Stabiler Kanal aktiv');
 }catch(e){txt('panelChannelState','Updatekanal nicht lesbar: '+e.message);$('panelStartUpdate').disabled=true;}
}
$('panelSaveUpdateChannel').addEventListener('click',async()=>{
 const channel=$('panelUpdateChannel').value;
 if(!['stable','test'].includes(channel))return;
 if(channel==='test'&&!confirm('Testkanal aktivieren? Pre-Releases sind möglicherweise instabil und sollten nur auf dem Testserver installiert werden.'))return;
 $('panelSaveUpdateChannel').disabled=true;
 try{
  await api('panel-update-channel',{method:'POST',headers:{'X-CSRF-Token':csrf,'Content-Type':'application/json'},body:JSON.stringify({channel})});
  panelSelectedChannel=channel;
  await loadPanelChannel();await loadPanelRelease();
 }catch(e){showNotice('Updatekanal: '+e.message,true);await loadPanelChannel();}
 finally{$('panelSaveUpdateChannel').disabled=false;}
});
async function loadPanelRelease(){
 loadPanelSecurity();
 const button=$('panelCheckReleases');button.disabled=true;
 await loadPanelChannel();
 txt('panelUpdateState','Prüfe offizielle GitHub-Releases …');
 $('panelReleaseLink').hidden=true;
 try{
  const d=await api('panel-release');
  $('panelStartUpdate').disabled=!d.installation_enabled || d.channel!==panelSelectedChannel;
  txt('panelInstalledVersion',d.installed);
  txt('panelLatestVersion',d.latest);
  renderReleaseMarkdown(d.notes);
  txt('panelReleaseSignatureState',d.signature_assets_present?'Signaturdateien vorhanden – noch nicht verifiziert':'Release nicht signiert');
  txt('panelAutoInstallState',d.installation_enabled?'Bereit':'Gesperrt (kein signiertes neueres Release)');
  txt('panelSignatureState', d.signature_assets_present
   ? (d.trusted_key_configured ? 'Signierte Release-Dateien gefunden; öffentlicher Prüfschlüssel ist eingerichtet. Eine lokale Verifikation vor Installation bleibt erforderlich.' : 'Signierte Release-Dateien gefunden, aber noch kein vertrauenswürdiger Prüfschlüssel eingerichtet.')
   : 'Dieses Release ist noch nicht digital signiert. Automatische Installation bleibt gesperrt.');
  txt('panelUpdateState',d.update_available
   ? (d.installation_enabled?'Signiertes neues Panel-Release ist verfügbar. Update per Klick möglich.':'Neue Version verfügbar, aber Signaturdateien oder vertrauenswürdiger Schlüssel fehlen.')
   : 'Keine neuere Panel-Version im ausgewählten Kanal verfügbar.');
  const a=$('panelReleaseLink');
  if(/^https:\/\/github\.com\/xDraconix\/Bedrock-Control\/releases\/tag\/v\d+\.\d+\.\d+$/.test(d.release_url||'')){
   a.href=d.release_url;a.hidden=false;
  }
 }catch(e){$('panelStartUpdate').disabled=true;txt('panelUpdateState','Versionsprüfung fehlgeschlagen: '+e.message);renderReleaseMarkdown('–');txt('panelSignatureState','Signaturstatus nicht verfügbar.');txt('panelReleaseSignatureState','Nicht ermittelt');txt('panelAutoInstallState','Prüfe Verfügbarkeit …')}
 finally{button.disabled=false}
}
let panelUpdatePoll=null;
let panelUpdatePollCount=0;
async function pollPanelUpdate(){
 try{
  const d=await api('panel-update-progress');
  const log=$('panelLiveUpdateLog');log.hidden=false;
  log.textContent=(d.state||'')+'\n'+(d.logs||'');
  const active=/ActiveState=activating|ActiveState=active/.test(d.state||'');
  $('panelStartUpdate').disabled=true;
  panelUpdatePollCount++;
  if(!active && panelUpdatePollCount>=3){if(panelUpdatePoll){clearInterval(panelUpdatePoll);panelUpdatePoll=null;}await loadPanelRelease();}
 }catch(e){txt('panelUpdateState','Update-Protokoll nicht erreichbar: '+e.message);}
}
$('panelStartUpdate').addEventListener('click',async()=>{
 if(!confirm('Signiertes GitHub-Release aus dem Kanal '+(panelSelectedChannel==='test'?'TESTVERSIONEN':'STABIL')+' installieren? Apache wird neu gestartet; Minecraft soll weiterlaufen.'))return;
 $('panelStartUpdate').disabled=true;
 try{await api('panel-update-start',{method:'POST',headers:{'X-CSRF-Token':csrf}});
   txt('panelUpdateState','Panel-Updateauftrag gestartet. Protokoll wird geladen …');
   if(panelUpdatePoll)clearInterval(panelUpdatePoll);
   panelUpdatePollCount=0;
   panelUpdatePoll=setInterval(pollPanelUpdate,2500);await sleep(1500);await pollPanelUpdate();
 }catch(e){showNotice('Panel-Update: '+e.message,true);await loadPanelRelease();}
});
$('panelShowUpdateLog').addEventListener('click',pollPanelUpdate);
$('panelCheckReleases').addEventListener('click',loadPanelRelease);
$('loginForm').addEventListener('submit',async e=>{e.preventDefault();try{const d=await api('login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({password:$('password').value})});csrf=d.csrf;$('password').value='';txt('loginError','');showApp()}catch(e){txt('loginError',e.message)}});document.querySelectorAll('[data-action]').forEach(b=>b.addEventListener('click',()=>action(b.dataset.action)));document.querySelectorAll('[data-tab]').forEach(a=>a.addEventListener('click',()=>{document.querySelectorAll('[data-tab]').forEach(x=>x.classList.remove('selected'));a.classList.add('selected');document.querySelectorAll('.tab').forEach(x=>x.hidden=x.id!==a.dataset.tab);txt('pageTitle',({overview:'Serverübersicht',update:'Minecraft-Updates','panel-update':'Panel-Updates',worlds:'Welten-Manager',addons:'Add-on Manager',settings:'Server-Einstellungen',console:'Live-Konsole',monitor:'Live-Servermonitoring',players:'Spielerverwaltung',backups:'Backup-Verwaltung',logs:'Systemprotokolle'})[a.dataset.tab]);if(a.dataset.tab==='panel-update')loadPanelRelease();if(a.dataset.tab==='logs')logs();if(a.dataset.tab==='backups')backups();if(a.dataset.tab==='addons')loadAddons();if(a.dataset.tab==='settings')loadProperties();if(a.dataset.tab==='worlds')loadWorlds();if(a.dataset.tab==='console')loadConsole();if(a.dataset.tab==='monitor')loadMonitoring();if(a.dataset.tab==='players'){status();loadPlayers();loadOnlinePlayers()}}));$('refresh').addEventListener('click',refreshAll);$('reloadLogs').addEventListener('click',logs);$('logType').addEventListener('change',logs);$('updateLogButton').addEventListener('click',()=>{document.querySelector('[data-tab="logs"]').click();$('logType').value='update';logs()});$('logout').addEventListener('click',async()=>{try{await api('logout',{method:'POST',headers:{'X-CSRF-Token':csrf}})}finally{location.reload()}});api('session').then(d=>{if(d.authenticated){csrf=d.csrf;showApp()}}).catch(()=>{});setInterval(()=>{if(!$('app').hidden)status()},15000);

let addonPacks=[];
async function loadAddons(){const el=$('addonList');el.textContent='Lade Pakete ...';try{const d=await api('addons');addonPacks=d.packs||[];renderAddons()}catch(e){el.textContent='Fehler: '+e.message}}
function renderAddons(){
 const el=$('addonList');el.replaceChildren();
 const filter=$('addonFilter').value,kind=$('addonKind').value,q=$('addonSearch').value.trim().toLocaleLowerCase('de');
 const active=addonPacks.filter(p=>p.active).length,system=addonPacks.filter(p=>p.category==='system').length;
 txt('addonSummary',`${active} aktiv · ${addonPacks.length-active} weitere Pakete · ${system} als Standardpakete erkannt · ${addonPacks.filter(p=>p.duplicate).length} Einträge mit mehrfacher UUID`);
 const visible=addonPacks.filter(p=>(filter==='all'||(filter==='active'?p.active:filter==='other'?!p.active&&p.category!=='system':p.category==='system'))&&(kind==='all'||p.kind===kind)&&(!q||[p.name,p.description,p.uuid,p.folder,p.version.join('.')].join(' ').toLocaleLowerCase('de').includes(q)));
 if(!visible.length){const empty=document.createElement('p');empty.className='muted';empty.textContent='Keine passenden Pakete gefunden.';el.append(empty);return}
 for(const p of visible){
  const row=document.createElement('div');row.className='addon-row';
  const info=document.createElement('div');info.className='addon-info';
  const name=document.createElement('b');name.textContent=p.name||p.folder;
  const details=document.createElement('div');details.className='muted tiny';details.textContent=(p.kind==='behavior'?'Behavior Pack':'Resource Pack')+' · Version '+p.version.join('.')+' · '+(p.active?'Aktiv':'Inaktiv');
  const path=document.createElement('div');path.className='muted tiny';path.textContent='Ordner: '+p.folder+' · UUID: '+p.uuid;
  info.append(name,details,path);
  if(p.description&&p.description!==p.name){const desc=document.createElement('div');desc.className='muted tiny';desc.textContent=p.description;info.append(desc)}
  if(p.duplicate){const warn=document.createElement('div');warn.className='addon-warning';warn.textContent='⚠ Mehrere installierte Versionen mit dieser UUID – Aktivierung gesperrt';info.append(warn)}
  if(p.category==='system'){const sys=document.createElement('div');sys.className='muted tiny';sys.textContent='Als Standardpaket eingeordnet (anhand des Ordnernamens)';info.append(sys)}
  const btn=document.createElement('button');btn.className=p.active?'danger':'positive';btn.textContent=p.active?'Deaktivieren':'Aktivieren';btn.disabled=!!p.duplicate;
  btn.addEventListener('click',async()=>{if(!confirm((p.active?'Deaktivieren':'Aktivieren')+'? Minecraft muss gestoppt sein.'))return;try{const r=await api('addon-action',{method:'POST',headers:{'Content-Type':'application/json','X-CSRF-Token':csrf},body:JSON.stringify({action:p.active?'disable':'enable',kind:p.kind,uuid:p.uuid})});showNotice(r.message||'Gespeichert');loadAddons()}catch(e){showNotice(e.message,true)}});
  row.append(info,btn);el.append(row)
 }
}
$('addonSearch').addEventListener('input',renderAddons);
$('addonFilter').addEventListener('change',renderAddons);
$('addonKind').addEventListener('change',renderAddons);
$('reloadAddons').addEventListener('click',loadAddons);
$('addonUploadForm').addEventListener('submit',async e=>{e.preventDefault();const file=$('addonFile').files[0];if(!file)return;if(file.size>268435456){showNotice('Maximal 256 MB',true);return}if(!confirm('Add-on installieren? Der Minecraft-Dienst muss gestoppt sein.'))return;const data=new FormData();data.append('addon',file);try{const r=await api('addon-upload',{method:'POST',headers:{'X-CSRF-Token':csrf},body:data});showNotice(r.message||'Installiert');$('addonUploadForm').reset();loadAddons()}catch(e){showNotice(e.message,true)}});

let consoleBusy=false;
async function loadConsole(){if(consoleBusy)return;consoleBusy=true;try{const d=await api('console-tail');txt('consoleOutput',d.logs||'Keine Konsolenausgabe verfügbar.')}catch(e){txt('consoleOutput','Konsole nicht verfügbar: '+e.message)}finally{consoleBusy=false}}
async function consoleSend(command,value=''){try{const d=await api('console-send',{method:'POST',headers:{'Content-Type':'application/json','X-CSRF-Token':csrf},body:JSON.stringify({command,value})});showNotice(d.message||'Befehl gesendet');setTimeout(loadConsole,600)}catch(e){showNotice(e.message,true)}}
$('reloadConsole').addEventListener('click',loadConsole);
$('consoleList').addEventListener('click',()=>consoleSend('list'));
$('consoleDay').addEventListener('click',()=>consoleSend('day'));
$('consoleNight').addEventListener('click',()=>consoleSend('night'));
function inlinePlayerActions(name,entry){
 const buttons=document.createElement('div');buttons.className='player-entry-actions';
 const addButton=(command,label,title,classes,pressed)=>{
  const btn=document.createElement('button');
  btn.type='button';
  btn.className='player-action '+classes;
  btn.textContent=label;
  btn.title=title+' – '+name;
  btn.setAttribute('aria-label',title+' für '+name);
  if(pressed!==null)btn.setAttribute('aria-pressed',String(pressed));
  btn.addEventListener('click',()=>playerCommand(command,name));
  buttons.append(btn);
 };
 // No separate Bedrock "disallow list": Allow turns membership on/off.
 const isAllowed=!!entry && entry.allowlisted!==false;
 addButton(isAllowed?'allowlist-remove':'allowlist-add',
           isAllowed?'✓ Allow':'Allow',
           isAllowed?'Von der Allowlist entfernen':'Zur Allowlist hinzufügen',
           'player-action-allow'+(isAllowed?' player-action-selected':''),
           isAllowed);
 // OP status is only known when the allowlist entry has a matching XUID
 // in permissions.json. Never mark a player as non-operator on a guess.
 if(entry?.permission_known){
  const isOp=entry.permission==='operator';
  addButton(isOp?'deop':'op',isOp?'✓ OP':'OP',
            isOp?'Operatorrechte entziehen':'Operatorrechte erteilen',
            'player-action-op'+(isOp?' player-action-selected':''),
            isOp);
 }else{
  addButton('op','OP','Operatorrechte erteilen (aktueller Status unbekannt)',
            'player-action-op',null);
  addButton('deop','deOP','Operatorrechte entziehen (aktueller Status unbekannt)',
            'player-action-deop',null);
 }
 return buttons;
}
// Roles are matched only by exact case-insensitive gamertag. Unknown is never treated as member.
let knownPlayerRoles=new Map();
let lastOnlineRoster=null;
let onlinePlayersBusy=false;

function playerBadges(entry,isOnline){
 const badges=document.createElement('div');badges.className='player-badges';
 const badge=(value,cls)=>{
  const span=document.createElement('span');span.className='player-badge '+cls;
  span.textContent=value;badges.append(span);
 };
 if(isOnline)badge('● Online','player-badge-online');
 if(entry){
  if(entry.allowlisted===false)badge('Nicht auf Allowlist','player-badge-not-allowed');
  else badge('✓ Allowlist','player-badge-allowed');
  if(entry.permission_known){
   const role=entry.permission;
   badge(role==='operator'?'★ OP':role==='visitor'?'Besucher':'Mitglied',
         role==='operator'?'player-badge-operator':'player-badge-member');
  }else{
   badge('Rechte unbekannt','player-badge-unknown');
  }
 }else if(isOnline){
  badge('Nicht auf Allowlist','player-badge-not-allowed');
  badge('Rechte ohne Allowlist-XUID nicht zuordenbar','player-badge-unknown');
 }
 return badges;
}

function renderOnlinePlayers(players){
 const list=$('onlinePlayersList');list.replaceChildren();
 if(!players.length){
  const p=document.createElement('p');p.className='muted';p.textContent='Derzeit keine Spieler online.';list.append(p);
  return;
 }
 for(const player of players){
  const row=document.createElement('div');row.className='player-entry player-entry-online';
  const info=document.createElement('div');info.className='player-entry-info';
  const name=document.createElement('strong');name.className='player-name';name.textContent=player;
  info.append(name,playerBadges(knownPlayerRoles.get(player.toLocaleLowerCase('de-DE')),true));
  row.append(info,inlinePlayerActions(player,knownPlayerRoles.get(player.toLocaleLowerCase('de-DE'))));list.append(row);
 }
}

async function loadOnlinePlayers(){
 if(onlinePlayersBusy)return;
 onlinePlayersBusy=true;
 const state=$('onlinePlayersState'),list=$('onlinePlayersList');
 state.textContent='Aktuelle Spieler werden über Minecraft abgefragt ...';
 try{
  const d=await api('players-online');
  if(!Array.isArray(d.players)||!Number.isInteger(d.count)||d.count!==d.players.length)throw Error('Unvollständige Serverantwort');
  if(d.players.some(n=>typeof n!=='string'))throw Error('Ungültige Spielernamen');
  const changed=lastOnlineRoster===null || d.players.length!==lastOnlineRoster.length ||
   d.players.some((name,i)=>name!==lastOnlineRoster[i]);
  lastOnlineRoster=d.players.slice();
  state.textContent=d.count+' von '+d.max_players+' Spielern online · frisch über die Konsole abgefragt';
  renderOnlinePlayers(lastOnlineRoster);
  if(changed)loadPlayers();
 }catch(e){
  lastOnlineRoster=null;
  list.replaceChildren();
  state.textContent='Spielernamen nicht verfügbar: '+e.message+' (keine veralteten Namen angezeigt)';
 }finally{onlinePlayersBusy=false}
}

async function loadPlayers(){
 const list=$('managedPlayers');list.textContent='Lade Allowlist ...';
 try{
  const d=await api('players-state');
  txt('allowlistState',d.allowlist_enabled===true?'● Allowlist aktiv – nur eingetragene Gamertags können beitreten':d.allowlist_enabled===false?'● Allowlist deaktiviert – aktuell keine Zugangsbeschränkung':'⚠ Allowlist-Einstellung unbekannt');
  $('allowlistState').className='player-allowlist-state '+(d.allowlist_enabled===true?'player-allowlist-enabled':'player-allowlist-disabled');
  txt('playersWarning',(Array.isArray(d.warnings)&&d.warnings.length?d.warnings.join(' · '):'')+' Online-Spieler werden separat automatisch abgefragt.');
  list.replaceChildren();
  if(!Array.isArray(d.players))throw Error('Ungültige Allowlist-Antwort');
  const known=(Array.isArray(d.identified_players)?d.identified_players:[])
   .concat(d.players);
  knownPlayerRoles=new Map(known.map(player=>[player.name.toLocaleLowerCase('de-DE'),player]));
  if(lastOnlineRoster!==null)renderOnlinePlayers(lastOnlineRoster);
  if(!d.players.length){const p=document.createElement('p');p.className='muted';p.textContent='Keine Allowlist-Einträge vorhanden.';list.append(p);return}
  for(const player of d.players){
   const row=document.createElement('div');row.className='player-entry player-entry-allowlist';
   const info=document.createElement('div');info.className='player-entry-info';
   const name=document.createElement('strong');name.className='player-name';name.textContent=player.name;
   info.append(name,playerBadges(player,false));
   row.append(info,inlinePlayerActions(player.name,player));list.append(row);
  }
 }catch(e){knownPlayerRoles=new Map();if(lastOnlineRoster!==null)renderOnlinePlayers(lastOnlineRoster);list.textContent='Spielerverwaltung nicht verfügbar: '+e.message;showNotice(e.message,true)}
}
async function playerCommand(command,name){
 const labels={'kick':'Spieler kicken','allowlist-add':'Zur Allowlist hinzufügen','allowlist-remove':'Von Allowlist entfernen','op':'Operatorrechte erteilen','deop':'Operatorrechte entziehen'};
 if(!Object.hasOwn(labels,command)||!name)return;
 if(!confirm(labels[command]+' für '+name+'?'+(command==='op'?' Operatoren dürfen die Welt und Servereinstellungen verändern.':'')))return;
 try{
  const d=await api('console-send',{method:'POST',headers:{'Content-Type':'application/json','X-CSRF-Token':csrf},body:JSON.stringify({command,value:name})});
  showNotice(d.message||'Befehl an die Serverkonsole gesendet. Ausführung dort prüfen.');
  setTimeout(()=>{loadPlayers();loadOnlinePlayers()},1200);
 }catch(e){showNotice(e.message,true)}
}
$('playersReload').addEventListener('click',()=>{loadPlayers();loadOnlinePlayers()});


$('consoleSayForm').addEventListener('submit',e=>{e.preventDefault();const msg=$('consoleMessage').value.trim();if(!msg)return;consoleSend('say',msg);$('consoleMessage').value=''});

setInterval(()=>{if(!$('app').hidden&&!$('console').hidden)loadConsole()},5000);
setInterval(()=>{if(!$('app').hidden&&!$('players').hidden)loadOnlinePlayers()},15000);

async function loadWorlds(){
 const el=$('worldList');el.textContent='Lade Welten ...';
 try{
  const d=await api('worlds');el.replaceChildren();
  txt('worldSummary','In server.properties ausgewählt: '+d.selected+' · Server '+(d.running?'online':'offline'));
  if(!d.worlds.length){el.textContent='Keine vollständigen Welten gefunden (level.dat fehlt).';return}
  for(const w of d.worlds){
   const row=document.createElement('div');row.className='addon-row';
   const info=document.createElement('div');info.className='addon-info';
   const name=document.createElement('b');name.textContent=w.name;
   const sub=document.createElement('div');sub.className='muted tiny';sub.textContent=w.selected?'In server.properties ausgewählt':'Vorhandene Welt';
   info.append(name,sub);
   const meta=document.createElement('div');meta.className='muted tiny';
   const details=[];
   if(w.game_mode)details.push('Spielmodus: '+w.game_mode);
   if(w.difficulty)details.push('Schwierigkeit: '+w.difficulty);
   if(w.level_name&&w.level_name!==w.name)details.push('Weltname: '+w.level_name);
   meta.textContent=details.join(' · ');
   if(details.length)info.append(meta);
   const seedBox=document.createElement('div');seedBox.className='world-seed-row';
   const seedLabel=document.createElement('span');seedLabel.className='muted tiny';seedLabel.textContent='Weltseed:';
   const seedValue=document.createElement('code');seedValue.textContent=(typeof w.seed==='string'&&/^-?\d{1,20}$/.test(w.seed))?w.seed:'Nicht verfügbar';
   seedBox.append(seedLabel,seedValue);
   if(typeof w.seed==='string'&&/^-?\d{1,20}$/.test(w.seed)){
    const seedCopy=document.createElement('button');seedCopy.className='secondary';seedCopy.textContent='Kopieren';
    seedCopy.title='Weltseed in Zwischenablage kopieren';
    seedCopy.addEventListener('click',()=>{
     // The dashboard commonly runs on http://SERVER-IP:8088, where the
     // asynchronous Clipboard API is unavailable outside secure contexts.
     // The legacy copy command can still work directly in a user click.
     function copyLegacy(value){
      const input=document.createElement('textarea');
      input.value=value;
      input.readOnly=true;
      input.setAttribute('aria-hidden','true');
      input.style.cssText='position:fixed;left:-9999px;top:0;opacity:0;';
      const selection=window.getSelection();
      const oldRanges=[];
      if(selection)for(let i=0;i<selection.rangeCount;i++)oldRanges.push(selection.getRangeAt(i));
      const previousFocus=document.activeElement;
      document.body.append(input);
      let copied=false;
      try{
       input.focus({preventScroll:true});
       input.select();
       input.setSelectionRange(0,input.value.length);
       copied=typeof document.execCommand==='function'&&document.execCommand('copy');
      }finally{
       input.remove();
       if(selection){selection.removeAllRanges();for(const range of oldRanges)selection.addRange(range)}
       if(previousFocus&&typeof previousFocus.focus==='function')previousFocus.focus({preventScroll:true});
      }
      return copied;
     }
     if(copyLegacy(w.seed)){showNotice('Weltseed in Zwischenablage kopiert.');return}
     if(window.isSecureContext&&navigator.clipboard?.writeText){
      navigator.clipboard.writeText(w.seed)
       .then(()=>showNotice('Weltseed in Zwischenablage kopiert.'))
       .catch(()=>showNotice('Kopieren nicht möglich. Bitte den sichtbaren Seed markieren und Strg+C drücken.',true));
      return;
     }
     showNotice('Automatisches Kopieren wird von diesem Browser nicht unterstützt. Bitte den sichtbaren Seed markieren und Strg+C drücken.',true);
    });
    seedBox.append(seedCopy);
   }
   info.append(seedBox);
   const btn=document.createElement('button');btn.className=w.selected?'secondary':'positive';btn.textContent=w.selected?'Ausgewählt':'Welt auswählen';btn.disabled=!!w.selected;
   btn.addEventListener('click',()=>worldAction('select',w.name));
   const copy=document.createElement('button');copy.className='secondary';copy.textContent='Duplizieren';copy.addEventListener('click',()=>{const n=prompt('Name für Kopie von '+w.name+':',w.name+' Kopie');if(n)worldDuplicate(w.name,n.trim())});
   const save=document.createElement('button');save.className='secondary';save.textContent='Sichern';save.addEventListener('click',()=>worldAction('backup',w.name));
   for(const format of ['zip','mcworld']){
    const download=document.createElement('button');download.className='secondary';download.textContent='↓ '+(format==='zip'?'ZIP':'.mcworld');
    download.title='Minecraft muss für den Export gestoppt sein';
    download.addEventListener('click',()=>worldExport(w.name,format));
    row.append(download);
   }
   row.prepend(info);row.append(btn,copy,save);el.append(row)
  }
 }catch(e){el.textContent='Fehler: '+e.message}
}
async function worldExport(name,format){
 if(!confirm('Welt "'+name+'" als '+format+' exportieren? Minecraft muss gestoppt sein.'))return;
 try{
  showNotice('Weltarchiv wird vorbereitet …',false,true);
  const d=await api('world-export',{method:'POST',headers:{'Content-Type':'application/json','X-CSRF-Token':csrf},body:JSON.stringify({name,format})});
  const id=d.job_id;
  if(!/^[a-f0-9]{32}$/.test(id||''))throw Error('Keine gültige Auftrags-ID erhalten');
  for(let n=0;n<900;n++){
   await sleep(2000);
   const state=await api('job-status&id='+encodeURIComponent(id));
   if(state.state==='success'){
    showNotice('Weltarchiv bereit. Download startet …');
    const a=document.createElement('a');a.href='?api=world-download&id='+encodeURIComponent(id)+'&format='+encodeURIComponent(format);
    document.body.append(a);a.click();a.remove();return;
   }
   if(state.state==='failed')throw Error(state.message||'Export fehlgeschlagen');
   showNotice(state.message||'Weltarchiv wird erstellt …',false,true);
  }
  throw Error('Export dauert zu lange. Bitte Protokoll prüfen.');
 }catch(e){showNotice(e.message,true)}
}
async function worldAction(action,name){
 const question=action==='backup'?'Welt "'+name+'" sichern? Der Server muss gestoppt sein.':action==='create'?'Neue Welt "'+name+'" für den nächsten Start vorbereiten?':'Welt "'+name+'" auswählen? Der Server wird NICHT automatisch neu gestartet.';
 if(!confirm(question))return;
 try{const r=await api('world-action',{method:'POST',headers:{'Content-Type':'application/json','X-CSRF-Token':csrf},body:JSON.stringify({action,name})});showNotice(r.message||'Gespeichert');loadWorlds();if(action==='create')$('worldCreateForm').reset()}catch(e){showNotice(e.message,true)}
}
$('reloadWorlds').addEventListener('click',loadWorlds);
$('worldCreateForm').addEventListener('submit',e=>{e.preventDefault();const name=$('worldNewName').value.trim();if(name)worldAction('create',name)});

async function worldDuplicate(source,name){
 if(!confirm('Welt "'+source+'" nach "'+name+'" duplizieren? Minecraft muss gestoppt sein.'))return;
 try{const d=await api('world-duplicate',{method:'POST',headers:{'Content-Type':'application/json','X-CSRF-Token':csrf},body:JSON.stringify({source,name})});showNotice(d.message||'Dupliziert');loadWorlds()}catch(e){showNotice(e.message,true)}
}
$('worldImportForm').addEventListener('submit',async e=>{
 e.preventDefault();if(!confirm('Welt importieren? Minecraft muss gestoppt sein.'))return;
 const f=new FormData();f.append('name',$('worldImportName').value.trim());f.append('world',$('worldImportFile').files[0]);
 try{const d=await api('world-import',{method:'POST',headers:{'X-CSRF-Token':csrf},body:f});showNotice(d.message||'Importiert');$('worldImportForm').reset();loadWorlds()}catch(err){showNotice(err.message,true)}
});

// Version 2.3: safe property editor (existing keys only).
let propertiesOriginal={},propertiesRevision='';
const propertyNames={'server-name':'Servername','level-name':'Weltname','gamemode':'Spielmodus','difficulty':'Schwierigkeit','max-players':'Maximale Spieler','server-port':'Server-Port (IPv4)','server-portv6':'Server-Port (IPv6)','online-mode':'Online-Modus','allow-cheats':'Cheats erlauben','enable-lan-visibility':'LAN-Sichtbarkeit','view-distance':'Sichtweite','tick-distance':'Simulationsdistanz','default-player-permission-level':'Standard-Spielerrechte','player-idle-timeout':'AFK-Timeout'};
async function loadProperties(){
 const host=$('propertiesFields');host.replaceChildren();txt('propertiesState','Lade server.properties …');$('propertiesSave').disabled=true;
 try{
  const data=await api('properties-read');propertiesRevision=data.revision;propertiesOriginal={};
  for(const f of data.fields){
   propertiesOriginal[f.key]=f.value;
   const wrap=document.createElement('div');wrap.className='property-field';
   const label=document.createElement('label');label.textContent=propertyNames[f.key]||f.key;
   const key=document.createElement('small');key.textContent=f.key;
   const id='property-'+f.key;label.htmlFor=id;
   let field;
   if(f.type==='boolean'||f.type==='select'){
    field=document.createElement('select');
    const options=f.type==='boolean'?['true','false']:f.options;
    for(const value of options){const option=document.createElement('option');option.value=value;option.textContent=value==='true'?'Aktiviert':value==='false'?'Deaktiviert':value;field.append(option)}
   }else{field=document.createElement('input');field.type=f.type==='integer'||f.type==='number'?'number':'text';if(f.type==='integer')field.step='1';if(f.type==='number')field.step='any';if(f.min!==undefined)field.min=f.min;if(f.max!==undefined)field.max=f.max;field.maxLength=512}
   field.id=id;field.dataset.propertyKey=f.key;field.value=f.value;
   field.addEventListener('input',propertyDirty);field.addEventListener('change',propertyDirty);
   wrap.append(label,key,field);host.append(wrap);
  }
  txt('propertiesState',data.fields.length+' Einstellungen geladen · Noch keine Änderungen');
 }catch(e){txt('propertiesState','Fehler: '+e.message);showNotice(e.message,true)}
}
function propertyChanges(){const changes={};document.querySelectorAll('[data-property-key]').forEach(el=>{if(el.value!==propertiesOriginal[el.dataset.propertyKey])changes[el.dataset.propertyKey]=el.value});return changes}
function propertyDirty(){const count=Object.keys(propertyChanges()).length;$('propertiesSave').disabled=count===0;txt('propertiesState',count?count+' Änderung(en) noch nicht gespeichert':'Keine Änderungen')}
$('propertiesReload').addEventListener('click',()=>{if(Object.keys(propertyChanges()).length&&!confirm('Ungespeicherte Änderungen verwerfen?'))return;loadProperties()});
$('propertiesSave').addEventListener('click',async()=>{
 const changes=propertyChanges();const keys=Object.keys(changes);if(!keys.length)return;
 const preview=keys.map(k=>k+': '+propertiesOriginal[k]+' → '+changes[k]).join('\n');
 if(!confirm('Folgende Änderungen speichern?\n\n'+preview+'\n\nMinecraft wird NICHT automatisch neu gestartet.'))return;
 $('propertiesSave').disabled=true;
 try{const d=await api('properties-save',{method:'POST',headers:{'Content-Type':'application/json','X-CSRF-Token':csrf},body:JSON.stringify({revision:propertiesRevision,changes})});showNotice(d.changed+' Einstellung(en) gespeichert. Backup: '+d.backup+'. Minecraft bitte manuell neu starten.');await loadProperties();status()}
 catch(e){showNotice(e.message,true);propertyDirty()}
});

// v2.4.0: authenticated first-run wizard.
async function setupCheck(){
 try{const d=await api('setup-status');
   $('setupNav').hidden=d.installed;
   $('setupForm').hidden=d.installed||d.path_exists||d.service_exists;
   txt('setupState',d.installed?'Minecraft ist bereits installiert.':(d.path_exists||d.service_exists)?'Eine vorhandene oder unvollständige Installation wurde erkannt. Aus Sicherheitsgründen wird nichts überschrieben.':'Kein Minecraft-Server vorhanden. Installation ist möglich.');
   if(!d.installed){document.querySelectorAll('a[data-tab]').forEach(a=>a.classList.remove('selected'));document.querySelectorAll('section.tab').forEach(x=>x.hidden=true);$('setup').hidden=false;$('setupNav').classList.add('selected');}
 }catch(e){showNotice('Setup-Prüfung: '+e.message,true)}
}
$('setupForm').addEventListener('submit',async e=>{
 e.preventDefault();
 const data={server_name:$('setupServer').value.trim(),world_name:$('setupWorld').value.trim(),gamemode:$('setupMode').value,difficulty:$('setupDifficulty').value,port:Number($('setupPort').value),max_players:Number($('setupPlayers').value)};
 if(!confirm('Minecraft Bedrock jetzt offiziell herunterladen und installieren?'))return;
 $('setupInstall').disabled=true;$('setupProgress').hidden=false;
 try{
  const r=await api('setup-install',{method:'POST',headers:{'Content-Type':'application/json','X-CSRF-Token':csrf},body:JSON.stringify(data)});
  const deadline=Date.now()+25*60*1000;
  while(Date.now()<deadline){
   await sleep(2500);
   const s=await api('setup-job&id='+encodeURIComponent(r.job_id));
   txt('setupProgress',s.message||s.state);
   if(s.state==='success'){showNotice(s.message);await setupCheck();refreshAll();return;}
   if(s.state==='failed')throw Error(s.message||'Installation fehlgeschlagen');
  }
  throw Error('Zeitüberschreitung. Bitte Installationsprotokoll prüfen.');
 }catch(err){showNotice(err.message,true);txt('setupProgress',err.message)}finally{$('setupInstall').disabled=false}
});
// Call setup detection after login; preserve existing dashboard behaviour.
const oldShowApp=showApp;
showApp=function(){oldShowApp();setupCheck()};
