<?php
// Diagnóstico somente de leitura. Executado pelo endpoint administrativo já instalado.
ini_set('display_errors','0');set_time_limit(12);
$naxxCacheDone=false;
function naxxCacheReply($code,$value){
 $GLOBALS['naxxCacheDone']=true;while(ob_get_level())ob_end_clean();
 if(session_status()===PHP_SESSION_ACTIVE)session_write_close();
 header_remove('Location');header_remove('Content-Length');http_response_code($code);
 header('Content-Type: application/json; charset=utf-8');header('Cache-Control: no-store');header('X-Content-Type-Options: nosniff');
 echo json_encode($value,JSON_UNESCAPED_UNICODE|JSON_INVALID_UTF8_SUBSTITUTE);exit;
}
register_shutdown_function(function(){if(empty($GLOBALS['naxxCacheDone']))naxxCacheReply(403,['ok'=>false,'message'=>'Entre com uma conta autorizada a acessar as configurações de cache.']);});
if(($_SERVER['REQUEST_METHOD']??'GET')!=='GET'){header('Allow: GET');naxxCacheReply(405,['ok'=>false,'message'=>'O diagnóstico aceita somente consultas.']);}
$_GET=$_POST=$_REQUEST=[];
$naxxCacheHtml='';
ob_start(function($chunk)use(&$naxxCacheHtml){if(strlen($naxxCacheHtml)<2*1024*1024)$naxxCacheHtml.=$chunk;return '';},8192);
require __DIR__.'/cache.php';ob_end_flush();
$redirect=false;foreach(headers_list()as$line)if(stripos($line,'Location:')===0)$redirect=true;
if($redirect||http_response_code()>=300||!preg_match('/\bid\s*=\s*[\x22\x27](?:cache_thread_count|enable_cache|disable_cache|enable_handler|disable_handler)[\x22\x27]/',$naxxCacheHtml))naxxCacheReply(403,['ok'=>false,'message'=>'Entre com uma conta autorizada a acessar as configurações de cache.']);
if(session_status()===PHP_SESSION_ACTIVE)session_write_close();
$document=new DOMDocument();$previous=libxml_use_internal_errors(true);$document->loadHTML($naxxCacheHtml,LIBXML_NONET|LIBXML_NOERROR|LIBXML_NOWARNING);libxml_clear_errors();libxml_use_internal_errors($previous);
$cache=['enabled'=>(bool)$document->getElementById('disable_cache'),'handler_enabled'=>(bool)$document->getElementById('disable_handler'),'last_run'=>null,'counts'=>[]];
if(preg_match('/Your last cron execution was at\s*(?:<strong>)?([0-9-]+\s+[0-9:]+)/',$naxxCacheHtml,$date))$cache['last_run']=$date[1];
$table=$document->getElementById('datatable-cache');if($table)foreach($table->getElementsByTagName('button')as$button)$cache['counts'][]=trim($button->textContent);
$nativeRedis=$document->getElementById('datatable-redis');$cache['native_redis_warning']=$nativeRedis?(bool)preg_match('/OFFLINE|INVALID PASSWORD/i',$nativeRedis->textContent):false;
$redis=['status'=>'unavailable','message'=>'A extensão Redis não está disponível neste servidor.'];$client=null;
if(class_exists('Redis')){
 $connected=false;
 try{
  $config=@file_get_contents(dirname(__DIR__).'/bin/redis/redis.conf',false,null,0,1024*1024);
  if($config===false)throw new RuntimeException('configuration');
  $port=6379;if(preg_match('/^\s*port\s+(\d+)\s*$/m',$config,$match))$port=(int)$match[1];
  if($port<1||$port>65535)throw new RuntimeException('configuration');
  $password='';if(preg_match('/^\s*requirepass\s+(.+?)\s*$/m',$config,$match)){
   $value=trim($match[1]);
   if($value[0]==='"'&&substr($value,-1)==='"')$password=stripcslashes(substr($value,1,-1));
   elseif($value[0]==="'"&&substr($value,-1)==="'")$password=substr($value,1,-1);
   else{$parts=preg_split('/\s+/', $value);$password=$parts[0];}
  }
  $client=new Redis();$start=microtime(true);$connected=$client->connect('127.0.0.1',$port,0.8);
  if(!$connected)throw new RuntimeException('connection');$client->setOption(Redis::OPT_READ_TIMEOUT,1.0);
  if($password!==''&&!$client->auth($password))throw new RuntimeException('authentication');
  $client->ping();$latency=round((microtime(true)-$start)*1000,2);
  $memory=$client->info('memory');$stats=$client->info('stats');$clients=$client->info('clients');$server=$client->info('server');$keyspace=$client->info('keyspace');
  $keys=0;foreach($keyspace as$db=>$value){if(!preg_match('/^db\d+$/',$db))continue;if(is_array($value))$keys+=(int)($value['keys']??0);elseif(preg_match('/(?:^|,)keys=(\d+)/',$value,$match))$keys+=(int)$match[1];}
  $hits=(int)($stats['keyspace_hits']??0);$misses=(int)($stats['keyspace_misses']??0);
  $redis=['status'=>'online','message'=>'Redis respondeu ao diagnóstico local.','latency_ms'=>$latency,'used_memory'=>(int)($memory['used_memory']??0),'peak_memory'=>(int)($memory['used_memory_peak']??0),'max_memory'=>(int)($memory['maxmemory']??0),'clients'=>(int)($clients['connected_clients']??0),'keys'=>$keys,'hits'=>$hits,'misses'=>$misses,'hit_rate'=>$hits+$misses?round($hits/($hits+$misses)*100,1):null,'evictions'=>(int)($stats['evicted_keys']??0),'operations_per_second'=>(int)($stats['instantaneous_ops_per_sec']??0),'uptime_seconds'=>(int)($server['uptime_in_seconds']??0)];
 }catch(Throwable$error){$redis=['status'=>$connected?'authentication_error':'offline','message'=>$connected?'Não foi possível autenticar ou consultar o Redis com a configuração local.':'Não foi possível consultar o Redis local. Confira o serviço e sua configuração.'];}
 finally{if($client){try{$client->close();}catch(Throwable$error){}}}
}
naxxCacheReply(200,['ok'=>true,'checked_at'=>date('c'),'cache'=>$cache,'redis'=>$redis]);
