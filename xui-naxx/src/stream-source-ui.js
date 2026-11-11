/* Fonte e páginas maiores da lista nativa de canais. */
(function () {
  'use strict';
  var tableId = 'datatable-streampage', batch = 1000, maxCatalog = 50000;
  var active = null, bound = false;

  function text(state, message) {
    state.status.textContent = message;
    state.status.hidden = !message;
  }

  function json(url, signal) {
    return window.fetch(url, {credentials: 'same-origin', cache: 'no-store', signal: signal,
      headers: {'X-Requested-With': 'XMLHttpRequest', 'Accept': 'application/json'}}).then(function (response) {
      if (!response.ok) throw new Error('request_failed');
      return response.json();
    });
  }

  function sourceURL(host) {
    var url = new URL('naxx-update.php', window.location.href);
    url.searchParams.set('feature', 'stream-sources');
    if (host) url.searchParams.set('host', host);
    return url.href;
  }

  function integer(value) {
    var n = typeof value === 'number' ? value : typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : NaN;
    return Number.isSafeInteger(n) && n >= 0 ? n : NaN;
  }

  function rowId(row) {
    return Array.isArray(row) ? integer(String(row[0]).replace(/<[^>]*>/g, '').trim()) : NaN;
  }

  async function queryPage(state, params, start, length, signal) {
    var url = new URL(state.native.url, window.location.href);
    if (url.origin !== window.location.origin || !/\/table(?:\.php)?$/.test(url.pathname)) throw new Error('native_route');
    var payload = Object.assign({}, params, {start: start, length: length});
    url.search = state.jq.param(payload);
    var page = await json(url.href, signal);
    var total = integer(page.recordsTotal), filtered = integer(page.recordsFiltered);
    if (integer(page.draw) !== integer(params.draw) || !Number.isFinite(total) || !Number.isFinite(filtered) ||
        !Array.isArray(page.data) || page.data.length !== Math.min(length, Math.max(0, filtered - start))) throw new Error('native_page');
    return {total: total, filtered: filtered, rows: page.data};
  }

  async function collect(state, params, source, signal) {
    var start = source ? 0 : integer(params.start), count = integer(params.length);
    if (!Number.isFinite(start) || !Number.isFinite(count) || count < 1 || count > 5000) throw new Error('length');
    var ids = null;
    if (source) {
      var selection = await json(sourceURL(source), signal);
      if (!selection.ok || !Array.isArray(selection.ids) || selection.ids.length > maxCatalog ||
          selection.ids.some(function (id) { return !Number.isSafeInteger(id) || id < 1; })) throw new Error('source_ids');
      ids = new Set(selection.ids);
    }
    var result = null, seen = new Set();
    do {
      var limit = source ? (ids.size ? batch : 1) : Math.min(batch, count - (result ? result.rows.length : 0));
      var page = await queryPage(state, params, start, limit, signal);
      if (!result) result = {total: page.total, filtered: page.filtered, rows: []};
      if (result.filtered !== page.filtered || result.total !== page.total || (source && page.filtered > maxCatalog)) throw new Error('catalog_changed');
      page.rows.forEach(function (row) {
        var id = rowId(row);
        if (!Number.isFinite(id) || seen.has(id)) throw new Error('catalog_changed');
        seen.add(id);
        if (!ids || ids.has(id)) {
          result.rows.push(row);
          if (ids) ids.delete(id);
        }
      });
      start += page.rows.length;
      if (start >= page.filtered || !page.rows.length || (ids ? !ids.size : result.rows.length >= count)) break;
    } while (true);
    if (source) result.filtered = result.rows.length;
    return result;
  }

  function signature(params, source) {
    var filters = Object.assign({}, params);
    delete filters.start; delete filters.length; delete filters.draw;
    return JSON.stringify([source, filters]);
  }

  function useAjax(state, length) {
    var replacement = state.source || Number(length) > batch;
    state.settings.ajax = replacement ? state.ajax : state.native;
  }

  function abort(state) {
    if (state.request) state.request.abort();
    state.request = null;
  }

  function runAjax(state, data, callback) {
    abort(state);
    state.native.data(data, state.settings);
    var source = state.source, start = integer(data.start), length = integer(data.length);
    var controller = new AbortController(), timedOut = false;
    var request = {readyState: 1, abort: function () { controller.abort(); request.readyState = 0; }};
    state.request = request;
    var timer = window.setTimeout(function () { timedOut = true; controller.abort(); }, 45000);
    var key = signature(data, source), cached = state.cache;
    var reuse = source && cached && cached.key === key && cached.expires > Date.now() &&
      (cached.start !== start || cached.length !== length);
    text(state, source ? 'Buscando canais da fonte…' : 'Carregando a página de canais…');
    var loading = reuse ? Promise.resolve(cached.result) : collect(state, data, source, controller.signal);
    loading.then(function (result) {
      if (state.request !== request || controller.signal.aborted || !state.table.isConnected) return;
      if (source) state.cache = {key: key, result: result, start: start, length: length, expires: Date.now() + 15000};
      text(state, '');
      callback({draw: integer(data.draw), recordsTotal: result.total, recordsFiltered: result.filtered,
        data: source ? result.rows.slice(start, start + length) : result.rows});
    }, function () {
      if (state.request !== request || (!timedOut && controller.signal.aborted) || !state.table.isConnected) return;
      state.cache = null;
      text(state, 'Não foi possível carregar os canais. Atualize a lista e tente novamente.');
      callback({draw: integer(data.draw), recordsTotal: 0, recordsFiltered: 0, data: []});
    }).finally(function () {
      window.clearTimeout(timer);
      request.readyState = 4;
      if (state.request === request) state.request = null;
    });
    return request;
  }

  function setURL(host) {
    if (host && typeof window.setParam === 'function') window.setParam('naxx_source', host);
    else if (!host && typeof window.delParam === 'function') window.delParam('naxx_source');
    else {
      var url = new URL(window.location.href);
      if (host) url.searchParams.set('naxx_source', host); else url.searchParams.delete('naxx_source');
      window.history.replaceState(window.history.state, '', url.href);
    }
  }

  function choose(state, source, redraw) {
    if (state.source === source) return;
    abort(state);
    state.source = source;
    state.cache = null;
    state.select.value = source;
    if (state.select.classList.contains('select2-hidden-accessible')) state.jq(state.select).trigger('change.select2');
    setURL(source);
    useAjax(state, state.api.page.len());
    text(state, '');
    if (redraw) {
      if (typeof window.checkClear === 'function') window.checkClear();
      state.api.ajax.reload(null, true);
    }
  }

  function wrap(state, name, make) {
    var original = window[name];
    if (typeof original !== 'function') return;
    var previous = state.wrappers[name];
    if (previous && previous.replacement === original) return;
    var replacement = make(original);
    state.wrappers[name] = {original: original, replacement: replacement};
    window[name] = replacement;
  }

  function hooks(state) {
    wrap(state, 'clearFilters', function (original) { return function () {
      choose(state, '', false);
      return original.apply(this, arguments);
    }; });
    wrap(state, 'checkClear', function (original) { return function () {
      var result = original.apply(this, arguments), button = document.getElementById('clearFilters');
      if (state.source && button) button.disabled = false;
      return result;
    }; });
    // Um timer da página anterior pode disparar depois de selecionar 5.000.
    wrap(state, 'getStreamIDs', function (original) { return function () {
      if (!state.table.isConnected || state.api.rows().count() > 50) return [[], []];
      return original.apply(this, arguments);
    }; });
  }

  function destroy(state) {
    abort(state); state.list.abort();
    state.jq(state.table).off('.naxxStreamTable');
    state.jq(state.select).off('.naxxStreamTable');
    if (state.select.classList.contains('select2-hidden-accessible')) state.jq(state.select).select2('destroy');
    if (state.settings.ajax === state.ajax) state.settings.ajax = state.native;
    Object.keys(state.wrappers).forEach(function (name) {
      var binding = state.wrappers[name];
      if (window[name] === binding.replacement) window[name] = binding.original;
    });
    state.filters.classList.remove('naxx-stream-source-filters');
    state.box.remove(); state.status.remove();
  }

  function addOption(select, value, label) {
    var option = document.createElement('option');
    option.value = value; option.textContent = label; select.appendChild(option);
  }

  function mount(table, filters, jq, api, settings) {
    var native = settings.ajax;
    if (!native || typeof native.url !== 'string' || typeof native.data !== 'function') return;
    var box = document.createElement('div'), select = document.createElement('select'), status = document.createElement('p');
    box.className = 'naxx-stream-source-control'; box.hidden = true;
    select.className = 'form-control'; select.id = 'naxx-stream-source';
    select.setAttribute('aria-label', 'Filtrar canais por fonte');
    addOption(select, '', 'Todas as fontes'); box.appendChild(select);
    var category = document.getElementById('stream_category_id');
    if (category && category.parentElement.parentElement === filters) category.parentElement.after(box); else filters.appendChild(box);
    status.className = 'naxx-stream-source-status text-muted'; status.hidden = true;
    status.setAttribute('role', 'status'); filters.after(status);
    var state = {table: table, filters: filters, api: api, settings: settings, native: native, jq: jq,
      box: box, select: select, status: status, source: '', request: null, cache: null,
      list: new AbortController(), wrappers: {}};
    state.ajax = function (data, callback) { return runAjax(state, data, callback); };
    active = state;
    jq(table).on('length.dt.naxxStreamTable', function (_event, eventSettings, length) {
      if (eventSettings === settings) useAjax(state, length);
    });
    hooks(state);
    useAjax(state, api.page.len());
    if (api.page.len() > batch) api.ajax.reload(null, false);
    json(sourceURL(''), state.list.signal).then(function (result) {
      if (active !== state || !table.isConnected || !result.ok || !Array.isArray(result.hosts)) return;
      var hosts = result.hosts.filter(function (host) { return typeof host === 'string' && host.length && host.length <= 253; });
      hosts.forEach(function (host) { addOption(select, host, host); });
      if (!hosts.length) select.disabled = true;
      box.hidden = false;
      filters.classList.add('naxx-stream-source-filters');
      if (jq.fn.select2) jq(select).select2({width: '100%'});
      jq(select).on('change.naxxStreamTable', function () { choose(state, select.value, true); });
      var requested = new URLSearchParams(window.location.search).get('naxx_source');
      if (requested && hosts.indexOf(requested) !== -1) choose(state, requested, true);
      else if (requested) setURL('');
    }).catch(function () {});
  }

  function enhance() {
    var table = /\/streams(?:\.php)?$/.test(window.location.pathname) ? document.getElementById(tableId) : null;
    var filters = table && document.getElementById('collapse_filters'), jq = window.jQuery;
    if (active && (active.table !== table || active.filters !== filters || !table || !table.isConnected)) {
      destroy(active); active = null;
    }
    if (!jq || !jq.fn || !jq.fn.dataTable) return;
    if (!bound) {
      bound = true;
      jq(document).on('init.dt.naxxStreamTable', '#' + tableId, enhance);
      document.addEventListener('click', function (event) {
        if (!active || !active.source || !active.table.isConnected || !event.target.closest('#btn-export-csv')) return;
        event.preventDefault(); event.stopImmediatePropagation();
        text(active, 'Limpe o filtro de fonte antes de exportar o CSV.');
      }, true);
    }
    if (active) { hooks(active); return; }
    if (!table || !filters || !jq.fn.dataTable.isDataTable(table)) return;
    var api = jq(table).DataTable(), settings = api.settings()[0];
    if (settings && settings._bInitComplete) mount(table, filters, jq, api, settings);
  }

  window.NaxxStreamSources = {enhance: enhance};
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', enhance, {once: true});
  else enhance();
}());
