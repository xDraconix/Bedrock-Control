<?php
declare(strict_types=1);
$config=require dirname(__DIR__).'/config/config.php';
ini_set('display_errors','0');
ini_set('session.use_strict_mode','1');
ini_set('session.cookie_httponly','1');
ini_set('session.cookie_samesite','Strict');
if (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS']!=='off') ini_set('session.cookie_secure','1');
session_start();
header('X-Content-Type-Options: nosniff');
header('X-Frame-Options: DENY');
header('Referrer-Policy: no-referrer');
header("Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' data:; base-uri 'none'; frame-ancestors 'none'");
function respond(array $data,int $status=200):never { http_response_code($status); header('Content-Type: application/json; charset=utf-8'); header('Cache-Control: no-store'); echo json_encode($data,JSON_UNESCAPED_UNICODE|JSON_INVALID_UTF8_SUBSTITUTE); exit; }
function run(array $args):array { $cmd=implode(' ',array_map('escapeshellarg',$args)); $des=[1=>['pipe','w'],2=>['pipe','w']]; $p=proc_open($cmd,$des,$pipes); if(!is_resource($p))return ['code'=>127,'out'=>'','err'=>'Could not execute']; $out=stream_get_contents($pipes[1]); $err=stream_get_contents($pipes[2]); fclose($pipes[1]);fclose($pipes[2]);return ['code'=>proc_close($p),'out'=>trim($out),'err'=>trim($err)]; }
function admin(string $action):array {return run(['/usr/bin/sudo','-n','/usr/local/sbin/bedrock-panel-control',$action]);}
function csrf():string {return $_SESSION['csrf']??=bin2hex(random_bytes(32));}
function nethernetStatus(string $url):?array {
 $ctx=stream_context_create(['http'=>['method'=>'GET','timeout'=>2,'ignore_errors'=>false,'follow_location'=>0]]);
 $raw=@file_get_contents($url,false,$ctx);
 if($raw===false || strlen($raw)>65536)return null;
 $data=json_decode($raw,true);
 if(!is_array($data)||!isset($data['name'],$data['players'],$data['maxPlayers']))return null;
 return $data;
}

function serverProperties(string $dir):array {
 $file=rtrim($dir,'/').'/server.properties';
 $keys=['server-name','level-name','server-port','server-portv6','gamemode','difficulty','max-players','online-mode','allow-cheats'];
 $out=[];
 if(!is_readable($file))return $out;
 foreach(@file($file,FILE_IGNORE_NEW_LINES)?:[] as $line){
  $line=trim($line);
  if($line==='' || $line[0]==='#' || !str_contains($line,'='))continue;
  [$key,$value]=explode('=',$line,2);
  $key=trim($key);
  if(in_array($key,$keys,true))$out[$key]=trim($value);
 }
 return $out;
}


// Der Server-Port wird pro Anfrage aus der aktuellen Bedrock-Konfiguration gelesen.
// Kein Rückfall auf 19132: ein falscher Port darf nicht als "Server startet" erscheinen.
function nethernetEndpoint(string $dir):array {
 $path=rtrim($dir,'/').'/server.properties';
 if(!is_file($path))return ['url'=>null,'port'=>null,'error'=>'server.properties fehlt: '.$path];
 if(!is_readable($path))return ['url'=>null,'port'=>null,'error'=>'server.properties ist für den Webserver nicht lesbar: '.$path];
 $lines=@file($path,FILE_IGNORE_NEW_LINES);
 if($lines===false)return ['url'=>null,'port'=>null,'error'=>'server.properties konnte nicht eingelesen werden'];
 $port=null;
 foreach($lines as $line){
  $line=trim($line);
  if($line===''||str_starts_with($line,'#')||str_starts_with($line,';')||!str_contains($line,'='))continue;
  [$key,$value]=explode('=',$line,2);
  if(trim($key)==='server-port')$port=trim($value);
 }
 if($port===null)return ['url'=>null,'port'=>null,'error'=>'server-port fehlt in server.properties'];
 if(!ctype_digit($port)||(int)$port<1||(int)$port>65535)return ['url'=>null,'port'=>null,'error'=>'Ungültiger server-port in server.properties'];
 return ['url'=>'http://127.0.0.1:'.(int)$port.'/v1/join','port'=>(int)$port,'error'=>null];
}

// LXC-aware resource metrics: cgroup limits first, /proc fallback.
function systemMetrics():array {
 $read=function(string $path):?string { $v=@file_get_contents($path);return $v===false?null:trim($v); };
 $number=function(?string $v):?int {return $v!==null && ctype_digit($v)?(int)$v:null;};
 $mem=[];
 foreach(explode("\n",$read('/proc/meminfo')??'') as $line){if(preg_match('/^([A-Za-z_]+):\s*(\d+)\s+kB/',$line,$m))$mem[$m[1]]=(int)$m[2]*1024;}
 $hostTotal=$mem['MemTotal']??null;$hostAvailable=$mem['MemAvailable']??null;
 $limit=$number($read('/sys/fs/cgroup/memory.max'));
 $usage=$number($read('/sys/fs/cgroup/memory.current'));
 $limited=$limit!==null && $limit>0 && ($hostTotal===null || $limit<$hostTotal);
 $total=$limited?$limit:$hostTotal;
 $used=$limited?$usage:($hostTotal!==null && $hostAvailable!==null?max(0,$hostTotal-$hostAvailable):null);
 $cpuIds=[];
 foreach(explode("\n",$read('/proc/cpuinfo')??'') as $line){if(preg_match('/^processor\s*:\s*(\d+)/',$line,$m))$cpuIds[(int)$m[1]]=true;}
 $cpuCount=count($cpuIds)?:null;
 $quota=$read('/sys/fs/cgroup/cpu.max');$quotaCpus=null;
 if($quota!==null && preg_match('/^(\d+)\s+(\d+)/',$quota,$m) && (int)$m[2]>0)$quotaCpus=round((int)$m[1]/(int)$m[2],2);
 $cpuset=$read('/sys/fs/cgroup/cpuset.cpus.effective');$cpusetCount=null;
 if($cpuset!==null && $cpuset!==''){$count=0;foreach(explode(',',$cpuset) as $part){if(preg_match('/^(\d+)-(\d+)$/',$part,$m))$count+=max(0,(int)$m[2]-(int)$m[1]+1);elseif(ctype_digit($part))$count++;}$cpusetCount=$count?:null;}
 $effective=$cpuCount;
 if($cpusetCount!==null)$effective=$effective===null?$cpusetCount:min($effective,$cpusetCount);
 if($quotaCpus!==null)$effective=$effective===null?$quotaCpus:min($effective,$quotaCpus);
 $uptime=null;$rawUptime=$read('/proc/uptime');if($rawUptime!==null && preg_match('/^([0-9.]+)/',$rawUptime,$m))$uptime=(int)(float)$m[1];
 $load=null;$rawLoad=$read('/proc/loadavg');if($rawLoad!==null && preg_match('/^([0-9.]+)\s+([0-9.]+)\s+([0-9.]+)/',$rawLoad,$m))$load=[(float)$m[1],(float)$m[2],(float)$m[3]];
 return ['ram_total'=>$total,'ram_used'=>$used,'ram_scope'=>$limited?'Containerlimit':'Systemanzeige','cpu_count'=>$effective,'cpu_physical_visible'=>$cpuCount,'cpu_quota'=>$quotaCpus,'uptime_seconds'=>$uptime,'load_average'=>$load];
}

function panelTrustKeyStatus():array {
  $trustKey='/etc/bedrock-control-pro/trusted-release-key.pem';
  // Public-key status is separate from release signing. Never read or expose a private key.
  $trustConfigured=false;
  $keyFingerprint=null;
  $keyError=null;
  if(!is_file($trustKey) || is_link($trustKey) || !is_readable($trustKey)) {
   $keyError='Kein lesbarer öffentlicher Prüfschlüssel eingerichtet.';
  } else {
   $keyStat=@stat($trustKey);
   if($keyStat===false || $keyStat['uid']!==0 || ($keyStat['mode'] & 0022)!==0) {
    $keyError='Unsichere Eigentümer- oder Schreibberechtigungen des Prüfschlüssels.';
   } else {
    $keyPem=@file_get_contents($trustKey);
    $publicKey=is_string($keyPem)?@openssl_pkey_get_public($keyPem):false;
    $details=$publicKey!==false?@openssl_pkey_get_details($publicKey):false;
    if(!is_array($details) || !isset($details['ed25519']['pub_key']) || strlen($details['ed25519']['pub_key'])!==32) {
     $keyError='Der Prüfschlüssel ist kein gültiger öffentlicher Ed25519-Schlüssel.';
    } elseif(!isset($details['key']) || !is_string($details['key'])) {
     $keyError='Schlüsseldaten konnten nicht ausgelesen werden.';
    } else {
     $trustConfigured=true;
     // Fingerprint of the public PEM identity; no secrets are sent to browser.
     $keyFingerprint=hash('sha256',$details['key']);
    }
   }
  }
 return ['trusted_key_configured'=>$trustConfigured,'trusted_key_fingerprint'=>$keyFingerprint,'trusted_key_error'=>$keyError];
}

$api=$_GET['api']??null;
$hashFile=dirname(__DIR__).'/config/password.hash';
if($api==='login') {if($_SERVER['REQUEST_METHOD']!=='POST')respond(['error'=>'Method not allowed'],405); $raw=json_decode(file_get_contents('php://input'),true); if(!is_array($raw))respond(['error'=>'Invalid JSON'],400); $attempts=$_SESSION['login_attempts']??0; $last=$_SESSION['last_attempt']??0; if($attempts>=6 && time()-$last<900)respond(['error'=>'Zu viele Versuche. Bitte später erneut versuchen.'],429); $_SESSION['last_attempt']=time(); $_SESSION['login_attempts']=$attempts+1; $hash=is_file($hashFile)?trim(file_get_contents($hashFile)):''; if(!$hash||!password_verify((string)($raw['password']??''),$hash))respond(['error'=>'Ungültiges Passwort'],401);session_regenerate_id(true);$_SESSION['auth']=true;$_SESSION['login_attempts']=0;respond(['ok'=>true,'csrf'=>csrf()]); }
if($api!==null) {
 if($api==='session')respond(['authenticated'=>!empty($_SESSION['auth']),'csrf'=>!empty($_SESSION['auth'])?csrf():null]);
 if(empty($_SESSION['auth']))respond(['error'=>'Nicht angemeldet'],401);
 if($api==='setup-status') {
  if($_SERVER['REQUEST_METHOD']!=='GET')respond(['error'=>'Method not allowed'],405);
  $dir=$config['server_dir'];
  respond(['installed'=>is_file($dir.'/server.properties') && is_file($dir.'/bedrock_server'),
    'path_exists'=>file_exists($dir),'service_exists'=>is_file('/etc/systemd/system/mcbedrock.service')]);
 }
 if($api==='setup-job') {
  if($_SERVER['REQUEST_METHOD']!=='GET')respond(['error'=>'Method not allowed'],405);
  $id=(string)($_GET['id']??'');if(!preg_match('/^[a-f0-9]{32}$/',$id))respond(['error'=>'Ungültige Job-ID'],400);
  $path='/run/bedrock-panel-jobs/setup-'.$id.'.json';
  if(!is_readable($path))respond(['error'=>'Installationsstatus nicht gefunden'],404);
  $data=json_decode((string)file_get_contents($path),true);respond(is_array($data)?$data:['error'=>'Ungültiger Jobstatus']);
 }
 if($api==='setup-install') {
  if($_SERVER['REQUEST_METHOD']!=='POST'||!hash_equals(csrf(),$_SERVER['HTTP_X_CSRF_TOKEN']??''))respond(['error'=>'CSRF'],403);
  $raw=file_get_contents('php://input');if(strlen($raw)>4096)respond(['error'=>'Anfrage zu groß'],413);
  $d=json_decode($raw,true);if(!is_array($d))respond(['error'=>'Ungültige Eingabe'],400);
  $fields=['server_name','world_name','gamemode','difficulty','port','max_players'];
  if(array_keys($d)!==$fields || !is_string($d['server_name']) || !preg_match('/^[a-zA-Z0-9 _.\-]{1,64}$/D',$d['server_name'])
    || !is_string($d['world_name']) || !preg_match('/^[a-zA-Z0-9 _.\-]{1,64}$/D',$d['world_name'])
    || !in_array($d['gamemode'],['survival','creative','adventure'],true)
    || !in_array($d['difficulty'],['peaceful','easy','normal','hard'],true)
    || !is_int($d['port']) || $d['port']<1024 || $d['port']>65534
    || !is_int($d['max_players']) || $d['max_players']<1 || $d['max_players']>100)respond(['error'=>'Ungültige Servereinstellungen'],400);
  $r=run(['/usr/bin/sudo','-n','/usr/local/sbin/bedrock-setup-control','install',base64_encode($raw)]);
  if($r['code']!==0)respond(['error'=>$r['err']?:$r['out']?:'Installation konnte nicht gestartet werden'],409);
  if(!preg_match('/JOB_ID=([a-f0-9]{32})/',$r['out'],$m))respond(['error'=>'Keine Job-ID erhalten'],500);
  respond(['ok'=>true,'job_id'=>$m[1]]);
 }
 if($api==='properties-read') {
  if($_SERVER['REQUEST_METHOD']!=='GET')respond(['error'=>'Method not allowed'],405);
  $r=run(['/usr/bin/sudo','-n','/usr/local/sbin/bedrock-properties-manager','read']);
  $d=json_decode($r['out'],true);respond($d??['error'=>$r['err']?:'Konfiguration nicht lesbar'],$r['code']===0?200:409);
 }
 if($api==='properties-save') {
  if($_SERVER['REQUEST_METHOD']!=='POST'||!hash_equals(csrf(),$_SERVER['HTTP_X_CSRF_TOKEN']??''))respond(['error'=>'CSRF'],403);
  $raw=file_get_contents('php://input');if(strlen($raw)>65536)respond(['error'=>'Anfrage zu groß'],413);
  $data=json_decode($raw,true);
  if(!is_array($data)||!is_string($data['revision']??null)||!is_array($data['changes']??null))respond(['error'=>'Ungültige Eingabe'],400);
  $r=run(['/usr/bin/sudo','-n','/usr/local/sbin/bedrock-properties-manager','save',base64_encode($raw)]);
  $d=json_decode($r['out'],true);respond($d??['error'=>$r['err']?:'Speichern fehlgeschlagen'],$r['code']===0?200:409);
 }
 if($api==='monitor-history') {
  if($_SERVER['REQUEST_METHOD']!=='GET')respond(['error'=>'Method not allowed'],405);
  $window=(string)($_GET['window']??'24h');
  if(!in_array($window,['1h','6h','24h','7d','30d'],true))respond(['error'=>'Ungültiges Zeitfenster'],400);
  session_write_close();
  $r=run(['/usr/bin/sudo','-n','/usr/local/sbin/bedrock-monitor-manager','history',$window]);
  $d=json_decode($r['out'],true);
  respond($r['code']===0 && is_array($d)?$d:['error'=>$d['error']??$r['err']?:'Monitoring nicht verfügbar'],
          $r['code']===0?200:503);
 }
 if($api==='status') { $svc=run(['/usr/bin/systemctl','is-active',$config['service']]); $installedFile=$config['server_dir'].'/.installed-bedrock-version';$version=is_file($installedFile)?trim((string)file_get_contents($installedFile)):'Unbekannt';$nethernet=nethernetEndpoint($config['server_dir']);$bedrock=$nethernet['url']!==null?nethernetStatus($nethernet['url']):null;$job=run(['/usr/bin/systemctl','show','bedrock-panel-update.service','--property=ActiveState,SubState,Result','--no-pager']);$disk=@disk_free_space($config['server_dir']);$mem=run(['/usr/bin/systemctl','show',$config['service'],'--property=MemoryCurrent,ActiveEnterTimestamp','--no-pager']);respond(['online'=>$svc['out']==='active','service'=>$svc['out'],'version'=>$version,'nethernet_online'=>$bedrock!==null,'nethernet_port'=>$nethernet['port'],'nethernet_error'=>$nethernet['error'],'bedrock'=>$bedrock,'properties'=>serverProperties($config['server_dir']),'update_job'=>$job['out'],'service_info'=>$mem['out'],'system_metrics'=>systemMetrics(),'free_bytes'=>$disk===false?null:$disk,'csrf'=>csrf()]); }
 if($api==='job-status') {
  $id=(string)($_GET['id']??'');
  if(!preg_match('/\A[a-f0-9]{32}\z/D',$id))respond(['error'=>'Ungueltige Auftrags-ID'],400);
  $file='/run/bedrock-panel-jobs/'.$id.'.json';
  if(!is_file($file))respond(['error'=>'Auftragsstatus nicht gefunden'],404);
  $raw=@file_get_contents($file);
  $d=$raw!==false?json_decode($raw,true):null;
  if(!is_array($d)||($d['id']??'')!==$id)respond(['error'=>'Auftragsstatus nicht lesbar'],503);
  respond(['ok'=>true,'id'=>$id,'state'=>$d['state']??'unknown','message'=>$d['message']??'', 'exit_status'=>$d['exit_status']??null]);
 }
 if($api==='logs') { $type=$_GET['type']??'server'; if(!in_array($type,['server','update'],true))respond(['error'=>'Invalid type'],400);$unit=$type==='server'?$config['service']:'bedrock-panel-update.service';$r=run(['/usr/bin/journalctl','-u',$unit,'-n','100','--no-pager','--output=short-iso']);respond(['logs'=>substr($r['out'].($r['err']?"\n".$r['err']:''),-24000)]); }
 if($api==='backups') {$dir=$config['backup_dir'];$files=[];foreach(glob($dir.'/minecraft-*.tar.gz')?:[] as $f){if(is_file($f))$files[]=['name'=>basename($f),'size'=>filesize($f),'date'=>date('Y-m-d H:i:s',filemtime($f))];}usort($files,fn($a,$b)=>strcmp($b['name'],$a['name']));respond(['files'=>array_slice($files,0,40)]);}
 if($api==='panel-update-channel') {
  $channelFile='/etc/bedrock-control-pro/update-channel';
  if($_SERVER['REQUEST_METHOD']==='GET') {
    $channel=is_readable($channelFile)?trim((string)file_get_contents($channelFile)):'stable';
    respond(['channel'=>in_array($channel,['stable','test'],true)?$channel:'stable']);
  }
  if($_SERVER['REQUEST_METHOD']!=='POST'||!hash_equals(csrf(),$_SERVER['HTTP_X_CSRF_TOKEN']??''))respond(['error'=>'CSRF'],403);
  $body=json_decode(file_get_contents('php://input'),true);
  $channel=is_array($body)?($body['channel']??null):null;
  if(!is_string($channel)||!in_array($channel,['stable','test'],true))respond(['error'=>'Ungültiger Updatekanal'],400);
  $r=run(['/usr/bin/sudo','-n','/usr/local/sbin/bedrock-panel-self-update-control','channel',$channel]);
  respond($r['code']===0?['ok'=>true,'channel'=>$channel]:['error'=>$r['err']?:$r['out']?:'Updatekanal konnte nicht gesetzt werden'],$r['code']===0?200:409);
 }
 if($api==='panel-update-start') {
  if($_SERVER['REQUEST_METHOD']!=='POST'||!hash_equals(csrf(),$_SERVER['HTTP_X_CSRF_TOKEN']??''))respond(['error'=>'CSRF'],403);
  $r=run(['/usr/bin/sudo','-n','/usr/local/sbin/bedrock-panel-self-update-control','start']);
  respond($r['code']===0?['ok'=>true,'message'=>'Updateauftrag gestartet']:['error'=>$r['err']?:$r['out']?:'Updateauftrag konnte nicht gestartet werden'],$r['code']===0?200:409);
 }
 if($api==='panel-update-progress') {
  if($_SERVER['REQUEST_METHOD']!=='GET')respond(['error'=>'Method not allowed'],405);
  $state=run(['/usr/bin/systemctl','show','bedrock-panel-self-update.service','-p','ActiveState','-p','Result','-p','ExecMainStatus','--no-pager']);
  $logs=run(['/usr/bin/journalctl','-u','bedrock-panel-self-update.service','-n','75','--no-pager','--output=short-iso']);
  respond(['state'=>$state['out'],'logs'=>substr($logs['out'], -15000)]);
 }
 if($api==='panel-security') {
  if($_SERVER['REQUEST_METHOD']!=='GET')respond(['error'=>'Method not allowed'],405);
  respond(panelTrustKeyStatus()+['installation_enabled'=>false]);
 }
 if($api==='panel-release') {
  if($_SERVER['REQUEST_METHOD']!=='GET')respond(['error'=>'Method not allowed'],405);
  // Fixed, audited GitHub endpoint. No client-supplied URL or shell input.
  $channelFile='/etc/bedrock-control-pro/update-channel';
  $channel=is_readable($channelFile)?trim((string)file_get_contents($channelFile)):'stable';
  if(!in_array($channel,['stable','test'],true))respond(['error'=>'Ungültige lokale Updatekanal-Konfiguration'],503);
  // Prefer the new repository once it exists; fall back only on HTTP 404.
  // API redirects are rejected to prevent unapproved repository substitution.
  $repositories=['xDraconix/DracoRock-Control','xDraconix/Bedrock-Control'];
  $sourceRepo=null;$json=null;
  foreach($repositories as $repo){
   $url='https://api.github.com/repos/'.$repo.'/releases'.($channel==='test'?'?per_page=30':'/latest');
   $r=run(['/usr/bin/curl','--silent','--show-error','--proto','=https',
     '--max-redirs','0','--connect-timeout','4','--max-time','10','--max-filesize','262144',
     '--write-out',"\\n%{http_code}",
     '--header','Accept: application/vnd.github+json',
     '--header','X-GitHub-Api-Version: 2022-11-28',
     '--user-agent','DracoRock-Control/3.0.0', $url]);
   if($r['code']!==0)respond(['error'=>'GitHub Release-API ist momentan nicht erreichbar.'],502);
   $split=strrpos($r['out'],"\n");
   if($split===false)respond(['error'=>'Ungültiger GitHub-HTTP-Status.'],502);
   $status=substr($r['out'],$split+1);
   if($status==='404' && $repo===$repositories[0])continue;
   if($status!=='200')respond(['error'=>'GitHub Release-API meldet HTTP '.$status],502);
   $body=substr($r['out'],0,$split);
   if(strlen($body)>262144)respond(['error'=>'GitHub-Antwort zu groß'],502);
   $json=json_decode($body,true);
   $sourceRepo=$repo;
   break;
  }
  if($sourceRepo===null)respond(['error'=>'Keine vertrauenswürdige GitHub-Release-Quelle gefunden'],502);
  $data=null;
  if($channel==='test') {
    if(!is_array($json)||!array_is_list($json))respond(['error'=>'Ungültige GitHub Release-Liste'],502);
    foreach($json as $item) {
      if(!is_array($item)||($item['draft']??true)!==false||($item['prerelease']??false)!==true)continue;
      $candidate=$item['tag_name']??null;
      if(!is_string($candidate)||!preg_match('/^v\d+\.\d+\.\d+$/D',$candidate))continue;
      if($data===null||version_compare(substr($candidate,1),substr($data['tag_name'],1),'>'))$data=$item;
    }
    if($data===null)respond(['error'=>'Kein veröffentlichtes Pre-Release unter den letzten 30 Releases gefunden'],404);
  } else {
    $data=$json;
    if(!is_array($data)||($data['draft']??true)!==false||($data['prerelease']??true)!==false)respond(['error'=>'Kein gültiges stabiles Release gefunden'],502);
  }
  $tag=$data['tag_name']??null;
  if(!is_string($tag)||!preg_match('/^v(\d+\.\d+\.\d+)$/D',$tag,$m))respond(['error'=>'Ungültige Release-Versionsnummer'],502);
  $releaseVersion=$m[1];
  $zipName='Bedrock-Control-PRO-'.$tag.'-Release.zip';
  $shaName=$zipName.'.sha256';
  $manifestName=$zipName.'.manifest';
  $signatureName=$manifestName.'.sig';
  $assetUrls=[];
  foreach(($data['assets']??[]) as $asset){
   if(!is_array($asset))continue;
   $name=$asset['name']??'';$url=$asset['browser_download_url']??'';
   if(!is_string($name)||!in_array($name,[$zipName,$shaName,$manifestName,$signatureName],true)||!is_string($url))continue;
   // Asset names and redirect targets must originate from the intended repository.
   $prefix='https://github.com/'.$sourceRepo.'/releases/download/'.$tag.'/';
   if($url!==$prefix.rawurlencode($name))continue;
   $assetUrls[$name]=$url;
  }
  $localFile=dirname(__DIR__).'/VERSION';
  $localVersion=is_readable($localFile)?trim((string)file_get_contents($localFile)):'Unbekannt';
  if(!preg_match('/^\d+\.\d+\.\d+(?:-beta\d+)?$/D',$localVersion))$localVersion='Unbekannt';
  // Published stable releases only. Development versions never downgrade automatically.
  $upgradeAvailable=$localVersion!=='Unbekannt'&&version_compare($releaseVersion,$localVersion,'>');
  $trust=panelTrustKeyStatus();
  $signedAssetsPresent=isset($assetUrls[$zipName],$assetUrls[$manifestName],$assetUrls[$signatureName]);
  respond(['channel'=>$channel,'signature_assets_present'=>$signedAssetsPresent,'trusted_key_configured'=>$trust['trusted_key_configured'],
    'trusted_key_fingerprint'=>$trust['trusted_key_fingerprint'],'trusted_key_error'=>$trust['trusted_key_error'],
    'installed'=>$localVersion,'latest'=>$releaseVersion,'tag'=>$tag,
    'update_available'=>$upgradeAvailable,'release_url'=>'https://github.com/'.$sourceRepo.'/releases/tag/'.$tag,
    'published_at'=>is_string($data['published_at']??null)?$data['published_at']:null,
    'notes'=>substr(is_string($data['body']??null)?$data['body']:'',0,10000),
    'assets_complete'=>isset($assetUrls[$zipName],$assetUrls[$shaName]),
    'download_zip'=>$assetUrls[$zipName]??null,'download_sha256'=>$assetUrls[$shaName]??null,
    'installation_enabled'=>$upgradeAvailable&&$signedAssetsPresent&&$trust['trusted_key_configured'],
    'installation_hint'=>'Nur neuere, vollständig signierte Releases im gewählten Kanal können installiert werden.']);
 }
 if($api==='latest') { $ctx=stream_context_create(['http'=>['timeout'=>8,'header'=>"User-Agent: Mozilla/5.0\r\nAccept: application/json\r\n"]]);$body=@file_get_contents($config['version_endpoint'],false,$ctx);if($body===false)respond(['error'=>'Versionsdienst nicht erreichbar'],502);$json=json_decode($body,true);respond(['data'=>$json]);}
 if($api==='players-online') {
  if($_SERVER['REQUEST_METHOD']!=='GET')respond(['error'=>'Method not allowed'],405);
  session_write_close();
  $r=run(['/usr/bin/sudo','-n','/usr/local/sbin/bedrock-console-manager','online']);
  $data=json_decode($r['out'],true);
  respond($r['code']===0 && is_array($data)?$data:['error'=>$data['error']??$r['err']??'Keine aktuelle Spielerliste verfügbar'],$r['code']===0?200:503);
 }
 if($api==='players-state') {
  if($_SERVER['REQUEST_METHOD']!=='GET')respond(['error'=>'Method not allowed'],405);
  $r=run(['/usr/bin/sudo','-n','/usr/local/sbin/bedrock-console-manager','players']);
  $data=json_decode($r['out'],true);
  respond($data??['error'=>$r['err']?:'Spielerinformationen nicht verfügbar'],$r['code']===0?200:503);
 }
 if($api==='console-tail') {
  $r=run(['/usr/bin/sudo','-n','/usr/local/sbin/bedrock-console-manager','tail']);
  $d=json_decode($r['out'],true);
  respond($d??['error'=>$r['err']?:'Konsole nicht verfügbar'],$r['code']===0?200:503);
 }
 if($api==='console-send') {
  if($_SERVER['REQUEST_METHOD']!=='POST'||!hash_equals(csrf(),$_SERVER['HTTP_X_CSRF_TOKEN']??''))respond(['error'=>'CSRF'],403);
  $d=json_decode(file_get_contents('php://input'),true);
  if(!is_array($d)||!is_string($d['command']??null)||!is_string($d['value']??null))respond(['error'=>'Ungültige Eingabe'],400);
  $r=run(['/usr/bin/sudo','-n','/usr/local/sbin/bedrock-console-manager','send',$d['command'],$d['value']]);
  $out=json_decode($r['out'],true);
  respond($out??['error'=>$r['err']?:'Befehl fehlgeschlagen'],$r['code']===0?200:409);
 }
 if($api==='worlds') {
  $r=run(['/usr/bin/sudo','-n','/usr/local/sbin/bedrock-world-manager','list']);
  $d=json_decode($r['out'],true);
  respond($d??['error'=>$r['err']?:'Welten konnten nicht geladen werden'],$r['code']===0?200:500);
 }
 if($api==='world-export') {
  if($_SERVER['REQUEST_METHOD']!=='POST'||!hash_equals(csrf(),$_SERVER['HTTP_X_CSRF_TOKEN']??''))respond(['error'=>'CSRF'],403);
  $d=json_decode(file_get_contents('php://input'),true);
  $name=$d['name']??null;$format=$d['format']??null;
  if(!is_string($name)||strlen($name)<1||strlen($name)>320||!in_array($format,['zip','mcworld'],true))respond(['error'=>'Ungültige Eingabe'],400);
  $r=run(['/usr/bin/sudo','-n','/usr/local/sbin/bedrock-world-manager','export-start',$name,$format]);
  $out=json_decode($r['out'],true);
  respond($out??['error'=>$r['err']?:'Export fehlgeschlagen'],$r['code']===0?200:409);
 }
 if($api==='world-download') {
  if($_SERVER['REQUEST_METHOD']!=='GET')respond(['error'=>'Method not allowed'],405);
  $id=(string)($_GET['id']??'');$format=(string)($_GET['format']??'');
  if(!preg_match('/\A[a-f0-9]{32}\z/D',$id)||!in_array($format,['zip','mcworld'],true))respond(['error'=>'Ungültiger Download'],400);
  $statusFile='/run/bedrock-panel-jobs/'.$id.'.json';
  $status=is_file($statusFile)?json_decode((string)@file_get_contents($statusFile),true):null;
  if(!is_array($status)||($status['id']??'')!==$id||($status['action']??'')!=='world-export'||($status['state']??'')!=='success')respond(['error'=>'Download noch nicht bereit'],409);
  $file='/var/lib/bedrock-panel/exports/'.$id.'.'.$format;
  if(!is_file($file)||is_link($file))respond(['error'=>'Archiv nicht gefunden oder abgelaufen'],404);
  $size=filesize($file);if($size===false)respond(['error'=>'Archiv nicht lesbar'],500);
  session_write_close();
  header('Content-Type: application/octet-stream');
  // Human-readable filename; the actual archive remains stored under its opaque job ID.
  $worldName=(string)($status['world_name']??'Minecraft-Welt');
  $worldName=strtr($worldName,['Ä'=>'Ae','Ö'=>'Oe','Ü'=>'Ue','ä'=>'ae','ö'=>'oe','ü'=>'ue','ß'=>'ss']);
  $ascii=@iconv('UTF-8','ASCII//TRANSLIT//IGNORE',$worldName);
  if($ascii!==false)$worldName=$ascii;
  $worldName=preg_replace('/[^A-Za-z0-9_-]+/','-',$worldName);
  $worldName=trim((string)$worldName,'-_');
  if($worldName==='')$worldName='Minecraft-Welt';
  $worldName=substr($worldName,0,80);
  $stamp=(string)($status['export_timestamp']??'');
  if(!preg_match('/\A[0-9]{8}-[0-9]{6}\z/D',$stamp))$stamp=date('Ymd-His',(int)filemtime($file));
  $downloadName=$worldName.'-'.$stamp.'.'.$format;
  header('Content-Disposition: attachment; filename="'.$downloadName.'"');
  header('Content-Length: '.$size);
  header('Cache-Control: no-store, private');
  header('X-Content-Type-Options: nosniff');
  while(ob_get_level()>0)ob_end_clean();
  readfile($file);exit;
 }
 if($api==='world-action') {
  if($_SERVER['REQUEST_METHOD']!=='POST'||!hash_equals(csrf(),$_SERVER['HTTP_X_CSRF_TOKEN']??''))respond(['error'=>'CSRF'],403);
  $d=json_decode(file_get_contents('php://input'),true);
  $act=$d['action']??'';$name=$d['name']??null;
  if(!in_array($act,['select','create','backup'],true)||!is_string($name)||strlen($name)>320||strlen($name)<1)respond(['error'=>'Ungültige Aktion'],400);
  $r=run(['/usr/bin/sudo','-n','/usr/local/sbin/bedrock-world-manager',$act,$name]);
  $out=json_decode($r['out'],true);
  respond($out??['error'=>$r['err']?:'Weltaktion fehlgeschlagen'],$r['code']===0?200:409);
 }
 if($api==='world-duplicate') {
  if($_SERVER['REQUEST_METHOD']!=='POST'||!hash_equals(csrf(),$_SERVER['HTTP_X_CSRF_TOKEN']??''))respond(['error'=>'CSRF'],403);
  $d=json_decode(file_get_contents('php://input'),true);
  $source=$d['source']??null;$name=$d['name']??null;
  if(!is_string($source)||!is_string($name)||strlen($source)>320||strlen($name)>320)respond(['error'=>'Ungültige Eingabe'],400);
  $r=run(['/usr/bin/sudo','-n','/usr/local/sbin/bedrock-world-manager','duplicate',$source,$name]);$out=json_decode($r['out'],true);
  respond($out??['error'=>$r['err']?:'Duplizieren fehlgeschlagen'],$r['code']===0?200:409);
 }
 if($api==='world-import') {
  if($_SERVER['REQUEST_METHOD']!=='POST'||!hash_equals(csrf(),$_SERVER['HTTP_X_CSRF_TOKEN']??''))respond(['error'=>'CSRF'],403);
  if(!isset($_FILES['world'])||$_FILES['world']['error']!==UPLOAD_ERR_OK)respond(['error'=>'Upload fehlgeschlagen (PHP-Limit prüfen)'],400);
  $name=$_POST['name']??null;$file=$_FILES['world'];
  if(!is_string($name)||strlen($name)>320||!preg_match('/\.mcworld$/i',(string)$file['name'])||$file['size']<1||$file['size']>268435456)respond(['error'=>'Nur .mcworld bis 256 MiB'],400);
  $token=bin2hex(random_bytes(16));$path='/var/lib/bedrock-panel/uploads/'.$token.'.mcworld';
  if(!move_uploaded_file($file['tmp_name'],$path))respond(['error'=>'Upload-Verzeichnis nicht beschreibbar'],500);
  chmod($path,0644);
  $r=run(['/usr/bin/sudo','-n','/usr/local/sbin/bedrock-world-manager','import',$token,$name]);$out=json_decode($r['out'],true);
  @unlink($path);
  respond($out??['error'=>$r['err']?:'Import fehlgeschlagen'],$r['code']===0?200:409);
 }
 if($api==='addons') {
  $r=run(['/usr/bin/sudo','-n','/usr/local/sbin/bedrock-addon-manager','list']);
  $d=json_decode($r['out'],true);
  if($r['code']!==0 || !is_array($d) || isset($d['error']))respond(['error'=>$d['error']??'Add-ons konnten nicht geladen werden'],500);
  respond($d);
 }
 if($api==='addon-action') {
  if($_SERVER['REQUEST_METHOD']!=='POST'||!hash_equals(csrf(),$_SERVER['HTTP_X_CSRF_TOKEN']??''))respond(['error'=>'CSRF'],403);
  $d=json_decode(file_get_contents('php://input'),true);
  $act=$d['action']??'';$kind=$d['kind']??'';$uid=$d['uuid']??'';
  if(!in_array($act,['enable','disable'],true)||!in_array($kind,['behavior','resource'],true)||!is_string($uid)||!preg_match('/^[a-f0-9-]{36}$/i',$uid))respond(['error'=>'Ungültige Aktion'],400);
  $r=run(['/usr/bin/sudo','-n','/usr/local/sbin/bedrock-addon-manager',$act,$kind,$uid]);$result=json_decode($r['out'],true);
  respond($result??['error'=>$r['err']?:'Aktion fehlgeschlagen'],$r['code']===0?200:409);
 }
 if($api==='addon-upload') {
  if($_SERVER['REQUEST_METHOD']!=='POST'||!hash_equals(csrf(),$_SERVER['HTTP_X_CSRF_TOKEN']??''))respond(['error'=>'CSRF'],403);
  if(!isset($_FILES['addon'])||$_FILES['addon']['error']!==UPLOAD_ERR_OK)respond(['error'=>'Upload fehlgeschlagen (PHP-Limit prüfen)'],400);
  $file=$_FILES['addon'];$name=(string)$file['name'];
  if(!preg_match('/\.(mcaddon|mcpack|zip)$/i',$name)||$file['size']>268435456||$file['size']<1)respond(['error'=>'Nur .mcaddon, .mcpack oder .zip bis 256 MB'],400);
  $dir='/var/lib/bedrock-panel/uploads';$token=bin2hex(random_bytes(16));$path=$dir.'/'.$token.'.zip';
  if(!move_uploaded_file($file['tmp_name'],$path))respond(['error'=>'Upload-Verzeichnis nicht beschreibbar'],500);
  chmod($path,0640);
  $r=run(['/usr/bin/sudo','-n','/usr/local/sbin/bedrock-addon-manager','install',$token]);$result=json_decode($r['out'],true);
  respond($result??['error'=>$r['err']?:'Installation fehlgeschlagen'],$r['code']===0?200:409);
 }
 if($api==='logout') {if($_SERVER['REQUEST_METHOD']!=='POST'||!hash_equals(csrf(),$_SERVER['HTTP_X_CSRF_TOKEN']??''))respond(['error'=>'CSRF'],403);$_SESSION=[];session_destroy();respond(['ok'=>true]);}
 if($api==='action') {if($_SERVER['REQUEST_METHOD']!=='POST')respond(['error'=>'Method not allowed'],405);if(!hash_equals(csrf(),$_SERVER['HTTP_X_CSRF_TOKEN']??''))respond(['error'=>'CSRF'],403);$raw=json_decode(file_get_contents('php://input'),true);$action=is_array($raw)?($raw['action']??''):'';if(!in_array($action,['start','stop','restart','update','backup'],true))respond(['error'=>'Ungültige Aktion'],400);$r=admin($action);$jobId=null;if(preg_match('/JOB_ID=([a-f0-9]{32})/',$r['out'],$m))$jobId=$m[1];respond(['ok'=>$r['code']===0,'message'=>$r['out']?:$r['err'],'exit'=>$r['code'],'job_id'=>$jobId],$r['code']===0?200:500);}
 respond(['error'=>'Unbekannter Endpunkt'],404);
}
?><!doctype html><html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>DracoRock Control</title><link rel="icon" type="image/svg+xml" href="assets/dracorock-mark.svg"><link rel="stylesheet" href="assets/app.css?v=3.1.0-alerts3"></head><body><div id="login" class="login"><form id="loginForm" class="loginbox"><div class="login-emblem"><img class="brand-mark brand-mark-login" src="assets/dracorock-mark.svg" width="82" height="82" alt="DracoRock Control Logo"></div><div class="login-kicker">BEDROCK SERVER COMMAND CENTER</div><h1>DRACOROCK <span>CONTROL</span></h1><p>Minecraft Bedrock · Server Administration</p><label for="password">Administrator-Passwort</label><input id="password" type="password" autocomplete="current-password" required autofocus><button class="primary">Anmelden</button><div id="loginError" class="error"></div></form></div><div id="app" hidden><aside><div class="brand"><img class="brand-mark" src="assets/dracorock-mark.svg" width="52" height="52" alt=""><div><b>DRACOROCK</b><small>CONTROL <span class="brand-version">/ 3.0</span></small></div></div><nav><a href="#setup" data-tab="setup" id="setupNav" hidden>⛏ &nbsp; Minecraft einrichten</a><a href="#overview" class="selected" data-tab="overview">◫ &nbsp; Dashboard</a><a href="#update" data-tab="update">⟳ &nbsp; Minecraft-Updates</a><a href="#panel-update" data-tab="panel-update">⬆ &nbsp; Panel-Updates</a><a href="#console" data-tab="console">▣ &nbsp; Live-Konsole</a><a href="#monitor" data-tab="monitor">▥ &nbsp; Live-Monitoring</a><a href="#players" data-tab="players">♙ &nbsp; Spielerverwaltung</a><a href="#worlds" data-tab="worlds">◈ &nbsp; Welten-Manager</a><a href="#settings" data-tab="settings">⚙ &nbsp; Server-Einstellungen</a><a href="#addons" data-tab="addons">⬡ &nbsp; Add-on Manager</a><a href="#backups" data-tab="backups">▤ &nbsp; Backups</a><a href="#logs" data-tab="logs">▣ &nbsp; Protokolle</a></nav><div class="asidefoot">Debian · Apache · PHP<br><button id="logout" class="textbutton">Abmelden ↗</button></div></aside><main><header><div><div class="eyebrow"><span class="eyebrow-accent"></span> DRACOROCK / BEDROCK MANAGEMENT</div><h1 id="pageTitle">Serverübersicht</h1></div><div class="headright"><span id="statusPill" class="pill">● Prüfe Status</span><button id="refresh" class="ghost">⟳ Aktualisieren</button></div></header><div id="notice" class="notice" role="status" aria-live="polite" hidden></div><section id="setup" class="tab" hidden><article class="card"><h2>⛏ Minecraft Bedrock einrichten</h2><p class="muted">Der offizielle Bedrock Dedicated Server wird heruntergeladen und als systemd-Dienst installiert. Vorhandene Server werden nicht überschrieben.</p><p id="setupState">Prüfe Installation ...</p><form id="setupForm" class="properties-grid"><label>Servername<input id="setupServer" maxlength="64" value="Mein Bedrock Server" required pattern="[A-Za-z0-9 _.\-]+"></label><label>Weltname<input id="setupWorld" maxlength="64" value="Meine Welt" required pattern="[A-Za-z0-9 _.\-]+"></label><label>Spielmodus<select id="setupMode"><option value="survival">Überleben</option><option value="creative">Kreativ</option><option value="adventure">Abenteuer</option></select></label><label>Schwierigkeit<select id="setupDifficulty"><option value="peaceful">Friedlich</option><option value="easy" selected>Einfach</option><option value="normal">Normal</option><option value="hard">Schwer</option></select></label><label>IPv4-Port<input id="setupPort" type="number" min="1024" max="65534" value="19132" required></label><label>Maximale Spieler<input id="setupPlayers" type="number" min="1" max="100" value="10" required></label><button class="primary" id="setupInstall" type="submit">Minecraft installieren</button></form><pre id="setupProgress" class="log" hidden></pre><p class="muted tiny">Die Installation benötigt Internetzugang und kann einige Minuten dauern. Der Assistent ist nur nach Administrator-Anmeldung erreichbar.</p></article></section><section id="overview" class="tab"><div class="cards"><article class="card metric"><div class="label">SERVERSTATUS</div><strong id="state">–</strong><span id="uptime" class="muted">mcbedrock.service</span></article><article class="card metric"><div class="label">INSTALLIERTE VERSION</div><strong id="version">–</strong><span class="muted">Bedrock Dedicated Server</span></article><article class="card metric"><div class="label">SPIELER ONLINE</div><strong id="players">–</strong><span id="nethernet" class="muted">NetherNet-Status wird geprüft</span></article><article class="card metric"><div class="label">FREIER SPEICHER</div><strong id="disk">–</strong><span class="muted">Installationslaufwerk</span></article></div><div class="cols overview-controls"><article class="card"><h2>Serversteuerung</h2><p class="muted">Steuere den systemd-Dienst direkt aus dem Panel.</p><div class="actions"><button data-action="start" class="positive">▶ Starten</button><button data-action="restart" class="secondary">↻ Neustarten</button><button data-action="stop" class="danger">■ Stoppen</button></div></article><article class="card dashboard-alert-card"><h2>Serverwarnungen</h2><div id="dashboardAlerts" class="monitor-alerts" role="region" aria-label="Aktuelle Serverwarnungen" aria-live="polite"><p class="muted tiny">Warnstatus wird geladen …</p></div><button id="dashboardAlertsDetail" class="secondary" type="button">Live-Monitoring öffnen</button></article><article class="card"><h2>Update & Sicherung</h2><p class="muted">Update mit deinem bewährten Bash-Skript. Die Aktion läuft im Hintergrund.</p><div class="actions"><button data-action="update" class="primary">⬆ Update starten</button><button data-action="backup" class="secondary">▤ Backup erstellen</button></div></article></div><article class="card"><h2>Minecraft-Serverinformationen</h2><div id="bedrockDetails" class="server-info-grid" aria-live="polite">Wird geladen ...</div></article><article class="card"><h2>Aktuelle Systeminformationen</h2><div id="systemInfo" class="system-metrics-grid" aria-live="polite">Wird geladen ...</div><details class="system-technical"><summary>Technische Dienstinformationen</summary><pre id="systemTechnical">–</pre></details></article></section><section id="monitor" class="tab" hidden>
<article class="card"><div class="monitor-header"><div><h2>▥ Live-Servermonitoring</h2><p class="muted">CPU, Arbeitsspeicher und Online-Spieler – lokale Messungen im Minutentakt, auch wenn das Panel geschlossen ist.</p></div><div class="actions"><label for="monitorWindow">Zeitraum</label><select id="monitorWindow" aria-label="Monitoring-Zeitraum"><option value="1h">1 Stunde</option><option value="6h">6 Stunden</option><option value="24h" selected>24 Stunden</option><option value="7d">7 Tage</option><option value="30d">30 Tage</option></select><button id="monitorReload" class="secondary" type="button">⟳ Aktualisieren</button></div></div>
<p class="muted tiny" id="monitorState" role="status" aria-live="polite">Messwerte werden geladen …</p>
<div class="monitor-alerts" id="monitorAlerts" role="region" aria-label="Serverwarnungen" aria-live="polite"><p class="muted tiny">Serverzustand wird geprüft …</p></div>
<div class="monitor-stat-grid"><div class="monitor-stat"><span>SERVER-CPU</span><strong id="monitorCpu">–</strong><small>100 % = ein CPU-Kern</small></div><div class="monitor-stat"><span>SERVER-RAM</span><strong id="monitorRam">–</strong><small>Speicher des Minecraft-Dienstes</small></div><div class="monitor-stat"><span>SPIELER ONLINE</span><strong id="monitorPlayers">–</strong><small>Offizielle Bedrock-Spielerliste</small></div><div class="monitor-stat"><span>LETZTE MESSUNG</span><strong id="monitorTime">–</strong><small>Lokale Serverzeit</small></div></div>
<div class="monitor-charts">
<div class="monitor-chart-panel" data-monitor-metric="cpu"><h3>CPU-Auslastung <span class="monitor-unit">%</span></h3><div class="monitor-stat-summary" id="monitorCpuSummary" aria-label="CPU-Statistik im ausgewählten Zeitraum">Minimum – · Durchschnitt – · Maximum –</div><div class="monitor-chart-wrap"><canvas id="monitorCpuChart" tabindex="0" role="img" aria-label="CPU-Verlauf; mit Pfeiltasten Messpunkte untersuchen"></canvas><div class="monitor-tooltip" id="monitorCpuTooltip" role="status" hidden></div></div></div>
<div class="monitor-chart-panel" data-monitor-metric="ram"><h3>Arbeitsspeicher <span class="monitor-unit">GiB</span></h3><div class="monitor-stat-summary" id="monitorRamSummary" aria-label="RAM-Statistik im ausgewählten Zeitraum">Minimum – · Durchschnitt – · Maximum –</div><div class="monitor-chart-wrap"><canvas id="monitorRamChart" tabindex="0" role="img" aria-label="RAM-Verlauf; mit Pfeiltasten Messpunkte untersuchen"></canvas><div class="monitor-tooltip" id="monitorRamTooltip" role="status" hidden></div></div></div>
<div class="monitor-chart-panel" data-monitor-metric="players"><h3>Spielerzahl</h3><div class="monitor-stat-summary" id="monitorPlayersSummary" aria-label="Spielerstatistik im ausgewählten Zeitraum">Minimum – · Durchschnitt – · Maximum –</div><div class="monitor-chart-wrap"><canvas id="monitorPlayersChart" tabindex="0" role="img" aria-label="Spieler-Verlauf; mit Pfeiltasten Messpunkte untersuchen"></canvas><div class="monitor-tooltip" id="monitorPlayersTooltip" role="status" hidden></div></div></div></div>
<p class="muted tiny">Maus oder Finger auf eine Grafik bewegen (Tastatur: Pfeiltasten) für Zeit und Messwert. Einzelne fehlende Messwerte werden in den Kurven als Mittelwert der benachbarten Messungen geschätzt; längere Lücken bleiben offen. Geschätzte Werte werden beim Überfahren gekennzeichnet und fließen nicht in Min/Ø/Max ein. Die gespeicherten Originaldaten bleiben unverändert. Gespeichert werden ausschließlich aggregierte Messwerte (keine Namen oder XUIDs), maximal 30 Tage.</p>
</article></section><section id="update" class="tab" hidden><article class="card"><h2>Update-Manager</h2><p>Installierte Version: <b id="updateVersion">–</b></p><p class="muted">Dein Update-Skript ermittelt die neueste offizielle Linux-Version selbstständig, erstellt eine Sicherung und aktualisiert den Server.</p><div class="actions"><button data-action="update" class="primary">⬆ Auf Updates prüfen und installieren</button><button id="updateLogButton" class="secondary">Update-Protokoll anzeigen</button></div><h3>Letzter Update-Lauf</h3><pre id="updateInfo">–</pre></article></section><section id="panel-update" class="tab" hidden><article class="card"><h2>⬆ DracoRock Control aktualisieren</h2><p class="muted">Prüfe die offiziellen stabilen GitHub Releases. Minecraft wird durch die Versionsprüfung nicht beeinflusst.</p><div class="actions"><label for="panelUpdateChannel">Updatekanal</label><select id="panelUpdateChannel" aria-label="Panel-Updatekanal"><option value="stable">Stabil</option><option value="test">Testversionen (Pre-Releases)</option></select><button id="panelSaveUpdateChannel" class="secondary">Kanal übernehmen</button></div><p id="panelChannelState" class="muted tiny">Updatekanal wird geladen ...</p><div class="server-info-grid"><div class="server-info-item"><span class="server-info-label">Installierte Panel-Version</span><strong id="panelInstalledVersion" class="server-info-value">–</strong></div><div class="server-info-item"><span class="server-info-label">Neueste stabile Version</span><strong id="panelLatestVersion" class="server-info-value">–</strong></div></div><p id="panelUpdateState" class="muted" aria-live="polite">Noch nicht geprüft.</p><div class="actions"><button id="panelCheckReleases" class="primary">⟳ Auf Panel-Updates prüfen</button><a id="panelReleaseLink" class="secondary" rel="noopener noreferrer" target="_blank" hidden>Release auf GitHub öffnen</a></div><div class="actions"><button id="panelStartUpdate" class="primary" disabled>⬆ Signiertes Panel-Update installieren</button><button id="panelShowUpdateLog" class="secondary">⟳ Update-Protokoll</button></div><p class="muted tiny">Nur neuere stabile Releases mit gültiger Ed25519-Signatur. Ein Update startet Apache neu, nicht Minecraft.</p><pre id="panelLiveUpdateLog" class="log" hidden aria-live="polite"></pre><h3>Update-Sicherheitsstatus</h3><div class="panel-security-grid"><div class="panel-security-item"><span>Lokaler öffentlicher Schlüssel</span><strong id="panelTrustKeyState">Wird geprüft …</strong><small id="panelTrustKeyFingerprint" class="muted">–</small></div><div class="panel-security-item"><span>GitHub Release-Signatur</span><strong id="panelReleaseSignatureState">Wird geprüft …</strong><small class="muted">Release-Dateien werden nicht allein durch die Anwesenheit einer Signatur als verifiziert behandelt.</small></div><div class="panel-security-item"><span>Automatische Installation</span><strong id="panelAutoInstallState">Gesperrt (Beta)</strong><small class="muted">Die Versionsprüfung lädt keine Installationsdateien herunter; erst eine bestätigte Updateaktion startet den Hintergrunddienst.</small></div></div><p id="panelSignatureState" class="muted" aria-live="polite">Signaturstatus wird bei der Release-Prüfung ermittelt.</p><h3>Änderungen im neuesten Release</h3><div id="panelReleaseNotes" class="panel-release-markdown" aria-label="Release Notes">–</div><p class="muted tiny">Beta 7: Nach ausdrücklicher Bestätigung installiert der getrennte Root-Dienst nur vollständig verifizierte signierte Releases. Systemskripte bleiben weiterhin außerhalb des Panel-Selbstupdates.</p></article></section><section id="console" class="tab" hidden><article class="card"><div class="flex"><div><h2>Live-Konsole</h2><p class="muted">Ausgabe der bestehenden GNU-SCREEN-Sitzung. Automatische Aktualisierung alle 5 Sekunden.</p></div><button id="reloadConsole" class="secondary">⟳ Aktualisieren</button></div><pre id="consoleOutput" class="log">Wird geladen ...</pre><div class="actions"><button id="consoleList" class="secondary">Spielerliste abfragen</button><button id="consoleDay" class="secondary">Tag einstellen</button><button id="consoleNight" class="secondary">Nacht einstellen</button></div><form id="consoleSayForm" class="actions"><input id="consoleMessage" maxlength="180" placeholder="Nachricht an alle Spieler" required><button class="primary" type="submit">Nachricht senden</button></form><p class="muted tiny">Es sind nur fest definierte Minecraft-Befehle erlaubt. Die Konsole ist keine Linux-Shell.</p></article></section><section id="players" class="tab" hidden><article class="card"><div class="flex"><div><h2>Spielerverwaltung</h2><p class="muted">Online-Spielerzahl über NetherNet, Allowlist und Operatorrechte aus den Serverdateien. Änderungen werden als Minecraft-Konsolenbefehle gesendet.</p></div><button id="playersReload" class="secondary">⟳ Aktualisieren</button></div><p id="playerCount" class="muted">Spielerzahl wird geladen ...</p><h3>Aktuell online</h3><div id="onlinePlayersState" class="muted" aria-live="polite">Spielernamen werden abgefragt ...</div><div id="onlinePlayersList" class="backuplist" aria-live="polite"></div><h3>Allowlist und Rechte</h3><p id="allowlistState" class="muted">Allowlist wird geprüft ...</p><p id="playersWarning" class="muted tiny"></p><div id="managedPlayers" class="backuplist" aria-live="polite">Lade Spielerverwaltung ...</div><p class="muted tiny">Online-Namen werden über die bestehende SCREEN-Konsole mit einer frischen list-Antwort abgefragt. Ein Häkchen auf OP oder Allow zeigt den ermittelten aktiven Zustand. Ein weiterer Klick entfernt die Berechtigung bzw. den Allowlist-Eintrag. Für unbekannte OP-Zustände stehen OP und deOP weiterhin getrennt zur Verfügung. Disallow ist keine eigene Sperrliste: Es bedeutet, einen Spieler aus der Allowlist zu entfernen. Operatorrechte können nur Spielern mit bekannter XUID eindeutig zugeordnet werden. Gesendete Befehle sind nicht automatisch als erfolgreich bestätigt. Die Allowlist wirkt als Zugangsbeschränkung nur, wenn <code>allow-list=true</code> aktiv ist. Kein Minecraft-Neustart für einzelne Allowlist-Einträge nötig.</p></article></section><section id="worlds" class="tab" hidden><article class="card"><div class="flex"><div><h2>Welten-Manager</h2><p class="muted">Wähle eine vorhandene Welt oder lade sie als ZIP bzw. .mcworld herunter. Für konsistente Downloads muss Minecraft gestoppt sein.</p></div><button id="reloadWorlds" class="secondary">⟳ Welten aktualisieren</button></div><div id="worldSummary" class="muted"></div><div id="worldList" class="backuplist">Wird geladen ...</div><p class="muted tiny">Der Wechsel schreibt nur level-name in server.properties. Die neue Welt wird erst beim nächsten manuellen Neustart geladen. Add-ons sind pro Welt getrennt.</p></article><article class="card"><h2>Neue Welt vorbereiten</h2><p class="muted">Der Bedrock-Server erzeugt die neue Welt beim nächsten manuellen Start. Es wird keine bestehende Welt gelöscht.</p><form id="worldCreateForm" class="actions"><input id="worldNewName" maxlength="80" placeholder="Name der neuen Welt" required><button class="primary" type="submit">+ Welt vorbereiten</button></form></article><article class="card"><h2>Welt importieren</h2><p class="muted">.mcworld bis 256 MiB. Server muss gestoppt sein; kein automatischer Neustart.</p><form id="worldImportForm" class="actions"><input id="worldImportName" placeholder="Neuer Weltordner" maxlength="80" required><input id="worldImportFile" type="file" accept=".mcworld" required><button class="primary" type="submit">⬆ Welt importieren</button></form></article></section><section id="settings" class="tab" hidden><article class="card"><h2>⚙ Server-Einstellungen</h2><p class="muted">Bearbeite die vorhandenen Optionen aus server.properties. Kommentare und unbekannte Einträge bleiben erhalten. Änderungen werden erst nach einem manuellen Neustart wirksam.</p><div class="actions"><button id="propertiesReload" class="secondary">⟳ Neu laden</button><button id="propertiesSave" class="primary" disabled>Änderungen speichern</button></div><p id="propertiesState" class="muted">Noch nicht geladen.</p><div id="propertiesFields" class="properties-grid"></div><details><summary>Technische Hinweise</summary><p class="muted">Vor jedem Speichern wird eine Sicherung server.properties.backup-* im Minecraft-Verzeichnis angelegt. Bei Änderungen durch andere Programme musst du neu laden. Der Welten-Manager kann level-name ebenfalls ändern.</p></details></article></section><section id="addons" class="tab" hidden><article class="card"><h2>Add-on Manager</h2><p class="muted">Behavior Packs und Resource Packs der aktiven Welt. Änderungen nur bei gestopptem Server.</p><div class="actions"><button id="reloadAddons" class="secondary">⟳ Pakete aktualisieren</button></div><div class="addon-toolbar"><input id="addonSearch" type="search" placeholder="Name, UUID, Ordner oder Version suchen …" aria-label="Pakete durchsuchen"><select id="addonFilter" aria-label="Paketfilter"><option value="active">Aktive Add-ons</option><option value="other">Weitere Pakete</option><option value="system">System-/Standardpakete</option><option value="all">Alle Pakete</option></select><select id="addonKind" aria-label="Pakettyp"><option value="all">BP und RP</option><option value="behavior">Behavior Packs</option><option value="resource">Resource Packs</option></select></div><div id="addonSummary" class="muted tiny"></div><h3>Installierte Pakete</h3><div id="addonList" class="backuplist">Wird geladen ...</div></article><article class="card"><h2>Neues Add-on installieren</h2><p class="muted">Unterstützt .mcaddon, .mcpack und .zip bis 256 MB. Server vorher stoppen; danach Pakete für die Welt aktivieren.</p><form id="addonUploadForm"><input id="addonFile" type="file" accept=".mcaddon,.mcpack,.zip" required><button class="primary" type="submit">⬆ Add-on hochladen</button></form><p class="muted tiny">Es werden nur Pakete mit gültigem manifest.json übernommen. Bestehende Pakete werden nicht überschrieben. Vor Änderungen Welt-Backup erstellen.</p></article></section><section id="backups" class="tab" hidden><article class="card"><div class="flex"><div><h2>Backup-Verwaltung</h2><p class="muted">Vorhandene Sicherungen auf dem Debian-Server.</p></div><button data-action="backup" class="primary">+ Backup erstellen</button></div><div id="backupList" class="backuplist">Wird geladen ...</div><p class="muted tiny">Wiederherstellung und Download sind aus Sicherheitsgründen nicht über das Web freigeschaltet.</p></article></section><section id="logs" class="tab" hidden><article class="card"><div class="flex"><h2>Systemprotokolle</h2><div class="actions"><select id="logType"><option value="server">Minecraft-Dienst</option><option value="update">Update-Manager</option></select><button id="reloadLogs" class="secondary">Aktualisieren</button></div></div><pre id="logOutput" class="log">–</pre><p class="muted tiny">Die systemd-Protokolle enthalten möglicherweise nicht die Minecraft-SCREEN-Konsole.</p></article></section><footer>DRACOROCK CONTROL v3.1.0 · Lokale Installation · Nur für autorisierte Administratoren</footer></main></div><script src="assets/app.js?v=3.1.0-alerts2" defer></script></body></html>
