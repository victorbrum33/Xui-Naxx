/* Fonte, páginas maiores e seleção explícita da exclusão nativa em massa. */
(function () {
  'use strict';
  if (window.NaxxBulkDelete) { window.NaxxBulkDelete.enhance(); return; }
  var batch = 1000, maxPage = 5000, maxCatalog = 50000;
  var states = new Map(), bound = false;
  var definitions = {
    'datatable-md1': {size:'show_entries', selection:'rStreams', field:'streams', label:'canais', source:true},
    'datatable-md2': {size:'movie_show_entries', selection:'rMovies', field:'movies', label:'filmes'},
    'datatable-md3': {size:'line_show_entries', selection:'rLines', field:'lines', label:'contas'},
    'datatable-md4': {size:'series_show_entries', selection:'rSeries', field:'series', label:'séries'},
    'datatable-md5': {size:'episode_show_entries', selection:'rEpisodes', field:'episodes', label:'episódios'},
    'datatable-md6': {size:'radio_show_entries', selection:'rRadios', field:'radios', label:'rádios'},
    'datatable-md7': {size:'user_show_entries', selection:'rUsers', field:'users', label:'usuários'},
    'datatable-md8': {size:'mag_show_entries', selection:'rMAGs', field:'mags', label:'dispositivos MAG'},
    'datatable-md9': {size:'enigma_show_entries', selection:'rEnigmas', field:'enigmas', label:'dispositivos Enigma'}
  };
  var selector = Object.keys(definitions).map(function (id) { return '#' + id; }).join(',');

  function integer(value) {
    var number = typeof value === 'number' ? value : typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : NaN;
    return Number.isSafeInteger(number) && number >= 0 ? number : NaN;
  }
  function idOf(row) {
    var id = Array.isArray(row) ? String(row[0]).replace(/<[^>]*>/g, '').trim() : '';
    return /^[1-9]\d*$/.test(id) && Number.isSafeInteger(Number(id)) ? id : null;
  }
  function text(state, message) {
    if (state.status.textContent !== message) state.status.textContent = message;
    if (state.status.hidden !== !message) state.status.hidden = !message;
  }
  function valid(state) { return states.get(state.table) === state && state.table.isConnected; }
  function sourceURL(host) {
    var url = new URL('naxx-update.php', window.location.href);
    url.searchParams.set('feature', 'stream-sources');
    if (host) url.searchParams.set('host', host);
    return url.href;
  }
  async function json(url, signal) {
    var response = await window.fetch(url, {credentials:'same-origin', cache:'no-store', signal:signal,
      headers:{'X-Requested-With':'XMLHttpRequest', 'Accept':'application/json'}});
    if (!response.ok || /\/(?:login|license)(?:[/?]|$)/.test(response.url || '')) {
      var error = new Error('request_failed'); error.status = response.status; throw error;
    }
    return response.json();
  }
  function signature(params, source) {
    var filters = Object.assign({}, params);
    delete filters.draw; delete filters.start; delete filters.length;
    return JSON.stringify([source, filters]);
  }
  function paramsFor(state, data) {
    var params = JSON.parse(JSON.stringify(data));
    var result = state.native.data(params, state.settings);
    if (result && typeof result === 'object') params = result;
    return params;
  }
  async function queryPage(state, params, start, length, signal) {
    var url = new URL(state.native.url, window.location.href);
    if (url.origin !== window.location.origin || !/\/table(?:\.php)?$/.test(url.pathname)) throw new Error('native_route');
    url.search = state.jq.param(Object.assign({}, params, {start:start, length:length}));
    var page = await json(url.href, signal);
    var total = integer(page.recordsTotal), filtered = integer(page.recordsFiltered);
    if (integer(page.draw) !== integer(params.draw) || !Number.isFinite(total) || !Number.isFinite(filtered) || filtered > total ||
        !Array.isArray(page.data) || page.data.length !== Math.min(length, Math.max(0, filtered - start))) throw new Error('native_page');
    return {total:total, filtered:filtered, rows:page.data};
  }
  function pageStart(start, length, filtered) {
    return start < filtered ? start : filtered ? Math.floor((filtered - 1) / length) * length : 0;
  }
  async function collect(state, params, source, signal) {
    var start = source ? 0 : integer(params.start), length = integer(params.length), ids = null;
    if (!Number.isFinite(start) || !Number.isFinite(length) || length < 1 || length > maxPage) throw new Error('length');
    if (source) {
      var lookup = await json(sourceURL(source), signal);
      if (!lookup || !lookup.ok || !Array.isArray(lookup.ids) || lookup.ids.length > maxCatalog ||
          lookup.ids.some(function (id) { return !Number.isSafeInteger(id) || id < 1; })) throw new Error('source_ids');
      ids = new Set(lookup.ids.map(String));
    }
    var result = null, seen = new Set();
    do {
      if (signal.aborted) throw new Error('cancelled');
      var count = source ? (ids.size ? batch : 1) : Math.min(batch, length - (result ? result.rows.length : 0));
      var page = await queryPage(state, params, start, count, signal);
      if (!result) {
        var first = source ? 0 : pageStart(start, length, page.filtered);
        result = {total:page.total, filtered:page.filtered, rows:[], start:first};
        if (first !== start) { start = first; if (page.filtered) continue; }
      }
      if (result.total !== page.total || result.filtered !== page.filtered || (source && page.filtered > maxCatalog)) throw new Error('catalog_changed');
      page.rows.forEach(function (row) {
        var id = idOf(row);
        if (!id || seen.has(id)) throw new Error('catalog_changed');
        seen.add(id);
        if (!ids || ids.has(id)) { result.rows.push(row); if (ids) ids.delete(id); }
      });
      start += page.rows.length;
      if (start >= page.filtered || !page.rows.length || (ids ? !ids.size : result.rows.length >= length)) break;
    } while (true);
    if (source) result.filtered = result.rows.length;
    return result;
  }
  function abort(state) {
    if (state.request) state.request.abort();
    state.request = null;
  }
  function useAjax(state, length) {
    if (state.source || Number(length) > batch) state.settings.ajax = state.ajax;
    else if (state.settings.ajax === state.ajax) { abort(state); state.settings.ajax = state.native; }
  }
  function runAjax(state, data, callback) {
    abort(state);
    var params = paramsFor(state, data), source = state.source;
    var start = integer(params.start), length = integer(params.length), key = signature(params, source);
    var controller = new AbortController(), timeout = false;
    var request = {readyState:1, abort:function () { controller.abort(); request.readyState = 0; }};
    state.request = request;
    var timer = window.setTimeout(function () { timeout = true; controller.abort(); }, 45000);
    var cache = state.cache;
    var reuse = source && cache && cache.key === key && cache.expires > Date.now() &&
      (cache.start !== start || cache.length !== length);
    text(state, source ? 'Buscando canais da fonte…' : 'Carregando a página…');
    var loading = reuse ? Promise.resolve(cache.result) : collect(state, params, source, controller.signal);
    loading.then(function (result) {
      if (!valid(state) || state.request !== request || controller.signal.aborted) return;
      var first = source ? pageStart(start, length, result.filtered) : result.start;
      if (first !== start) { state.settings._iDisplayStart = first; data.start = first; }
      if (source) state.cache = {key:key, result:result, start:first, length:length, expires:reuse ? cache.expires : Date.now() + 15000};
      text(state, '');
      callback({draw:integer(data.draw), recordsTotal:result.total, recordsFiltered:result.filtered,
        data:source ? result.rows.slice(first, first + length) : result.rows});
    }, function () {
      if (!valid(state) || state.request !== request || (!timeout && controller.signal.aborted)) return;
      state.cache = null;
      text(state, 'Não foi possível carregar a lista. Atualize a página ou ajuste os filtros. A seleção anterior foi mantida.');
      callback({draw:integer(data.draw), recordsTotal:0, recordsFiltered:0, data:[]});
    }).finally(function () {
      window.clearTimeout(timer); request.readyState = 4;
      if (state.request === request) state.request = null;
    });
    return request;
  }

  async function filteredIds(table, signal) {
    var state = states.get(table);
    if (!state || !valid(state) || state.request || !state.api.ajax.params) throw new Error('table_loading');
    var current = state.api.ajax.params();
    if (!current) throw new Error('table_loading');
    var params = paramsFor(state, current), source = state.source, key = signature(params, source), rows = [];
    if (source) rows = (await collect(state, Object.assign({}, params, {start:0, length:batch}), source, signal)).rows;
    else {
      var total, filtered;
      for (var start = 0; ; start += batch) {
        if (signal.aborted) throw new Error('cancelled');
        var page = await queryPage(state, params, start, batch, signal);
        if (page.filtered > maxCatalog) throw new Error('catalog_limit');
        if (start && (total !== page.total || filtered !== page.filtered)) throw new Error('catalog_changed');
        total = page.total; filtered = page.filtered;
        rows = rows.concat(page.rows);
        if (rows.length >= filtered) break;
      }
    }
    var seen = new Set(), ids = rows.map(function (row) {
      var id = idOf(row); if (!id || seen.has(id)) throw new Error('catalog_changed'); seen.add(id); return id;
    });
    current = state.api.ajax.params();
    if (signal.aborted || !valid(state) || state.request || !current || signature(paramsFor(state, current), state.source) !== key) throw new Error('selection_changed');
    return ids;
  }
  function addOption(select, value, label) {
    if (Array.prototype.some.call(select.options, function (option) { return option.value === value; })) return;
    var option = document.createElement('option'); option.value = value; option.textContent = label; select.appendChild(option);
  }
  function sizeControls(state, length) {
    var main = document.getElementById(state.def.size);
    var generated = document.querySelector('select[name="' + state.table.id + '_length"][aria-controls="' + state.table.id + '"]');
    [main, generated].forEach(function (control) {
      if (!control) return;
      [['250','250'],['500','500'],['1000','1.000'],['2000','2.000'],['5000','5.000']].forEach(function (size) { addOption(control, size[0], size[1]); });
      var value = String(length);
      if (control.value !== value && Array.prototype.some.call(control.options, function (option) { return option.value === value; })) {
        control.value = value;
        if (control.classList.contains('select2-hidden-accessible')) state.jq(control).trigger('change.select2');
      }
    });
  }
  function selection(state) { return Array.isArray(window[state.def.selection]) ? window[state.def.selection] : null; }
  function sync(state) {
    var selected = selection(state);
    if (!selected) return;
    var ids = new Set(selected.map(String)), field = state.form.querySelector('[name="' + state.def.field + '"]');
    if (field) field.value = JSON.stringify(selected);
    state.api.rows({page:'current'}).every(function () {
      var row = this.node(), id = idOf(this.data());
      if (row) ['selectedfilter','ui-selected','selected'].forEach(function (name) { row.classList.toggle(name, Boolean(id && ids.has(id))); });
    });
    var message = selected.length + ' selecionados para excluir. A seleção é mantida ao mudar os filtros.';
    if (state.summary.textContent !== message) state.summary.textContent = message;
    state.scope.hidden = !state.source || !new URLSearchParams(window.location.search).has('naxx_cleanup');
  }
  function sourceControl(state) {
    var box = document.createElement('div'); box.className = 'naxx-bulk-source'; box.hidden = true;
    var label = document.createElement('label'); label.className = 'sr-only'; label.htmlFor = 'naxx-bulk-source'; label.textContent = 'Fonte dos canais ao vivo'; box.appendChild(label);
    var select = document.createElement('select'); select.className = 'form-control'; select.id = label.htmlFor;
    select.title = label.textContent;
    addOption(select, '', 'Todas as fontes'); box.appendChild(select);
    var category = state.form.querySelector('#stream_category_search');
    if (category && category.parentElement.parentElement === state.filters) category.parentElement.after(box);
    else {
      var tableCell = state.table;
      while (tableCell.parentElement && tableCell.parentElement !== state.filters) tableCell = tableCell.parentElement;
      if (tableCell.parentElement === state.filters) state.filters.insertBefore(box, tableCell);
      else state.filters.insertBefore(box, state.filters.firstChild);
    }
    state.sourceBox = box; state.sourceSelect = select;
    json(sourceURL(''), state.list.signal).then(function (result) {
      if (!valid(state)) return;
      if (!result || !result.ok || !Array.isArray(result.hosts)) throw new Error('source_hosts');
      result.hosts.filter(function (host) { return typeof host === 'string' && host.length > 0 && host.length <= 253 && !/[\u0000-\u0020\u007f]/.test(host); })
        .forEach(function (host) { addOption(select, host, host); });
      select.disabled = select.options.length < 2; box.hidden = false;
      if (state.jq.fn.select2) state.jq(select).select2({width:'100%'});
      state.jq(select).on('change.naxxBulkDelete', function () {
        abort(state); state.cache = null; state.source = select.value;
        useAjax(state, state.api.page.len()); state.api.ajax.reload(null, true); sync(state);
      });
    }).catch(function (error) {
      if (valid(state) && error.status !== 403) text(state, 'Não foi possível carregar o filtro de fonte. Os demais filtros continuam disponíveis.');
    });
  }
  function destroy(state) {
    abort(state); state.list.abort();
    state.jq(state.table).off('.naxxBulkDelete');
    if (state.nativeToggle) state.nativeToggle.removeEventListener('click', state.toggleHandler);
    if (state.sourceSelect) {
      state.jq(state.sourceSelect).off('.naxxBulkDelete');
      if (state.sourceSelect.classList.contains('select2-hidden-accessible')) state.jq(state.sourceSelect).select2('destroy');
    }
    if (state.settings.ajax === state.ajax) state.settings.ajax = state.native;
    state.filters.classList.remove('naxx-bulk-delete-filters');
    if (state.sourceBox) state.sourceBox.remove();
    state.summary.remove(); state.scope.remove(); state.status.remove(); states.delete(state.table);
  }
  function mount(table, jq, api, settings, initializing) {
    var native = settings.ajax, form = table.closest('form'), filters = form && form.querySelector('.row');
    var def = definitions[table.id];
    if (!form || !filters || !native || typeof native.url !== 'string' || typeof native.data !== 'function') return;
    var summary = document.createElement('p'); summary.className = 'naxx-bulk-selection-summary text-muted';
    var scope = document.createElement('p'); scope.className = 'naxx-bulk-scope-help text-muted'; scope.hidden = true;
    scope.textContent = 'O filtro de fonte afeta a tabela e a seleção manual. A ação Deletar Tudo inclui todo o conteúdo, mesmo com esse filtro.';
    var status = document.createElement('p'); status.className = 'naxx-bulk-filter-status text-muted'; status.hidden = true; status.setAttribute('role', 'status');
    // Fora da row que contém a tabela: mantém o agrupamento e a rolagem nativos.
    filters.before(summary); summary.after(scope); scope.after(status);
    filters.classList.add('naxx-bulk-delete-filters');
    var state = {table:table, def:def, form:form, filters:filters, api:api, settings:settings, native:native, jq:jq,
      source:'', cache:null, request:null, summary:summary, scope:scope, status:status, list:new AbortController()};
    state.ajax = function (data, callback) { return runAjax(state, data, callback); };
    states.set(table, state);
    jq(table).on('length.dt.naxxBulkDelete', function (_event, eventSettings, length) {
      if (eventSettings !== settings) return;
      sizeControls(state, length); useAjax(state, length);
    });
    jq(table).on('draw.dt.naxxBulkDelete', function () { sizeControls(state, api.page.len()); sync(state); });
    jq(table).on('destroy.dt.naxxBulkDelete', function () { if (valid(state)) destroy(state); });
    // Selectable e o botão original mantêm os callbacks nativos; só atualizamos
    // o resumo após a seleção de linhas, sem interferir no envio do formulário.
    jq(table).on('selectablestop.naxxBulkDelete', function () { sync(state); });
    var nativeToggle = form.querySelector('button[onclick^="toggle"]');
    if (nativeToggle) {
      nativeToggle.title = 'Inverter seleção dos itens visíveis'; nativeToggle.setAttribute('aria-label', nativeToggle.title);
      state.nativeToggle = nativeToggle; state.toggleHandler = function () { sync(state); };
      nativeToggle.addEventListener('click', state.toggleHandler);
    }
    sizeControls(state, api.page.len()); useAjax(state, api.page.len()); sync(state);
    if (def.source) sourceControl(state);
    if (!initializing && api.page.len() > batch) api.ajax.reload(null, false);
  }
  function enhance(initializing) {
    var enabled = /\/mass_delete(?:\.php)?$/.test(window.location.pathname);
    states.forEach(function (state) { if (!enabled || !state.table.isConnected) destroy(state); });
    var jq = window.jQuery;
    if (!jq || !jq.fn || !jq.fn.dataTable) return;
    if (!bound) {
      bound = true;
      jq(document).on('preInit.dt.naxxBulkDelete', selector, function (_event, settings) { enhance(settings); });
      jq(document).on('init.dt.naxxBulkDelete', selector, function () { enhance(); });
    }
    if (!enabled) return;
    Object.keys(definitions).forEach(function (id) {
      var table = document.getElementById(id);
      if (!table || !jq.fn.dataTable.isDataTable(table)) return;
      var api = jq(table).DataTable(), settings = api.settings()[0], previous = states.get(table);
      if (previous && previous.settings !== settings) { destroy(previous); previous = null; }
      if (previous) { sizeControls(previous, api.page.len()); return; }
      if (settings && (settings._bInitComplete || settings === initializing)) mount(table, jq, api, settings, settings === initializing);
    });
  }
  window.NaxxBulkDelete = {enhance:enhance, filteredIds:filteredIds};
  enhance();
  var scheduled = false;
  new MutationObserver(function (changes) {
    if (scheduled || !changes.some(function (change) {
      return Array.prototype.some.call(Array.prototype.slice.call(change.addedNodes).concat(Array.prototype.slice.call(change.removedNodes)), function (node) {
        return node.nodeType === 1 && (node.matches(selector) || node.querySelector(selector));
      });
    })) return;
    scheduled = true;
    window.setTimeout(function () { scheduled = false; enhance(); }, 0);
  }).observe(document.documentElement, {childList:true, subtree:true});
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { enhance(); }, {once:true});
}());
