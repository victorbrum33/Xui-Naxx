/* Limpeza de conteúdo com consulta, autenticação e operações nativas do painel. */
(function () {
  'use strict';
  var definitions = {
    channel:{form:'stream_form', field:'streams', selection:'rStreams', pane:'stream-selection', table:'datatable-md1', action:'mass_delete_streams', label:'canais'},
    movie:{form:'movie_form', field:'movies', selection:'rMovies', pane:'movie-selection', table:'datatable-md2', action:'mass_delete_movies', label:'filmes'},
    series:{form:'series_form', field:'series', selection:'rSeries', pane:'series-selection', table:'datatable-md4', action:'mass_delete_series', label:'séries'},
    episodes:{form:'episodes_form', field:'episodes', selection:'rEpisodes', pane:'episodes-selection', table:'datatable-md5', action:'mass_delete_episodes', label:'episódios'}
  };
  var labels = {channel:'Deletar Canais', movie:'Deletar Filmes', series:'Deletar Séries', all:'Deletar Tudo'};
  // Os endpoints nativos só retornam dados para requisições AJAX identificadas.
  var ajaxHeaders = {'X-Requested-With':'XMLHttpRequest','Accept':'application/json, text/javascript, */*; q=0.01'};
  var active = null, busy = false, cancelled = false, readerController = null, phase = '';
  function ids(type) {
    return Array.from(new Set((window[definitions[type].selection] || []).map(String).filter(function (id) {return /^\d+$/.test(id);})));
  }
  function route(mode, run) {return 'mass_delete?naxx_cleanup=' + mode + (run ? '&naxx_cleanup_run=1' : '');}
  function mode() {
    if (!/\/mass_delete(?:\.php)?$/.test(location.pathname)) return null;
    var value = new URLSearchParams(location.search).get('naxx_cleanup');
    return Object.prototype.hasOwnProperty.call(labels, value) ? value : null;
  }
  function addQuickTools() {
    document.querySelectorAll('[data-naxx-cleanup-menu]').forEach(function (item) {item.remove();});
    if (!/\/quick_tools(?:\.php)?$/.test(location.pathname) || document.querySelector('[data-naxx-quick-cleanup]')) return;
    var nav = document.querySelector('.navigation-menu');
    // A presença do atalho original preserva a permissão de limpeza do usuário.
    var original = nav && nav.querySelector('a[href="mass_delete"],a[href="./mass_delete"],a[href="mass_delete.php"]');
    if (!original) return;
    var heading = document.querySelector('.page-title-box');
    if (!heading) return;
    var card = document.createElement('section'); card.className = 'card'; card.dataset.naxxQuickCleanup = '';
    card.innerHTML = '<div class="card-body"><h2 class="header-title">Limpeza de conteúdo</h2><p class="text-muted">Exclua todos os conteúdos do tipo escolhido, em todas as páginas e categorias. A confirmação mostra a quantidade antes da exclusão.</p><div class="d-flex flex-wrap" style="gap:10px" data-cleanup-actions></div></div>';
    Object.keys(labels).forEach(function (key) {
      var link = document.createElement('a');
      link.href = route(key,true); link.className = 'btn ' + (key === 'all' ? 'btn-danger' : 'btn-outline-danger'); link.dataset.naxxCleanupLink = '';
      var icon = document.createElement('i'); icon.className = (key === 'all' ? 'fas fa-bomb' : 'fas fa-trash-alt') + ' mr-1'; icon.setAttribute('aria-hidden','true');
      link.appendChild(icon); link.appendChild(document.createTextNode(labels[key]));
      card.querySelector('[data-cleanup-actions]').appendChild(link);
    });
    heading.after(card);
  }
  function say(text, error) {
    if (!active) return;
    var status = active.panel.querySelector('[data-cleanup-status]');
    status.className = 'alert ' + (error ? 'alert-danger' : 'alert-info') + ' mt-3 mb-0'; status.textContent = text;
  }
  function markSelection(type, selected) {
    var def = definitions[type], form = document.getElementById(def.form);
    window[def.selection] = selected.slice();
    if (form) form.querySelector('[name="' + def.field + '"]').value = JSON.stringify(selected);
    var lookup = new Set(selected);
    document.querySelectorAll('#' + def.table + ' tbody tr').forEach(function (row) {
      var cell = row.querySelector('td'), match = cell && lookup.has(cell.textContent.trim());
      ['selectedfilter','ui-selected','selected'].forEach(function (name) {row.classList.toggle(name,Boolean(match));});
    });
  }
  function plan(types) {
    return types.map(function (type) {return {type:type, ids:ids(type)};}).filter(function (job) {return job.ids.length;});
  }
  function confirm(jobs, all) {
    var total = jobs.reduce(function (sum,job) {return sum + job.ids.length;},0);
    if (!total) {say(all ? 'Não há conteúdos deste tipo para excluir.' : 'Selecione os conteúdos que deseja excluir nas opções detalhadas.',!all);return false;}
    var summary = jobs.map(function (job) {return job.ids.length + ' ' + definitions[job.type].label;}).join('\n');
    return window.confirm('Confirmar limpeza de conteúdo\n\n' + summary + '\n\nTotal: ' + total + ' conteúdos' + (all ? ' deste escopo, incluindo todas as páginas e categorias.' : ' selecionados.') + '\nA exclusão é permanente. Confirmar?');
  }
  function setBusy(value) {
    busy = value;
    if (!active) return;
    active.panel.querySelectorAll('[data-cleanup-delete-all]').forEach(function (button) {button.disabled=value;});
    active.forms.forEach(function (form) {form.querySelectorAll('[type="submit"],[data-cleanup-select-filter]').forEach(function (button) {button.disabled=value;});});
    active.panel.querySelector('[data-cleanup-cancel]').hidden = !value;
    active.panel.querySelector('[data-cleanup-cancel]').disabled = false;
    active.panel.querySelector('[data-cleanup-cancel]').textContent = phase === 'read' ? 'Cancelar consulta' : 'Interromper após o lote atual';
  }
  function delay(ms) {return new Promise(function (resolve) {window.setTimeout(resolve,ms);});}
  async function readJson(response, operation, deletion) {
    var body = (await response.text()).trim(), result;
    var next = deletion ? ' Atualize a página para conferir o resultado antes de tentar novamente.' : ' Atualize a página e tente novamente.';
    if (!body) throw new Error('O painel retornou uma resposta vazia ' + operation + '.' + next);
    try {result = JSON.parse(body);} catch (error) {throw new Error('O painel retornou uma resposta inválida ' + operation + '.' + next);}
    if (!result || typeof result !== 'object' || Array.isArray(result)) throw new Error('O painel retornou uma resposta inválida ' + operation + '.' + next);
    return result;
  }
  function orderedTypes() {return ['channel','movie','episodes','series'].filter(function (type) {return active.types.indexOf(type) !== -1;});}
  async function readIds(type, all) {
    var jq=window.jQuery,def=definitions[type],attempt=0;
    var params=null;
    while (attempt++ < 75) {
      if (jq && jq.fn.dataTable && jq.fn.dataTable.isDataTable('#'+def.table)) {
        params=jq('#'+def.table).DataTable().ajax.params();
        if (params && params.id) break;
      }
      if (cancelled) throw new Error('Consulta cancelada. Nenhum conteúdo foi excluído.');
      await delay(200);jq=window.jQuery;
    }
    if (!document.getElementById(def.form) || !jq || !jq.fn.dataTable || !jq.fn.dataTable.isDataTable('#'+def.table)) throw new Error('A tabela de '+def.label+' não está disponível. Atualize a página e tente novamente.');
    if (!params || !params.id) throw new Error('A tabela nativa ainda não está pronta.');
    params=jq.extend(true,{},params);
    if (all) {
      // Limpa somente filtros de conteúdo. Mantém o identificador da tabela,
      // include_channels e os parâmetros nativos que definem seu escopo.
      ['category','filter','server','series'].forEach(function (key) {if (Object.prototype.hasOwnProperty.call(params,key)) params[key]='';});
      params.search={value:'',regex:false};
      (params.columns || []).forEach(function (column) {column.search={value:'',regex:false};});
      params.order=[{column:0,dir:'asc'}];
    }
    var selected=new Set(),start=0,target=null;
    do {
      if (cancelled) throw new Error('Consulta cancelada. Nenhum conteúdo foi excluído.');
      params.start=start;params.length=500;
      var response=await fetch('table?'+jq.param(params),{credentials:'same-origin',cache:'no-store',headers:ajaxHeaders,signal:readerController.signal});
      if (!response.ok || /\/(login|license)(?:[?/]|$)/.test(response.url)) throw new Error('Não foi possível consultar os conteúdos. Verifique sua sessão.');
      var result=await readJson(response,'ao consultar '+def.label,false),count=Number(result.recordsFiltered);
      if (!Array.isArray(result.data) || !Number.isSafeInteger(count) || count < 0) throw new Error('A tabela nativa retornou uma resposta inválida.');
      if (target===null) target=count;
      else if (target!==count) throw new Error('A lista mudou durante a consulta. Tente novamente.');
      for (var row of result.data) {
        var id=String(row[0]).replace(/<[^>]*>/g,'').trim();
        if (!/^\d+$/.test(id) || selected.has(id)) throw new Error('A lista mudou durante a consulta ou retornou um identificador inválido. Tente novamente.');
        selected.add(id);
      }
      start+=result.data.length;
      if (start>target || (start<target && !result.data.length)) throw new Error('A lista mudou durante a consulta. Tente novamente.');
      say('Consultando '+def.label+': '+selected.size+' de '+target+'. Nenhum conteúdo foi excluído.');
      if (start<target) await delay(200);
    } while (start<target);
    if (cancelled) throw new Error('Consulta cancelada. Nenhum conteúdo foi excluído.');
    return Array.from(selected);
  }
  async function selectFilter(type) {
    if (busy || !active) return;
    var def=definitions[type];
    cancelled=false;phase='read';readerController=new AbortController();setBusy(true);
    try {
      var selected=await readIds(type,false);markSelection(type,selected);
      say(selected.length+' '+def.label+' selecionados pelo filtro atual. Revise antes de excluir.');
    } catch (error) {say(error.name === 'AbortError' ? 'Seleção cancelada. A seleção anterior foi mantida.' : error.message,true);}
    finally {readerController=null;phase='';setBusy(false);}
  }
  async function deleteAll() {
    if (busy || !active) return;
    cancelled=false;phase='read';readerController=new AbortController();setBusy(true);
    try {
      var jobs=[];
      for (var type of orderedTypes()) {
        var found=await readIds(type,true);if (found.length) jobs.push({type:type,ids:found});
      }
      if (cancelled) throw new Error('Consulta cancelada. Nenhum conteúdo foi excluído.');
      if (!confirm(jobs,true)) {if (jobs.length) say('Exclusão cancelada. Nenhum conteúdo foi excluído.');return;}
      jobs.forEach(function (job) {markSelection(job.type,job.ids);});
      readerController=null;phase='delete';setBusy(true);
      await execute(jobs);
    } catch (error) {say(error.name==='AbortError'?'Consulta cancelada. Nenhum conteúdo foi excluído.':error.message,true);}
    finally {readerController=null;phase='';setBusy(false);}
  }
  async function deleteSelected(onlyType) {
    if (busy || !active) return;
    var types=typeof onlyType==='string'?[onlyType]:orderedTypes();
    var jobs=plan(types.filter(function (type) {return active.types.indexOf(type)!==-1;}));
    if (!confirm(jobs,false)) return;
    cancelled=false;phase='delete';setBusy(true);
    try {await execute(jobs);} finally {phase='';setBusy(false);}
  }
  async function execute(jobs) {
    var sent = 0, total = jobs.reduce(function (sum,job) {return sum + job.ids.length;},0);
    try {
      for (var job of jobs) {
        var def = definitions[job.type], form = document.getElementById(def.form);
        if (!form) throw new Error('O formulário nativo não está disponível.');
        for (var start=0; start<job.ids.length; start+=100) {
          if (cancelled) {say('Limpeza interrompida. ' + sent + ' conteúdos processados; os demais continuam selecionados.');return;}
          var batch = job.ids.slice(start,start+100), data = new FormData(form);
          data.set(def.field,JSON.stringify(batch));
          say('Excluindo ' + def.label + ': ' + sent + ' de ' + total + ' conteúdos processados.');
          var response = await fetch('post.php?action=' + def.action + '&referer=' + encodeURIComponent(route(active.mode)),{method:'POST',body:data,credentials:'same-origin',headers:ajaxHeaders});
          if (!response.ok || /\/(login|license)(?:[?/]|$)/.test(response.url)) throw new Error('O painel recusou a operação. Verifique sua sessão.');
          var result = await readJson(response,'após solicitar a exclusão de '+def.label,true);
          if ((!result.location && !(result.result === true && Number(result.status) === 1)) || /(?:^|\/)(?:login|license)(?:[?.]|$)/.test(result.location || '')) throw new Error('O painel recusou a exclusão (código ' + result.status + ').');
          sent += batch.length;
          var removed = new Set(batch);markSelection(job.type,ids(job.type).filter(function (id) {return !removed.has(id);}));
          await delay(250);
        }
      }
      say('Limpeza concluída: ' + sent + ' conteúdos processados pelo painel.');
      jobs.forEach(function (job) {var jq=window.jQuery;if (jq && jq.fn.dataTable.isDataTable('#' + definitions[job.type].table)) jq('#' + definitions[job.type].table).DataTable().ajax.reload(null,false);});
    } catch (error) {say(error.message + (sent ? ' Já processados: ' + sent + '. A seleção restante foi mantida.' : ''),true);}
  }
  function setup() {
    var selectedMode = mode();
    if (!selectedMode || document.querySelector('[data-naxx-cleanup-panel]')) return;
    var types = selectedMode === 'all' ? ['channel','movie','series','episodes'] : selectedMode === 'series' ? ['series','episodes'] : [selectedMode];
    var forms = types.map(function (type) {return document.getElementById(definitions[type].form);}).filter(Boolean);
    if (!forms.length) return;
    var panel = document.createElement('div');panel.className='card';panel.dataset.naxxCleanupPanel='';
    panel.innerHTML='<div class="card-body"><h2 class="header-title">Limpeza de Conteúdo</h2><p class="text-muted">A limpeza inclui todo o conteúdo do tipo escolhido, em todas as páginas e categorias. Não é necessário selecionar linhas. Confira o total na confirmação.</p><div class="d-flex flex-wrap" style="gap:10px" data-cleanup-modes></div><div class="mt-3 d-flex flex-wrap" style="gap:10px"><button type="button" class="btn btn-danger" data-cleanup-delete-all>Deletar Tudo</button><button type="button" class="btn btn-light" data-cleanup-cancel hidden>Interromper após o lote atual</button></div><div role="status" aria-live="polite" data-cleanup-status></div></div>';
    Object.keys(labels).forEach(function (key) {var link=document.createElement('a');link.className='btn '+(key===selectedMode?'btn-primary':'btn-light');link.href=route(key,true);link.textContent=labels[key];link.dataset.naxxCleanupLink='';if (key===selectedMode) link.setAttribute('aria-current','page');panel.querySelector('[data-cleanup-modes]').appendChild(link);});
    var heading=document.querySelector('.page-title-box');if (heading) heading.after(panel);else forms[0].closest('.card').before(panel);
    active={mode:selectedMode,types:types,forms:forms,panel:panel};
    var pageTitle=document.querySelector('.page-title');if (pageTitle) pageTitle.textContent='Limpeza de Conteúdo';document.title='XUI NAXX | Limpeza de Conteúdo';
    document.querySelectorAll('.nav-pills a[href$="-selection"]').forEach(function (link) {var id=link.getAttribute('href').slice(1);link.closest('li').hidden=!types.some(function (type) {return definitions[type].pane===id;});});
    document.querySelectorAll('.tab-pane').forEach(function (pane) {if (/-selection$/.test(pane.id)) pane.hidden=!types.some(function (type) {return definitions[type].pane===pane.id;});});
    var first=document.querySelector('a[href="#'+definitions[types[0]].pane+'"]');if (first && window.jQuery && window.jQuery.fn.tab) window.jQuery(first).tab('show');
    panel.querySelector('[data-cleanup-delete-all]').textContent=labels[selectedMode];
    panel.querySelector('[data-cleanup-delete-all]').addEventListener('click',deleteAll);
    panel.querySelector('[data-cleanup-cancel]').addEventListener('click',function () {cancelled=true;if (readerController) readerController.abort();say(readerController?'Cancelando consulta…':'Interrompendo após a resposta do lote atual…');});
    var current=new URL(location.href);
    if (current.searchParams.get('naxx_cleanup_run')==='1') {
      current.searchParams.delete('naxx_cleanup_run');
      history.replaceState(history.state,'',current.pathname+current.search+current.hash);
      window.setTimeout(deleteAll,0);
    }
  }
  document.addEventListener('submit',function (event) {
    if (!active || !mode() || active.forms.indexOf(event.target) === -1) return;
    var type=active.types.find(function (key) {return definitions[key].form===event.target.id;});
    event.preventDefault();event.stopImmediatePropagation();
    // Usa o endpoint e os campos nativos, dividindo a seleção em lotes pequenos.
    deleteSelected(type);
  },true);
  document.addEventListener('click',function (event) {
    var anchor=event.target.closest('a[href]');
    if (busy && anchor && anchor.getAttribute('href').charAt(0)!=='#' && !/^javascript:/i.test(anchor.getAttribute('href'))) {
      event.preventDefault();event.stopImmediatePropagation();
      var target=new URL(anchor.href,location.href);
      if (/\/mass_delete(?:\.php)?$/.test(target.pathname)) say('Há uma limpeza em andamento. Aguarde ou interrompa a operação atual.');
      else window.open(anchor.href,'_blank','noopener');
      return;
    }
    var link=event.target.closest('[data-naxx-cleanup-link]');
    if (link && event.button===0 && !event.ctrlKey && !event.metaKey && !event.shiftKey && !event.altKey) {event.preventDefault();event.stopImmediatePropagation();window.location.assign(link.href);}
  },true);
  window.addEventListener('beforeunload',function (event) {if (busy) {event.preventDefault();event.returnValue='';}});
  function enhance() {addQuickTools();setup();}
  function ready() {
    enhance();var scheduled=false;
    new MutationObserver(function (changes) {if (scheduled || !changes.some(function (change) {return change.addedNodes.length;})) return;scheduled=true;window.requestAnimationFrame(function () {scheduled=false;enhance();});}).observe(document.body,{childList:true,subtree:true});
  }
  if (document.readyState==='complete') ready();else window.addEventListener('load',ready,{once:true});
}());
