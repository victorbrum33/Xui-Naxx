/* Integração com os formulários e a autenticação nativos do painel. */
(function(){'use strict';
  function start(){
    var form=document.getElementById('stream_form');if(!form)return;
    var shell=form.closest('.card');if(shell)shell.classList.add('naxx-import-shell');
    var root=document.createElement('div');root.id='importer-root';
    document.title='XUI NAXX · Importador';
    var heading=document.querySelector('.page-title');if(heading)heading.textContent='Importador de catálogo';
    var details=document.createElement('details');details.className='naxx-native-options';details.innerHTML='<summary>Configurações avançadas e revisão detalhada</summary><p class="text-muted">As opções originais de categorias, listas, servidores, transcodificação e revisão estão disponíveis abaixo. Ao importar, as configurações abertas para cada tipo serão usadas, com os bouquets escolhidos no destino da importação.</p><div class="naxx-import-tabs"></div><div data-native-frames></div>';
    form.parentNode.insertBefore(root,form);form.parentNode.insertBefore(details,form);form.hidden=true;
    var frames={},routes={channel:'stream?import=1',movie:'movie?import=1',series:'serie?import=1',reviewChannel:'review?type=1',reviewMovie:'review?type=2'};
    Object.keys(routes).forEach(function(type){var button=document.createElement('button');button.type='button';button.className='btn btn-light';button.textContent={channel:'Canais',movie:'Filmes',series:'Séries',reviewChannel:'Revisão de canais',reviewMovie:'Revisão de filmes'}[type];details.querySelector('.naxx-import-tabs').appendChild(button);button.addEventListener('click',function(){Object.keys(frames).forEach(function(key){frames[key].hidden=true;});if(!frames[type]){var frame=document.createElement('iframe');frame.className='naxx-config-frame';frame.title='Configurações nativas: '+button.textContent;frame.src=routes[type]+'&naxx_embed=1';frames[type]=frame;details.querySelector('[data-native-frames]').appendChild(frame);}frames[type].hidden=false;});});
    var panel=document.createElement('div');panel.className='card';panel.innerHTML='<div class="card-body"><h2 class="header-title">Destino da importação</h2><p class="text-muted">Revise a lista e grave canais, filmes e séries diretamente no painel.</p><label for="naxx-mode">Modo dos canais ao vivo</label><select id="naxx-mode" class="custom-select"><option value="ondemand">Iniciar somente quando alguém reproduzir (recomendado)</option><option value="direct">Fonte direta (sem retransmissão pelo servidor)</option><option value="offline">Cadastrar sem iniciar transmissão</option></select><p class="text-muted mt-2 mb-0">No modo sob demanda, o painel inicia a fonte quando o canal é reproduzido e a encerra sem espectadores. Isso reduz o uso contínuo de CPU. Filmes e séries seguem as configurações nativas.</p></div>';
    root.before(panel);
    function readBouquets(source){
      var options=new Map(),select=source.querySelector('select[name="bouquets[]"]');
      if(!select||select.matches(':disabled'))return options;
      Array.from(select.options).forEach(function(option){
        if(!/^[1-9]\d*$/.test(option.value)||option.disabled||option.closest('optgroup[disabled]'))return;
        var existing=options.get(option.value);
        if(existing){existing.selected=existing.selected||option.selected;return;}
        options.set(option.value,{id:option.value,name:option.textContent.trim()||'Bouquet #'+option.value,selected:option.selected});
      });
      return options;
    }
    var bouquetFields=document.createElement('fieldset');bouquetFields.id='naxx-bouquets';bouquetFields.className='naxx-bouquets';
    bouquetFields.innerHTML='<legend>Bouquets (listas de canais)</legend><p id="naxx-bouquet-help" class="text-muted">Escolha os bouquets existentes que receberão o catálogo. Sem seleção, o envio fica sem bouquet. Esta seleção prevalece sobre os bouquets das configurações avançadas.</p><label for="naxx-bouquet-search">Buscar bouquet</label><input id="naxx-bouquet-search" type="search" class="form-control" placeholder="Digite o nome do bouquet" autocomplete="off" aria-controls="naxx-bouquet-options" aria-describedby="naxx-bouquet-count"><div class="naxx-bouquet-actions"><button type="button" class="btn btn-light" data-bouquet-select-visible>Selecionar visíveis</button><button type="button" class="btn btn-light" data-bouquet-select-all>Selecionar todos</button><button type="button" class="btn btn-light" data-bouquet-clear>Limpar seleção</button></div><div id="naxx-bouquet-options" class="naxx-bouquet-options" data-bouquet-options aria-describedby="naxx-bouquet-help"></div><p class="text-muted naxx-bouquet-empty" data-bouquet-empty hidden></p><div class="naxx-bouquet-footer"><p id="naxx-bouquet-count" data-bouquet-count role="status" aria-live="polite"></p><a href="bouquets" target="_blank" rel="noopener noreferrer">Gerenciar bouquets <span class="sr-only">(abre em outra aba)</span></a></div><p class="text-muted naxx-bouquet-fallback">Para filmes e séries, estes bouquets são o destino de reserva (fallback). As regras nativas de alocação por pasta podem ter prioridade.</p><p class="naxx-bouquet-error" data-bouquet-error role="alert" hidden></p>';
    panel.querySelector('label').before(bouquetFields);
    var bouquetSearch=bouquetFields.querySelector('#naxx-bouquet-search'),bouquetList=bouquetFields.querySelector('[data-bouquet-options]'),bouquetEmpty=bouquetFields.querySelector('[data-bouquet-empty]'),bouquetCount=bouquetFields.querySelector('[data-bouquet-count]'),bouquetError=bouquetFields.querySelector('[data-bouquet-error]'),bouquetRows=[];
    var selectVisible=bouquetFields.querySelector('[data-bouquet-select-visible]'),selectAll=bouquetFields.querySelector('[data-bouquet-select-all]'),clearBouquets=bouquetFields.querySelector('[data-bouquet-clear]');
    function bouquetSearchKey(value){return value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('pt-BR');}
    readBouquets(form).forEach(function(bouquet){
      var label=document.createElement('label'),input=document.createElement('input'),name=document.createElement('span');
      label.className='naxx-bouquet-option';input.type='checkbox';input.value=bouquet.id;input.checked=bouquet.selected;name.textContent=bouquet.name;label.append(input,name);bouquetList.appendChild(label);
      bouquetRows.push({id:bouquet.id,name:bouquet.name,key:bouquetSearchKey(bouquet.name),label:label,input:input});
      input.addEventListener('change',function(){clearBouquetError();renderBouquets();});
    });
    function clearBouquetError(){bouquetError.hidden=true;bouquetError.textContent='';bouquetFields.removeAttribute('aria-invalid');}
    function renderBouquets(){
      var query=bouquetSearchKey(bouquetSearch.value.trim()),visible=0,selected=0;
      bouquetRows.forEach(function(row){row.label.hidden=!!query&&!row.key.includes(query);if(!row.label.hidden)visible++;if(row.input.checked)selected++;});
      bouquetList.hidden=!visible;bouquetEmpty.hidden=!!visible;
      bouquetEmpty.textContent=bouquetRows.length?'Nenhum bouquet corresponde à busca.':'Nenhum bouquet disponível nesta conta. Crie um bouquet ou solicite acesso e depois atualize esta página.';
      bouquetCount.textContent=selected+' de '+bouquetRows.length+' bouquets selecionados'+(query?' · '+visible+' visíveis':'');
      bouquetSearch.disabled=!bouquetRows.length;selectVisible.disabled=!visible;selectAll.disabled=!bouquetRows.length;clearBouquets.disabled=!selected;
    }
    bouquetSearch.addEventListener('input',renderBouquets);
    selectVisible.addEventListener('click',function(){bouquetRows.forEach(function(row){if(!row.label.hidden)row.input.checked=true;});clearBouquetError();renderBouquets();});
    selectAll.addEventListener('click',function(){bouquetRows.forEach(function(row){row.input.checked=true;});clearBouquetError();renderBouquets();});
    clearBouquets.addEventListener('click',function(){bouquetRows.forEach(function(row){row.input.checked=false;});clearBouquetError();renderBouquets();});
    renderBouquets();
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
    function nativeImportForm(doc,action){
      var submitName={stream:'submit_stream',movie:'submit_movie',serie:'submit_series'}[action];
      return Array.from(doc.querySelectorAll('form')).find(function(candidate){
        var bouquets=candidate.querySelector('select[name="bouquets[]"]');
        return submitName&&(action!=='stream'||candidate.id==='stream_form')&&candidate.querySelector('input[type="file"][name="m3u_file"]')&&candidate.querySelector('[name="server_tree_data"]')&&candidate.querySelector('[name="'+submitName+'"]')&&bouquets&&!bouquets.matches(':disabled');
      });
    }
    async function nativeForm(route){
      var response=await fetch(route,{credentials:'same-origin',cache:'no-store'});if(!response.ok||/\/(login|license)(?:[?/]|$)/.test(response.url))throw new Error('Sua sessão expirou. Entre novamente no painel.');
      var doc=new DOMParser().parseFromString(await response.text(),'text/html'),form=nativeImportForm(doc,route.split('?')[0]);
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
      if(running)throw new Error('Já existe uma importação em andamento.');
      var modeControl=document.getElementById('naxx-mode'),channelMode=modeControl.value;
      var chosenBouquets=bouquetRows.filter(function(row){return row.input.checked;}).map(function(row){return {id:row.id,name:row.name};});
      clearBouquetError();
      done=0;total=items.length;paused=false;stopped=false;running=true;modeControl.disabled=true;bouquetFields.disabled=true;bouquetFields.setAttribute('aria-busy','true');details.setAttribute('inert','');details.classList.add('naxx-options-busy');pause.disabled=false;stop.disabled=false;pause.textContent='Pausar após este lote';
      // Uma única referência por item pendente; evita copiar todos por tipo e depois categoria.
      var groups={channel:new Map(),movie:new Map(),series:new Map()};
      items.forEach(function(item){if(committed.has(item.url)){done++;return;}var group=groups[item.type],list=group.get(item.category);if(!list){list=[];group.set(item.category,list);}list.push(item);});
      try{
        // Valida todos os destinos antes do primeiro lote; uma lista removida não causa envio parcial por tipo.
        var prepared={};
        for(var pendingType of ['channel','movie','series']){
          if(!groups[pendingType].size)continue;
          await checkpoint();
          var pendingAction={channel:'stream',movie:'movie',series:'serie'}[pendingType];
          say('Conferindo bouquets e configurações de '+({channel:'canais',movie:'filmes',series:'séries'}[pendingType])+'…');
          var pendingNative=await nativeForm(pendingAction+'?import=1'),validBouquets=readBouquets(pendingNative.form);
          var missing=chosenBouquets.filter(function(bouquet){return !validBouquets.has(bouquet.id);});
          if(missing.length){
            var destinationError='O bouquet “'+missing[0].name+'” não está disponível para '+({channel:'canais',movie:'filmes',series:'séries'}[pendingType])+'. Atualize a página e revise a seleção. Nenhum lote foi enviado.';
            bouquetError.textContent=destinationError;bouquetError.hidden=false;bouquetFields.setAttribute('aria-invalid','true');throw new Error(destinationError);
          }
          var pendingData=pendingNative.data,configured=frames[pendingType];
          if(configured){var doc=configured.contentDocument,nativeConfig=doc&&nativeImportForm(doc,pendingAction);if(!nativeConfig)throw new Error('Aguarde o carregamento das configurações de '+pendingType+' ou confira sua sessão e permissões.');pendingData=new FormData(nativeConfig);var jq=configured.contentWindow.jQuery;if(jq&&jq.fn.jstree&&doc.getElementById('server_tree'))pendingData.set('server_tree_data',JSON.stringify(jq('#server_tree').jstree(true).get_json('source',{flat:true})));}
          pendingData.delete('bouquets[]');chosenBouquets.forEach(function(bouquet){pendingData.append('bouquets[]',bouquet.id);});pendingData.set('bouquet_create_list','[]');
          prepared[pendingType]={native:pendingNative,data:pendingData,configured:!!configured};
        }
        for(var type of ['channel','movie','series']){
          if(!groups[type].size)continue;
          await checkpoint();
          var action={channel:'stream',movie:'movie',series:'serie'}[type];
          say('Importando '+({channel:'canais',movie:'filmes',series:'séries'}[type])+'… '+done+' de '+items.length+' processados.');
          var native=prepared[type].native,data=prepared[type].data,configured=prepared[type].configured;
          // Este botão importa a lista revisada. A ação por pasta fica no formulário avançado.
          data.delete('import_folder');data.delete('scan_recursive');
          if(!configured){
            if(native.form.querySelector('[name="direct_source"]'))data.delete('direct_source');
            if(native.form.querySelector('[name="server_tree_data"]'))data.set('server_tree_data','[]');
            if(native.form.querySelector('[name="disable_tmdb"]'))data.set('disable_tmdb','on');
            data.delete('restart_on_edit');data.delete('update_existing');
          }
          // O destino principal também prevalece quando o formulário avançado está aberto.
          if(type==='channel'){
            data.delete('direct_source');
            if(channelMode==='direct')data.set('direct_source','on');
            if(channelMode!=='ondemand'){
              data.delete('on_demand[]');data.set('server_tree_data','[]');
            }else if(!configured)setDefaultOnDemand(data,native.doc);
            else{
              var configuredTree=[];try{configuredTree=JSON.parse(data.get('server_tree_data')||'[]');}catch(_){}
              var configuredServers=Array.isArray(configuredTree)?configuredTree.filter(function(node){return node&&/^[1-9]\d*$/.test(String(node.id))&&node.parent!=='#';}):[];
              if(!configuredServers.length)throw new Error('Escolha um servidor na árvore Online das configurações avançadas para importar canais sob demanda.');
              data.delete('on_demand[]');configuredServers.forEach(function(node){data.append('on_demand[]',String(node.id));});
            }
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
      finally{running=false;modeControl.disabled=false;bouquetFields.disabled=false;bouquetFields.removeAttribute('aria-busy');details.removeAttribute('inert');details.classList.remove('naxx-options-busy');pause.disabled=true;stop.disabled=true;}
    }
    NaxxImporterUI.mount(root,{urlEndpoint:'naxx-import-url.php',workerURL:'assets/js/naxx-importer-worker.js?v=669f03086f25',onImport:commit,commitLabel:'Importar no painel',commitHelp:'As categorias serão vinculadas pelos formulários do painel. A importação avança em lotes e pode ser pausada ou interrompida.'});
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
}());
