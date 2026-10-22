/* Integração com os formulários e a autenticação nativos do painel. */
(function(){'use strict';
  function start(){
    var form=document.getElementById('stream_form');if(!form)return;
    var shell=form.closest('.card');if(shell)shell.classList.add('naxx-import-shell');
    var root=document.createElement('div');root.id='importer-root';
    document.title='XUI NAXX · Importador';
    var heading=document.querySelector('.page-title');if(heading)heading.textContent='Importador de catálogo';
    var details=document.createElement('details');details.className='naxx-native-options';details.innerHTML='<summary>Configurações avançadas e revisão detalhada</summary><p class="text-muted">As opções originais de categorias, listas, servidores, transcodificação e revisão estão disponíveis abaixo. Ao importar, as configurações abertas para cada tipo serão usadas.</p><div class="naxx-import-tabs"></div><div data-native-frames></div>';
    form.parentNode.insertBefore(root,form);form.parentNode.insertBefore(details,form);form.hidden=true;
    var frames={},routes={channel:'stream?import=1',movie:'movie?import=1',series:'serie?import=1',reviewChannel:'review?type=1',reviewMovie:'review?type=2'};
    Object.keys(routes).forEach(function(type){var button=document.createElement('button');button.type='button';button.className='btn btn-light';button.textContent={channel:'Canais',movie:'Filmes',series:'Séries',reviewChannel:'Revisão de canais',reviewMovie:'Revisão de filmes'}[type];details.querySelector('.naxx-import-tabs').appendChild(button);button.addEventListener('click',function(){Object.keys(frames).forEach(function(key){frames[key].hidden=true;});if(!frames[type]){var frame=document.createElement('iframe');frame.className='naxx-config-frame';frame.title='Configurações nativas: '+button.textContent;frame.src=routes[type]+'&naxx_embed=1';frames[type]=frame;details.querySelector('[data-native-frames]').appendChild(frame);}frames[type].hidden=false;});});
    var panel=document.createElement('div');panel.className='card';panel.innerHTML='<div class="card-body"><h2 class="header-title">Destino da importação</h2><p class="text-muted">Revise a lista e grave canais, filmes e séries diretamente no painel.</p><label for="naxx-mode">Modo dos canais ao vivo</label><select id="naxx-mode" class="custom-select"><option value="ondemand">Iniciar somente quando alguém reproduzir (recomendado)</option><option value="direct">Fonte direta (sem retransmissão pelo servidor)</option><option value="offline">Cadastrar sem iniciar transmissão</option></select><p class="text-muted mt-2 mb-0">No modo sob demanda, o painel inicia a fonte quando o canal é reproduzido e a encerra sem espectadores. Isso reduz o uso contínuo de CPU. Filmes e séries seguem as configurações nativas.</p></div>';
    root.before(panel);
    var progress=document.createElement('section');progress.className='naxx-transfer';progress.hidden=true;progress.innerHTML='<div class="naxx-transfer-heading"><strong>Importação no painel</strong><span data-transfer-count></span></div><div class="progress"><div class="progress-bar" role="progressbar" aria-label="Progresso da importação" aria-valuemin="0" aria-valuemax="100" style="width:0%"></div></div><p data-transfer-status role="status" aria-live="polite"></p><div class="d-flex flex-wrap" style="gap:8px"><button type="button" class="btn btn-light" data-pause>Pause após este lote</button><button type="button" class="btn btn-light" data-stop>Cancelar próximos lotes</button></div>';panel.querySelector('.card-body').appendChild(progress);
    var paused=false,stopped=false,running=false,total=0,done=0;
    var pause=progress.querySelector('[data-pause]'),stop=progress.querySelector('[data-stop]');
    pause.addEventListener('click',function(){paused=!paused;pause.textContent=paused?'Retomar importação':'Pausar após este lote';if(paused)say('Pausa solicitada. O lote atual será concluído.');});
    stop.addEventListener('click',function(){stopped=true;paused=false;say('Cancelamento solicitado. O lote atual será concluído.');stop.disabled=true;});
    function say(text){progress.hidden=false;progress.querySelector('[data-transfer-status]').textContent=text;progress.querySelector('[data-transfer-count]').textContent=done+' / '+total;var percent=total?Math.round(done/total*100):0,bar=progress.querySelector('.progress-bar');bar.style.width=percent+'%';bar.setAttribute('aria-valuenow',percent);}
    function delay(ms){return new Promise(function(resolve){setTimeout(resolve,ms);});}
    async function checkpoint(){while(paused&&!stopped){say('Pausado. Clique em Retomar importação para continuar.');await delay(250);}if(stopped)throw new Error('Importação interrompida. '+done+' conteúdos já enviados; os demais continuam na revisão.');}
    window.addEventListener('beforeunload',function(event){if(running){event.preventDefault();event.returnValue='';}});
    document.addEventListener('click',function(event){
      var link=event.target.closest('#topnav a[href]');
      if(!running||!link||event.ctrlKey||event.metaKey||/^(#|javascript:)/.test(link.getAttribute('href')))return;
      // A navegação parcial original cancela os timers da fila. Outra aba mantém o envio.
      event.preventDefault();event.stopImmediatePropagation();window.open(link.href,'_blank','noopener');
    },true);
    async function nativeForm(route){
      var response=await fetch(route,{credentials:'same-origin',cache:'no-store'});if(!response.ok||/\/(login|license)(?:[?/]|$)/.test(response.url))throw new Error('Sua sessão expirou. Entre novamente no painel.');
      var doc=new DOMParser().parseFromString(await response.text(),'text/html'),form=doc.querySelector('form');
      if(!form)throw new Error('O formulário nativo não está disponível para '+route+'. Verifique as permissões.');
      return {doc:doc,form:form,data:new FormData(form)};
    }
    async function post(action,data){
      var response=await fetch('post.php?action='+encodeURIComponent(action)+'&referer='+encodeURIComponent(action+'?import=1'),{method:'POST',body:data,credentials:'same-origin',headers:{'X-Requested-With':'XMLHttpRequest','Accept':'application/json'}});
      if(!response.ok)throw new Error('O servidor recusou a importação ('+response.status+').');
      if(/\/(login|license)(?:[?/]|$)/.test(response.url))throw new Error('Sua sessão expirou. Entre novamente no painel.');
      var body=await response.text();
      if(!body.trim())throw new Error('O painel retornou uma resposta vazia. Não foi possível confirmar este lote; confira o conteúdo cadastrado antes de tentar novamente.');
      var result;try{result=JSON.parse(body);}catch(e){throw new Error('O painel retornou uma resposta que não é JSON válido. Não foi possível confirmar este lote; confira sua sessão e os registros do servidor.');}
      if(!result||typeof result!=='object'||Array.isArray(result))throw new Error('O painel retornou um formato JSON inesperado. Não foi possível confirmar este lote.');
      if(typeof result.location==='string'&&/(?:^|\/)(?:login|license)(?:[?.#]|$)/i.test(result.location))throw new Error('Sua sessão expirou. Entre novamente no painel. Não foi possível confirmar este lote.');
      if(typeof result.location!=='string'||!result.location.trim())throw new Error('O importador nativo recusou o lote'+(result.status!==undefined?' (código '+result.status+')':' sem confirmar o cadastro')+'.');
      return result;
    }
    var committed=new Set();
    function cloneData(source){var copy=new FormData();source.forEach(function(value,key){copy.append(key,value);});return copy;}
    function categoryMap(doc){var map=new Map();doc.querySelectorAll('select[name="category_id[]"] option').forEach(function(option){if(option.value)map.set(option.textContent.trim().toLocaleLowerCase('pt-BR'),option.value);});return map;}
    function setDefaultOnDemand(data,doc){
      var servers=Array.from(doc.querySelectorAll('#on_demand option')).filter(function(option){return /^[1-9]\d*$/.test(option.value);});
      if(!servers.length)throw new Error('Nenhum servidor está disponível para os canais sob demanda. Revise os servidores nas configurações avançadas.');
      var tree=[{id:'source',parent:'#',text:'Online',icon:'mdi mdi-play',state:{opened:true}}];
      data.delete('on_demand[]');
      servers.forEach(function(option){data.append('on_demand[]',option.value);tree.push({id:option.value,parent:'source',text:option.textContent,icon:'mdi mdi-server-network',state:{opened:true}});});
      // O importador nativo só cria os destinos presentes na árvore online.
      // on_demand[] sozinho deixava o canal cadastrado sem servidor de reprodução.
      data.set('server_tree_data',JSON.stringify(tree));
    }
    async function commit(items){
      var modeControl=document.getElementById('naxx-mode'),channelMode=modeControl.value;
      done=0;total=items.length;paused=false;stopped=false;running=true;modeControl.disabled=true;details.setAttribute('inert','');details.classList.add('naxx-options-busy');pause.disabled=false;stop.disabled=false;pause.textContent='Pausar após este lote';
      // Uma única referência por item pendente; evita copiar todos por tipo e depois categoria.
      var groups={channel:new Map(),movie:new Map(),series:new Map()};
      items.forEach(function(item){if(committed.has(item.url)){done++;return;}var group=groups[item.type],list=group.get(item.category);if(!list){list=[];group.set(item.category,list);}list.push(item);});
      try{
        for(var type of ['channel','movie','series']){
          if(!groups[type].size)continue;
          await checkpoint();
          var action={channel:'stream',movie:'movie',series:'serie'}[type];
          say('Importando '+({channel:'canais',movie:'filmes',series:'séries'}[type])+'… '+done+' de '+items.length+' processados.');
          var native=await nativeForm(action+'?import=1'),data=native.data,configured=frames[type];
          if(configured){var doc=configured.contentDocument,nativeConfig=doc&&doc.querySelector('form');if(!nativeConfig)throw new Error('Aguarde o carregamento das configurações de '+type+'.');data=new FormData(nativeConfig);var jq=configured.contentWindow.jQuery;if(jq&&jq.fn.jstree&&doc.getElementById('server_tree'))data.set('server_tree_data',JSON.stringify(jq('#server_tree').jstree(true).get_json('source',{flat:true})));}
          // Este botão importa a lista revisada. A ação por pasta fica no formulário avançado.
          data.delete('import_folder');data.delete('scan_recursive');
          if(!configured){
            if(native.form.querySelector('[name="direct_source"]')){data.delete('direct_source');if(type==='channel'&&channelMode==='direct')data.set('direct_source','on');}
            if(native.form.querySelector('[name="server_tree_data"]'))data.set('server_tree_data','[]');
            if(type==='channel'&&channelMode==='ondemand')setDefaultOnDemand(data,native.doc);
            if(native.form.querySelector('[name="disable_tmdb"]'))data.set('disable_tmdb','on');
            data.delete('restart_on_edit');data.delete('update_existing');
          }else if(type==='channel'&&channelMode==='ondemand'){
            var configuredTree=[];try{configuredTree=JSON.parse(data.get('server_tree_data')||'[]');}catch(_){}
            var configuredServers=Array.isArray(configuredTree)?configuredTree.filter(function(node){return node&&/^[1-9]\d*$/.test(String(node.id))&&node.parent!=='#';}):[];
            if(!configuredServers.length)throw new Error('Escolha um servidor na árvore Online das configurações avançadas para importar canais sob demanda.');
            data.delete('on_demand[]');configuredServers.forEach(function(node){data.append('on_demand[]',String(node.id));});
          }
          var byCategory=groups[type],available=categoryMap(native.doc);
          for(var entry of byCategory){
            var category=entry[0],list=entry[1],key=category.toLocaleLowerCase('pt-BR');
            for(var offset=0;offset<list.length;offset+=100){
              await checkpoint();var batch=list.slice(offset,offset+100),payload=cloneData(data),categoryId=available.get(key);
              say('Enviando '+({channel:'canais',movie:'filmes',series:'episódios'}[type])+' · '+category);
              var newCategories=[];try{newCategories=JSON.parse(payload.get('category_create_list')||'[]');}catch(_){}
              if(categoryId)payload.append('category_id[]',categoryId);
              else{payload.append('category_id[]',category);if(!newCategories.includes(category))newCategories.push(category);}
              payload.set('category_create_list',JSON.stringify(newCategories));
              payload.set('m3u_file',new File([NaxxImporter.toM3U(batch)],'naxx-'+type+'.m3u',{type:'audio/x-mpegurl'}));
              var sentAt=Date.now();await post(action,payload);var requestTime=Date.now()-sentAt;
              batch.forEach(function(i){committed.add(i.url);});done+=batch.length;
              say(done+' conteúdos enviados.');
              // Um servidor mais lento recebe um intervalo maior; nunca há POSTs paralelos.
              if(done<total)await delay(Math.min(5000,Math.max(600,requestTime)));
              if(offset+100<list.length&&!categoryId){available=categoryMap((await nativeForm(action+'?import=1')).doc);if(!available.has(key))throw new Error('A categoria "'+category+'" ainda não foi confirmada pelo painel. Aguarde o processamento e tente novamente.');}
            }
          }
          groups[type].clear();
        }
        say('Importação concluída: '+done+' conteúdos enviados aos importadores do painel. Consulte Canais, Filmes e Séries para acompanhar o processamento.');
        return {message:'Importação concluída. '+done+' conteúdos enviados ao painel.'};
      }catch(error){throw new Error((done?'Lotes anteriores enviados: '+done+'. Ao tentar novamente, eles serão ignorados nesta sessão. ':'')+error.message);}
      finally{running=false;modeControl.disabled=false;details.removeAttribute('inert');details.classList.remove('naxx-options-busy');pause.disabled=true;stop.disabled=true;}
    }
    NaxxImporterUI.mount(root,{urlEndpoint:'naxx-import-url.php',workerURL:'assets/js/naxx-importer-worker.js?v=1.5.14-5',onImport:commit,commitLabel:'Importar no painel',commitHelp:'As categorias serão vinculadas pelos formulários do painel. A importação avança em lotes e pode ser pausada ou interrompida.'});
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
}());
