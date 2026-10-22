/* Cache e Redis: diagnóstico de leitura, tradução e edição assistida da rotina nativa. */
(function(){
 'use strict';var current=null;
 var words={
 'Maximum Performance':'Recursos de desempenho','Good Performance':'Recursos de desempenho',
 "You're using both Caching and Redis Connection Handler, your service is optimised for":'Cache e gerenciador Redis estão habilitados nas configurações. Confira o diagnóstico abaixo para validar a conexão e o',
 'maximum performance':'estado do serviço',
 'Your last cron execution was at':'A última execução da rotina ocorreu em',
 '. If it takes longer to run a cron than the time between executions, you will have issues as the caching will be cut off before completion.':'. Se a execução demorar mais que o intervalo configurado, o cache poderá ser interrompido antes de terminar.',
 "Please ensure the cron format is correct, otherwise it won't run.":'Confira o formato da rotina; uma expressão inválida impede a execução.',
 'Minute':'Minuto','Hour':'Hora','Thread Count':'Quantidade de threads','Update Changes Only':'Atualizar somente alterações','Streams':'Canais','Lines':'Contas','Series':'Séries','Time Taken':'Tempo de execução',
 'Disable Cache':'Desativar cache','Enable Cache':'Ativar cache','Regenerate Cache':'Reconstruir cache','Save Cron':'Salvar agendamento',
 'Server Status':'Estado do servidor','Authentication':'Autenticação','ONLINE':'Ativo','OFFLINE':'Indisponível','AUTHENTICATED':'Autenticado','VALID PASSWORD':'Autenticação válida','INVALID PASSWORD':'Autenticação inválida',
 'Disable Handler':'Desativar gerenciador','Enable Handler':'Ativar gerenciador','Clear Database':'Limpar dados do Redis','Pros & Cons':'Vantagens e limitações',
 'The handler will allow all connections from clients to load balancers to be verified and managed using Redis rather than through mysql connections.':'O gerenciador valida e administra as conexões dos clientes nos servidores de distribuição usando Redis.',
 'Disabling Redis handler will disconnect all of your active clients, enabling it however should move the live connections from MySQL to Redis without disconnects.':'Desativar o gerenciador Redis desconecta os clientes ativos. Ao ativá-lo, o painel procura transferir as conexões do MySQL para o Redis sem desconectá-las.',
 "Before deciding whether Redis Connection Handler is right for you, you should know a few things. Firstly, enabling Redis will significantly increase XUI's ability to handle connections as the previous bottleneck would be from MySQL not being able to handle the amount of incoming client requests. You'll also find that zap time will be quicker, CPU should be lower and things will generally run quite smoothly.":'O Redis pode ampliar a capacidade de conexões e reduzir a carga do MySQL em servidores movimentados. O resultado depende da quantidade de clientes, das fontes e dos recursos do servidor.',
 'The drawbacks from using Redis is that the live connection database is stored in memory, although a backup is periodically written, restarting XUI can result in connection losses. In addition to this, your ability to filter or search some content in the Admin or Reseller interface will be diminished. For example, with Redis on you can only sort Live Connections by Time Active ascending or descending and you cannot search the live connection list. You also lose the ability to sort by Active Connections in Lines or Content pages etc.':'As conexões ativas ficam na memória. Mesmo com gravações periódicas de backup, reiniciar o painel pode desconectar clientes. Algumas pesquisas e ordenações também ficam limitadas: a lista de conexões pode ser ordenada pelo tempo ativo, mas sua pesquisa e a ordenação por conexões ativas em contas e conteúdo deixam de estar disponíveis.',
 'The best way to decide if Redis is right for you is to try it for yourself.':'Acompanhe os indicadores e o comportamento dos clientes para escolher a configuração adequada ao seu servidor.',
 'Clear':'Limpar','Cancel':'Cancelar','Are you sure you want to clear the Redis database? This will drop all connections.':'Limpar os dados do Redis desconecta todos os clientes ativos. Deseja continuar?',
 'Cache has been completely disabled!':'Cache desativado.','Cache has been completely regenerated!':'Reconstrução do cache solicitada.','Cache has been completely enabled!':'Cache ativado.','Handler has been completely disabled!':'Gerenciador desativado.','Handler has been enabled!':'Gerenciador ativado.','Redis database has been cleared!':'Dados do Redis limpos.','An error occured while processing your request.':'Não foi possível concluir a operação.'
 };
 function translate(){
  var roots=[document.querySelector('.wrapper')].concat(Array.from(document.querySelectorAll('.jBox-container,.jq-toast-wrap')));
  roots.filter(Boolean).forEach(function(root){var walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT),node;
   while((node=walker.nextNode())){if(node.parentElement.closest('script,style,textarea,code,pre,[data-naxx-cache-tools]'))continue;var key=node.nodeValue.replace(/\s+/g,' ').trim(),value=words[key];if(value)node.nodeValue=(/^\s/.test(node.nodeValue)?' ':'')+value+(/\s$/.test(node.nodeValue)?' ':'');}
   root.querySelectorAll('input[type="submit"]').forEach(function(input){if(words[input.value])input.value=words[input.value];});
  });
 }
 function cronPart(value,max){
  if(!value||value.length>128)return false;
  return value.split(',').every(function(part){var match=part.match(/^(\*|\d+(?:-\d+)?)(?:\/(\d+))?$/);if(!match)return false;if(match[2]&&(+match[2]<1||+match[2]>max+1))return false;if(match[1]==='*')return true;var range=match[1].split('-').map(Number);return range.every(function(n){return n>=0&&n<=max;})&&(range.length===1||range[0]<=range[1]);});
 }
 function bytes(value){if(!Number.isFinite(value))return '—';if(value===0)return '0 B';var unit=Math.min(3,Math.floor(Math.log(value)/Math.log(1024)));return new Intl.NumberFormat('pt-BR',{maximumFractionDigits:1}).format(value/Math.pow(1024,unit))+' '+['B','KB','MB','GB'][unit];}
 function mount(){
  var table=document.getElementById('datatable-cache'),minute=document.getElementById('minute'),hour=document.getElementById('hour'),threads=document.getElementById('cache_thread_count');if(!table||!minute||!hour||!threads)return;
  var root=document.createElement('section');root.className='card naxx-cache-tools';root.dataset.naxxCacheTools='';
  root.innerHTML='<div class="card-body"><div class="naxx-cache-tools-heading"><div><h5 class="header-title">Diagnóstico de cache e Redis</h5><p class="text-muted">Indicadores do Redis deste servidor, sem alterar os canais.</p></div><div class="naxx-cache-tool-actions"><button type="button" class="btn btn-primary" data-cache-refresh>Atualizar diagnóstico</button><button type="button" class="btn btn-light" data-cache-report disabled>Baixar relatório</button></div></div><p data-cache-status role="status" aria-live="polite">Consultando o serviço…</p><div class="naxx-cache-metrics">'+[['latency','Tempo de resposta'],['memory','Memória utilizada'],['peak','Pico de memória'],['keys','Chaves armazenadas'],['clients','Clientes Redis'],['rate','Taxa de acertos']].map(function(pair){return '<div><span>'+pair[1]+'</span><strong data-cache-metric="'+pair[0]+'">—</strong></div>';}).join('')+'</div><p class="naxx-cache-diagnostic-note text-muted" data-cache-note></p><label class="naxx-cache-auto"><input type="checkbox" data-cache-auto> Atualizar a cada 30 segundos enquanto esta página estiver visível</label></div>';
  var nativeCard=table.closest('.card');nativeCard.before(root);
  Array.from(document.querySelectorAll('.wrapper .card')).some(function(card){if(card!==nativeCard&&card.querySelector('.progress')){card.classList.add('naxx-cache-performance');return true;}return false;});
  [['#cache','Cache do painel'],['#connections','Conexões Redis']].forEach(function(pair){var link=document.querySelector('.nav-link[href="'+pair[0]+'"]'),span=link&&link.querySelector('span');if(span){span.classList.remove('d-none','d-sm-inline');span.textContent=pair[1];link.setAttribute('aria-label',pair[1]);}});
  var presets=document.createElement('section');presets.className='naxx-cache-presets';presets.innerHTML='<h6>Perfis de agendamento</h6><p class="text-muted">Preencha um perfil e use “Salvar agendamento” para aplicar.</p><div class="naxx-cache-preset-buttons"><button type="button" class="btn btn-light" data-cache-preset="10,1">Econômico · 10 min</button><button type="button" class="btn btn-light" data-cache-preset="5,2">Equilibrado · 5 min</button><button type="button" class="btn btn-light" data-cache-preset="2,2">Mais frequente · 2 min</button><button type="button" class="btn btn-outline-primary" data-cache-restore>Restaurar campos</button></div><p data-cache-schedule role="status"></p></section>';
  table.closest('.form-group').before(presets);
  var form=minute.closest('form'),original={minute:minute.value,hour:hour.value,threads:threads.value},timer=null,controller=null,last=null,pending=false;
  var status=root.querySelector('[data-cache-status]'),refresh=root.querySelector('[data-cache-refresh]'),auto=root.querySelector('[data-cache-auto]'),report=root.querySelector('[data-cache-report]');
  function schedule(){clearTimeout(timer);if(root.isConnected&&auto.checked&&!document.hidden)timer=setTimeout(load,30000);}
  function put(key,value){var node=root.querySelector('[data-cache-metric="'+key+'"]');if(node.textContent!==value)node.textContent=value;}
  async function load(){
   if(pending||!root.isConnected)return;pending=true;refresh.disabled=true;refresh.textContent='Consultando…';controller=new AbortController();var timeout=setTimeout(function(){controller.abort();},12000);
   try{var response=await fetch('naxx-update.php?feature=cache',{credentials:'same-origin',cache:'no-store',signal:controller.signal,headers:{'Accept':'application/json'}}),type=response.headers.get('content-type')||'';if(!type.includes('application/json'))throw new Error('A sessão expirou. Entre novamente no painel.');var data=await response.json();if(!response.ok||!data.ok)throw new Error(data.message||'Não foi possível consultar o diagnóstico.');last=data;report.disabled=false;
    var r=data.redis,online=r.status==='online';status.dataset.state=online?'success':'error';status.textContent=(online?'Redis respondeu':'Redis indisponível')+' · '+new Date(data.checked_at).toLocaleTimeString('pt-BR');
    put('latency',online?r.latency_ms.toLocaleString('pt-BR')+' ms':'—');put('memory',bytes(r.used_memory));put('peak',bytes(r.peak_memory));put('keys',online?r.keys.toLocaleString('pt-BR'):'—');put('clients',online?r.clients.toLocaleString('pt-BR'):'—');put('rate',online&&r.hit_rate!==null?r.hit_rate.toLocaleString('pt-BR')+'%':'—');
    root.querySelector('[data-cache-note]').textContent=online?(data.cache.native_redis_warning?'O Redis local respondeu, mas o painel informa uma falha na conexão ou autenticação. Revise a configuração do gerenciador antes de alterar seu estado.':(r.max_memory?'Limite de memória: '+bytes(r.max_memory)+'. ':'Sem limite de memória definido no Redis. ')+(r.operations_per_second||0)+' operações/s. Clientes Redis incluem processos internos do painel.'):r.message;
    Array.from(table.querySelectorAll('button')).forEach(function(button,index){var value=data.cache.counts[index];if(value&&button.textContent.trim()!==value)button.textContent=value;});
   }catch(error){status.dataset.state='error';status.textContent=error.name==='AbortError'?'O diagnóstico demorou para responder. Tente novamente.':error.message;}
   finally{clearTimeout(timeout);pending=false;refresh.disabled=false;refresh.textContent='Atualizar diagnóstico';schedule();}
  }
  function describe(){
   var validMinute=cronPart(minute.value.trim(),59),validHour=cronPart(hour.value.trim(),23),validThreads=/^\d+$/.test(threads.value)&&+threads.value>=1&&+threads.value<=256;
   minute.setCustomValidity(validMinute?'':'Informe um minuto válido, de 0 a 59, ou uma expressão como */5.');hour.setCustomValidity(validHour?'':'Informe uma hora válida, de 0 a 23, ou * para todas.');threads.setCustomValidity(validThreads?'':'Informe de 1 a 256 threads.');
   var note=presets.querySelector('[data-cache-schedule]');note.dataset.state=validMinute&&validHour&&validThreads?'success':'error';
   var match=minute.value.match(/^\*\/(\d+)$/);note.textContent=!validMinute||!validHour||!validThreads?'Revise os campos de minuto, hora e quantidade de threads.':(match&&hour.value==='*'?'Execução a cada '+match[1]+' minutos.':'Agendamento: minuto '+minute.value+' · hora '+hour.value+'.')+' '+threads.value+' thread(s). Aumentar a frequência ou as threads pode elevar o uso do servidor.';
   return validMinute&&validHour&&validThreads;
  }
  presets.addEventListener('click',function(event){var preset=event.target.closest('[data-cache-preset]');if(preset){var values=preset.dataset.cachePreset.split(',');minute.value='*/'+values[0];hour.value='*';threads.value=values[1];describe();}if(event.target.closest('[data-cache-restore]')){minute.value=original.minute;hour.value=original.hour;threads.value=original.threads;describe();}});
  [minute,hour,threads].forEach(function(input){input.addEventListener('input',describe);});
  function validate(event){if(!describe()){event.preventDefault();event.stopImmediatePropagation();form.reportValidity();}}
  form.addEventListener('submit',validate,true);refresh.addEventListener('click',load);auto.addEventListener('change',schedule);
  function visibility(){clearTimeout(timer);if(auto.checked&&!document.hidden)load();}document.addEventListener('visibilitychange',visibility);
  report.addEventListener('click',function(){if(!last)return;var url=URL.createObjectURL(new Blob([JSON.stringify(last,null,2)],{type:'application/json'})),link=document.createElement('a');link.href=url;link.download='naxx-diagnostico-cache-'+new Date().toISOString().slice(0,10)+'.json';link.click();setTimeout(function(){URL.revokeObjectURL(url);},1000);});
  current={root:root,destroy:function(){clearTimeout(timer);if(controller)controller.abort();document.removeEventListener('visibilitychange',visibility);form.removeEventListener('submit',validate,true);}};
  describe();load();
 }
 window.NaxxCache={enhance:function(){if(!/\/cache(?:\.php)?$/.test(location.pathname)){if(current){current.destroy();current=null;}return;}translate();if(current&&current.root.isConnected)return;if(current)current.destroy();mount();},validCronPart:cronPart};
}());
