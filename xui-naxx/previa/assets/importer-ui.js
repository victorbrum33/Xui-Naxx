(function () {
  'use strict';
  var escape = function (value) {return String(value).replace(/[&<>"']/g, function (char) {return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char];});};
  var labels = {channel:'Canal', movie:'Filme', series:'Episódio'};
  function mount(root, options) {
    options = options || {};
    var result = null, selected = new Set(), input = null, page = 0, pageSize = 100, busy = false, worker = null, analysisId = 0, cancelAnalysis = null;
    root.innerHTML = '<div class="card"><div class="card-body"><div class="naxx-step"><span>01</span><div><h2 class="header-title">Escolha seu arquivo</h2><p class="text-muted mb-0">M3U, M3U8, CSV ou JSON · sem limite fixo de tamanho ou itens</p></div></div><label class="naxx-dropzone" for="catalog-file"><span class="naxx-upload-icon">↥</span><strong>Selecionar lista de conteúdo</strong><span class="text-muted" id="file-description">O arquivo é processado neste navegador.</span><input id="catalog-file" type="file" accept=".m3u,.m3u8,.csv,.json" class="mt-3"></label><details class="naxx-format-help"><summary>Como preparar o arquivo</summary><p>Em M3U, use EXTINF com nome e group-title, seguido da URL. Filmes são identificados pelo grupo Filmes ou pela extensão do vídeo; episódios por Série, S01E01 ou 1x01 no nome. Revise a classificação antes de importar.</p><p>CSV: <code>name,url,type,category</code>. JSON: lista de objetos com essas mesmas propriedades. Os tipos são <code>channel</code>, <code>movie</code> e <code>series</code>.</p><button class="btn btn-light" type="button" data-example>Usar arquivo de exemplo</button></details><div class="row mt-3"><div class="col-md-6"><label for="import-type">Tipo de conteúdo</label><select id="import-type" class="custom-select"><option value="">Detectar automaticamente</option><option value="channel">Todos são canais</option><option value="movie">Todos são filmes</option><option value="series">Todos são episódios de séries</option></select></div><div class="col-md-6"><label for="import-category">Categoria (opcional)</label><input id="import-category" class="form-control" maxlength="200" placeholder="Manter as categorias do arquivo"></div></div><div class="mt-3 d-flex flex-wrap" style="gap:10px"><button class="btn btn-primary" data-analyze type="button" disabled>Analisar arquivo</button><span class="text-muted align-self-center" data-file-status>Nenhum arquivo selecionado</span></div><div data-message role="status" aria-live="polite" class="mt-3"></div></div></div><div class="card" data-review hidden><div class="card-body"><div class="naxx-step"><span>02</span><div><h2 class="header-title">Revise e importe</h2><p class="text-muted mb-0">Selecione os conteúdos que deseja incluir.</p></div></div><div data-summary class="naxx-import-summary"></div><div class="table-responsive"><table class="table"><thead><tr><th><input type="checkbox" data-check-all aria-label="Selecionar todos os conteúdos" checked></th><th>Conteúdo</th><th>Tipo</th><th>Categoria</th><th>Fonte</th></tr></thead><tbody data-items></tbody></table></div><p data-truncated class="text-muted mt-2"></p><div data-issues></div><div class="d-flex flex-wrap mt-3" style="gap:10px"><button class="btn btn-primary" data-commit type="button">' + (options.onImport ? 'Importar no catálogo de teste' : 'Baixar M3U revisado') + '</button><button class="btn btn-light" data-export-json type="button">Baixar JSON</button><button class="btn btn-light" data-export-split type="button">Separar por tipo</button></div><p class="text-muted mt-3 mb-0">' + (options.onImport ? 'Os itens serão salvos apenas na prévia deste navegador.' : 'Esta ferramenta prepara arquivos. A gravação no banco do XUI deve ser feita pelo importador nativo da instalação. Nenhum dado é enviado ao servidor aqui.') + '</p></div></div>';
    function query(selector) {return root.querySelector(selector);}
    function message(text, error) {query('[data-message]').innerHTML = '<div class="alert ' + (error ? 'alert-danger' : 'alert-info') + '">' + escape(text) + '</div>';}
    function resetReview() {result = null; selected.clear(); query('[data-review]').hidden = true;}
    var cancelButton=document.createElement('button');cancelButton.type='button';cancelButton.className='btn btn-light';cancelButton.textContent='Cancelar análise';cancelButton.hidden=true;query('[data-analyze]').after(cancelButton);
    function stopAnalysis(){analysisId++;if(worker)worker.terminate();worker=null;if(cancelAnalysis)cancelAnalysis(new Error('Análise cancelada.'));cancelAnalysis=null;cancelButton.hidden=true;query('[data-analyze]').disabled=!input;query('[data-analyze]').textContent='Analisar arquivo';}
    cancelButton.addEventListener('click',function(){stopAnalysis();message('Análise cancelada. Seu arquivo continua selecionado.');});
    function analyzeFile(file,settings){return new Promise(function(resolve,reject){
      if(!window.Worker){reject(new Error('Este navegador não oferece análise em segundo plano. Atualize o navegador para importar listas.'));return;}
      cancelAnalysis=reject;worker=new Worker(options.workerURL||'assets/importer-worker.js?v=1.5.14-4');var currentWorker=worker;
      worker.onmessage=function(event){if(worker!==currentWorker)return;var data=event.data;if(data.type==='progress'){query('[data-file-status]').textContent='Analisando… '+Math.floor(data.bytes/Math.max(1,data.total)*100)+'%';}else if(data.type==='result'){worker.terminate();worker=null;cancelAnalysis=null;resolve(data.result);}else if(data.type==='error'){worker.terminate();worker=null;cancelAnalysis=null;reject(new Error(data.message));}};
      worker.onerror=function(){if(worker)worker.terminate();worker=null;cancelAnalysis=null;reject(new Error('Não foi possível analisar o arquivo. Verifique se o formato é válido.'));};
      worker.postMessage({file:file,options:settings});
    });}
    async function read(file) {
      stopAnalysis();
      resetReview();
      if (!file) {input=null; query('[data-analyze]').disabled=true; return;}
      query('[data-file-status]').textContent = 'Lendo arquivo…';
      input = file;
      query('#file-description').textContent = file.name;
      query('[data-file-status]').textContent = (file.size/1024).toFixed(1) + ' KB · pronto para analisar';
      query('[data-analyze]').disabled = false;
      query('[data-message]').textContent = '';
    }
    query('#catalog-file').addEventListener('change', function (event) {read(event.target.files[0]).catch(function () {message('Não foi possível ler o arquivo.',true);});});
    var dropzone=query('.naxx-dropzone');dropzone.addEventListener('dragover',function(event){event.preventDefault();if(!busy)dropzone.classList.add('naxx-dragging');});dropzone.addEventListener('dragleave',function(){dropzone.classList.remove('naxx-dragging');});dropzone.addEventListener('drop',function(event){event.preventDefault();dropzone.classList.remove('naxx-dragging');if(!busy)read(event.dataTransfer.files[0]);});
    query('[data-example]').addEventListener('click', function () {
      read(new File(['#EXTM3U\n#EXTINF:-1 group-title="Canais",Canal de demonstração\nhttps://example.com/live/demo.m3u8\n#EXTINF:-1 group-title="Filmes",Filme de demonstração\nhttps://example.com/movie/demo.mp4\n#EXTINF:-1 group-title="Séries",Série de demonstração S01E01\nhttps://example.com/series/demo-s01e01.mp4\n'], 'exemplo-naxx.m3u', {type:'text/plain'}));
    });
    query('#import-type').addEventListener('change', function(){stopAnalysis();resetReview();});
    query('#import-category').addEventListener('input', function(){stopAnalysis();resetReview();});
    query('[data-analyze]').addEventListener('click', async function () {
      if (!input) return;
      var id=++analysisId;query('[data-analyze]').disabled=true;query('[data-analyze]').textContent='Analisando…';cancelButton.hidden=false;
      try {
        result = await analyzeFile(input, {type:query('#import-type').value, category:query('#import-category').value, existing:options.existing ? options.existing() : []});
        if(id!==analysisId)return;
        selected = new Set(result.items.map(function (item) {return item.id;}));
        var counts = {channel:0,movie:0,series:0}; result.items.forEach(function (item) {counts[item.type]++;});
        query('[data-summary]').innerHTML = '<span><b>' + counts.channel + '</b> canais</span><span><b>' + counts.movie + '</b> filmes</span><span><b>' + counts.series + '</b> episódios</span><span><b>' + result.duplicates + '</b> duplicados ignorados</span><span><b>' + result.issues.length + '</b> inválidos</span>';
        page = 0;renderPage();
        query('[data-check-all]').checked = true;
        query('[data-check-all]').indeterminate = false;
        query('[data-issues]').innerHTML = result.issues.length ? '<details><summary>' + result.issues.length + ' itens inválidos ignorados</summary><ul>' + result.issues.slice(0,20).map(function (issue) {return '<li>Linha ' + issue.line + ': ' + escape(issue.reason) + '</li>';}).join('') + '</ul></details>' : '';
        query('[data-review]').hidden = false;
        renderCategories();
        query('[data-commit]').disabled = !result.items.length;
        query('[data-export-json]').disabled = !result.items.length;
        query('[data-export-split]').disabled = !result.items.length;
        message('Análise concluída. Revise os tipos e categorias antes de continuar.');
      } catch (error) {if(id===analysisId){resetReview();message(error.message,true);}}
      finally {if(id===analysisId){cancelButton.hidden=true;query('[data-analyze]').disabled=false;query('[data-analyze]').textContent='Analisar arquivo';query('[data-file-status]').textContent='Arquivo analisado';}}
    });
    var categories=document.createElement('details'),categoryPage=0;categories.className='naxx-categories-review';categories.innerHTML='<summary>Categorias da lista <span data-category-count></span></summary><p class="text-muted">Os grupos serão mantidos no painel. Renomeie uma categoria antes de importar, se necessário.</p><div data-category-editor></div><div class="d-flex" style="gap:10px"><button type="button" class="btn btn-light" data-cat-prev>Anterior</button><span data-cat-page class="text-muted align-self-center"></span><button type="button" class="btn btn-light" data-cat-next>Próxima</button></div>';
    query('[data-summary]').after(categories);
    function renderCategories(){var counts=new Map();result.items.forEach(function(item){counts.set(item.category,(counts.get(item.category)||0)+1);});categoryPage=Math.min(categoryPage,Math.max(0,Math.ceil(counts.size/50)-1));query('[data-category-count]').textContent='('+counts.size+')';query('[data-category-editor]').innerHTML=Array.from(counts).slice(categoryPage*50,(categoryPage+1)*50).map(function(entry,index){return '<div class="naxx-category-row"><label for="naxx-category-'+index+'">'+escape(entry[0])+' <small class="text-muted">'+entry[1]+' itens</small></label><input id="naxx-category-'+index+'" class="form-control" data-original-category="'+escape(entry[0])+'" value="'+escape(entry[0])+'" maxlength="200" aria-label="Renomear categoria '+escape(entry[0])+'"></div>';}).join('');query('[data-cat-prev]').disabled=categoryPage===0;query('[data-cat-next]').disabled=(categoryPage+1)*50>=counts.size;query('[data-cat-page]').textContent=counts.size?'Página '+(categoryPage+1)+' de '+Math.ceil(counts.size/50):'';query('[data-cat-page]').parentElement.hidden=counts.size<=50;}
    query('[data-cat-prev]').addEventListener('click',function(){if(categoryPage>0){categoryPage--;renderCategories();}});query('[data-cat-next]').addEventListener('click',function(){categoryPage++;renderCategories();});
    categories.addEventListener('change',function(event){if(!event.target.matches('[data-original-category]')||!result)return;var before=event.target.dataset.originalCategory,after=event.target.value.trim()||'Sem categoria';result.items.forEach(function(item){if(item.category===before)item.category=after;});renderCategories();renderPage();});
    function sync() {
      query('[data-check-all]').checked = selected.size === result.items.length;
      query('[data-check-all]').indeterminate = selected.size > 0 && selected.size < result.items.length;
      ['[data-commit]','[data-export-json]','[data-export-split]'].forEach(function (selector) {query(selector).disabled = !selected.size;});
    }
    var pager=document.createElement('div');pager.className='d-flex flex-wrap align-items-center';pager.style.gap='10px';pager.innerHTML='<button type="button" class="btn btn-light" data-prev-page>Anterior</button><span data-page-label class="text-muted"></span><button type="button" class="btn btn-light" data-next-page>Próxima</button>';
    query('[data-truncated]').after(pager);
    function renderPage(){
      var list=result.items.slice(page*pageSize,(page+1)*pageSize);
      query('[data-items]').innerHTML=list.map(function(item){return '<tr><td><input type="checkbox" data-item="'+escape(item.id)+'" aria-label="Selecionar '+escape(item.name)+'" '+(selected.has(item.id)?'checked':'')+'></td><td><strong>'+escape(item.name)+'</strong>'+(item.season!==undefined?'<small class="d-block text-muted">Temporada '+item.season+' · episódio '+item.episode+'</small>':'')+'</td><td><span class="badge badge-info">'+labels[item.type]+'</span></td><td>'+escape(item.category)+'</td><td><span class="naxx-source" title="'+escape(item.url)+'">'+escape(new URL(item.url).hostname)+'</span></td></tr>';}).join('');
      query('[data-truncated]').textContent=result.items.length?'Itens '+(page*pageSize+1)+' a '+Math.min((page+1)*pageSize,result.items.length)+' de '+result.items.length+'. Selecionar todos inclui a lista inteira.':'Nenhum item válido.';
      pager.hidden=result.items.length<=pageSize;query('[data-prev-page]').disabled=page===0;query('[data-next-page]').disabled=(page+1)*pageSize>=result.items.length;query('[data-page-label]').textContent='Página '+(page+1)+' de '+Math.ceil(result.items.length/pageSize);
    }
    query('[data-prev-page]').addEventListener('click',function(){if(page>0){page--;renderPage();}});
    query('[data-next-page]').addEventListener('click',function(){if((page+1)*pageSize<result.items.length){page++;renderPage();}});
    query('[data-check-all]').addEventListener('change', function (event) {
      if (!result) return;
      selected = new Set(event.target.checked ? result.items.map(function (item) {return item.id;}) : []);
      root.querySelectorAll('[data-item]').forEach(function (checkbox) {checkbox.checked = event.target.checked;}); sync();
    });
    query('[data-items]').addEventListener('change', function (event) {
      if (!event.target.matches('[data-item]')) return;
      if (event.target.checked) selected.add(event.target.dataset.item); else selected.delete(event.target.dataset.item);
      sync();
    });
    function selectedItems() {return result ? result.items.filter(function (item) {return selected.has(item.id);}) : [];}
    function download(filename, text, mime) {
      var url = URL.createObjectURL(new Blob([text], {type:mime + ';charset=utf-8'})), link=document.createElement('a');
      link.href=url; link.download=filename; document.body.appendChild(link); link.click(); link.remove(); window.setTimeout(function () {URL.revokeObjectURL(url);},1000);
    }
    if (options.commitLabel) query('[data-commit]').textContent = options.commitLabel;
    if (options.commitHelp) query('[data-review] .card-body > p:last-child').textContent = options.commitHelp;
    query('[data-commit]').addEventListener('click', async function () {
      var items = selectedItems(); if (!items.length) return;
      if (options.onImport) {
        if(busy)return;busy=true;
        query('[data-commit]').disabled=true;
        var controls=Array.from(root.querySelectorAll('input,select,button')).filter(function(control){return !control.disabled;});controls.forEach(function(control){control.disabled=true;});
        try {var count=await options.onImport(items); resetReview(); message(count && count.message ? count.message : count + ' conteúdos adicionados ao catálogo de teste.');}
        catch (error) {message(error.message,true);query('[data-commit]').disabled=false;}
        finally {busy=false;controls.forEach(function(control){control.disabled=false;});}
      } else download('naxx-catalogo.m3u',NaxxImporter.toM3U(items),'audio/x-mpegurl');
    });
    query('[data-export-json]').addEventListener('click', function () {download('naxx-catalogo.json',JSON.stringify(selectedItems(),null,2),'application/json');});
    query('[data-export-split]').addEventListener('click', function () {
      var items = selectedItems();
      ['channel','movie','series'].forEach(function (type,index) {
        var list=items.filter(function (item) {return item.type===type;});
        if (list.length) window.setTimeout(function () {download('naxx-'+{channel:'canais',movie:'filmes',series:'series'}[type]+'.m3u',NaxxImporter.toM3U(list),'audio/x-mpegurl');},index*300);
      });
      message('Arquivos separados preparados. O navegador pode solicitar permissão para vários downloads.');
    });
    return {reset:resetReview};
  }
  window.NaxxImporterUI = {mount:mount};
}());
