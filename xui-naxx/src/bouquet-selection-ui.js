/* Seleção por página ou por resultado completo no rascunho nativo de listas. */
(function () {
  'use strict';
  if (window.NaxxBouquetSelection) { window.NaxxBouquetSelection.enhance(); return; }

  var tables = {
    'datatable-stream': {type: 'stream', label: 'Canais', query: 'bouquets_streams', category: 'category_id', search: 'stream_search'},
    'datatable-movies': {type: 'movies', label: 'Filmes', query: 'bouquets_vod', category: 'category_idv', search: 'vod_search'},
    'datatable-series': {type: 'series', label: 'Séries', query: 'bouquets_series', category: 'category_ids', search: 'series_search'},
    'datatable-radios': {type: 'radios', label: 'Rádio', query: 'bouquets_radios', category: 'category_idr', search: 'radios_search'}
  };
  var states = new Map();
  var observedForm = null;
  var observer = null;
  var bound = false;
  var frame = null;
  var bulk = null;
  var lazySettings = null;
  var names = new Map();
  var batchSize = 1000;

  function count(value) { return value.toLocaleString('pt-BR'); }

  function integer(value) {
    if (typeof value !== 'number' && (typeof value !== 'string' || !/^\d+$/.test(value))) return null;
    var number = Number(value);
    return Number.isSafeInteger(number) && number >= 0 ? number : null;
  }

  // Preserve callbacks while copying public DataTables configuration/parameters.
  function copy(value) {
    if (Array.isArray(value)) return value.map(copy);
    if (value && Object.prototype.toString.call(value) === '[object Object]') {
      var result = {};
      Object.keys(value).forEach(function (key) {
        if (key !== '__proto__' && key !== 'constructor' && key !== 'prototype') result[key] = copy(value[key]);
      });
      return result;
    }
    return value;
  }

  function sourceTable(state) {
    var jq = window.jQuery;
    return jq && jq.fn.dataTable.isDataTable(state.table) ? jq(state.table).DataTable() : null;
  }

  function filterValue(id) {
    var control = document.getElementById(id);
    return control ? String(control.value || '') : '';
  }

  function allScope(state) {
    try {
      var api = sourceTable(state);
      if (!api || !api.ajax || typeof api.ajax.params !== 'function' || typeof api.ajax.url !== 'function') return null;
      var params = copy(api.ajax.params());
      var info = api.page.info();
      var total = integer(info.recordsDisplay);
      var records = integer(info.recordsTotal);
      if (!params || params.id !== state.definition.query || total === null || records === null || total > records) return null;
      var signature = copy(params);
      ['draw', 'start', 'length', 'order'].forEach(function (key) { delete signature[key]; });
      var url = api.ajax.url();
      if (typeof url !== 'string' || !url) return null;
      return {params: params, total: total, records: records, url: url,
        key: JSON.stringify([url, signature, filterValue(state.definition.category), filterValue(state.definition.search)])};
    } catch (_error) { return null; }
  }

  function unchanged(job) {
    if (window.rBouquet !== job.model || document.getElementById('bouquet_form') !== job.form ||
        document.getElementById(job.table.id) !== job.table ||
        document.getElementById('datatable-review') !== job.reviewTable ||
        !job.form.isConnected || !job.form.contains(job.table)) return false;
    var scope = allScope(job.state);
    return job.state.table.isConnected && scope && scope.key === job.scope.key &&
      scope.total === job.scope.total && scope.records === job.scope.records;
  }

  function escapeHTML(value) {
    return String(value).replace(/[&<>"']/g, function (character) {
      return {'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[character];
    });
  }

  function reviewRow(id, type, name) {
    var row = [id, type.charAt(0).toUpperCase() + type.slice(1), escapeHTML(name),
      '<button type="button" class="btn-remove btn btn-warning waves-effect waves-warning btn-xs" ' +
      'onClick="toggleBouquet(' + id + ', \'' + type + '\');"><i class="mdi mdi-minus"></i></button>'];
    row.DT_RowId = type + '-' + id;
    return row;
  }

  function rowCopy(data) {
    if (!Array.isArray(data) || data.length !== 4) throw new Error('review_contract');
    var id = integer(data[0]);
    var type = String(data[1]).toLowerCase();
    if (!id || !Object.keys(tables).some(function (key) { return tables[key].type === type; })) throw new Error('review_contract');
    var row = data.slice();
    row.DT_RowId = type + '-' + id;
    return row;
  }

  function visibleName(id, type) {
    var table = document.getElementById('datatable-' + type);
    var row = table && table.querySelector('#' + type + '-' + id);
    return row && row.children[1] ? row.children[1].textContent : names.get(type + '-' + id) || '';
  }

  // Native addRow requires an immediate DOM node. With rowId metadata, native
  // delRow keeps finding even off-page rows while Review creates only its page.
  function lazyReview() {
    var api = review();
    var table = document.getElementById('datatable-review');
    if (lazySettings && lazySettings.table === table) return api;
    var rows = api.rows().data().toArray().map(rowCopy);
    var config = copy(api.init());
    var info = api.page.info();
    config.data = rows;
    delete config.aaData;
    config.deferRender = true;
    config.rowId = 'DT_RowId';
    config.order = copy(api.order());
    config.search = copy(config.search || {});
    config.search.search = api.search();
    config.pageLength = info.length;
    config.displayStart = info.start;
    if (typeof api.columns === 'function') {
      var priorSearches = config.searchCols || [];
      config.searchCols = api.columns().search().toArray().map(function (search, index) {
        var options = copy(priorSearches[index] || {});
        options.search = search;
        return options;
      });
    }
    api.destroy(false);
    try {
      api = window.jQuery(table).DataTable(config);
    } catch (error) {
      // Rebuild the same draft even if initialization fails midway.
      try {
        var damaged = review();
        if (damaged) damaged.destroy(false);
        var fallback = copy(config);
        fallback.deferRender = false;
        window.jQuery(table).DataTable(fallback);
      } catch (_restoreError) { /* The outer operation reports failure. */ }
      throw error;
    }
    lazySettings = {table: table};
    window.addRow = function (raw, type) {
      var id = integer(raw);
      if (!id || !Object.keys(tables).some(function (key) { return tables[key].type === type; })) return;
      review().row.add(reviewRow(id, type, visibleName(id, type)));
    };
    return api;
  }

  function lock(job) {
    job.controls = Array.prototype.map.call(job.form.querySelectorAll('button,input,select,textarea'), function (control) {
      var prior = control.disabled;
      if (control !== job.state.cancel) control.disabled = true;
      return [control, prior];
    });
  }

  function unlock(job) {
    (job.controls || []).forEach(function (entry) { if (entry[0].isConnected) entry[0].disabled = entry[1]; });
  }

  function repaintVisible(state) {
    var selection = selected(state.type);
    Array.prototype.forEach.call(state.table.querySelectorAll('tbody .btn-add[data-id][data-type],tbody .btn-remove[data-id][data-type]'), function (button) {
      var id = integer(button.getAttribute('data-id'));
      if (!id || button.getAttribute('data-type') !== state.type || button.closest('table') !== state.table) return;
      var add = button.className.split(/\s+/).indexOf('btn-add') !== -1;
      button.style.display = selection.has(id) === add ? 'none' : '';
    });
  }

  function updateJob(job, message) {
    job.message = message;
    states.forEach(refresh);
  }

  function cancelBulk(reason) {
    if (!bulk) return;
    bulk.cancelled = reason || 'cancelled';
    if (bulk.xhr && typeof bulk.xhr.abort === 'function') bulk.xhr.abort();
    updateJob(bulk, 'Cancelando seleção…');
  }

  function check(job) {
    if (job.cancelled) throw new Error(job.cancelled);
    if (!unchanged(job)) throw new Error('changed');
  }

  function tick() { return new Promise(function (resolve) { window.setTimeout(resolve, 0); }); }

  function requestPage(job, params, url) {
    return new Promise(function (resolve, reject) {
      job.xhr = window.jQuery.ajax({url: url, type: 'GET', data: params, dataType: 'json', timeout: 30000,
        success: function (response) { job.xhr = null; resolve(response); },
        error: function () { job.xhr = null; reject(new Error(job.cancelled || 'network')); }});
    });
  }

  async function applyAll(state) {
    if (bulk || state.busy || state.loading || !nativeReady(state) || !visible(state.table)) return;
    var scope = allScope(state);
    if (!scope || !scope.total) return;
    var job = {state: state, scope: scope, model: window.rBouquet,
      form: document.getElementById('bouquet_form'), table: state.table,
      reviewTable: document.getElementById('datatable-review'),
      phase: 'collecting', message: '', cancelled: '', xhr: null};
    var snapshot = null;
    var selection = job.model[state.type].slice();
    var api = null;
    var committed = false;
    var modelPublished = false;
    bulk = job;
    state.notice = '';
    lock(job);
    updateJob(job, 'Buscando 0 de ' + count(scope.total) + ' itens…');
    try {
      // Only the native same-origin table endpoint is allowed. Source/media
      // URLs in row data are never opened or used as request destinations.
      var url = new URL(scope.url, window.location.href);
      if (url.origin !== window.location.origin || !/^https?:$/.test(url.protocol) ||
          !/\/table(?:\.php)?$/.test(url.pathname) || url.username || url.password || url.hash) throw new Error('endpoint');
      var collected = [];
      var previous = 0;
      var offset = 0;
      var draw = integer(scope.params.draw) || 0;
      while (offset < scope.total) {
        check(job);
        var params = copy(scope.params);
        params.start = offset;
        params.length = batchSize;
        params.order = [{column: 0, dir: 'asc'}];
        params.draw = ++draw;
        var response = await requestPage(job, params, url.href);
        check(job);
        if (!response || response.error || integer(response.recordsFiltered) !== scope.total ||
            integer(response.recordsTotal) !== scope.records || !Array.isArray(response.data) ||
            !response.data.length || response.data.length > batchSize ||
            (response.draw !== undefined && integer(response.draw) !== params.draw) ||
            offset + response.data.length > scope.total) throw new Error('response');
        response.data.forEach(function (row) {
          var id = Array.isArray(row) && row.length === 4 ? integer(row[0]) : null;
          if (!id || id <= previous || typeof row[1] !== 'string' || typeof row[3] !== 'string') throw new Error('response');
          previous = id;
          collected.push({id: id, name: row[1]});
        });
        // Servers may cap length below the requested batch size.
        offset += response.data.length;
        updateJob(job, 'Buscando ' + count(offset) + ' de ' + count(scope.total) + ' itens…');
      }
      check(job);
      var present = new Set(selection.map(Number));
      var additions = collected.filter(function (item) { return !present.has(item.id); });
      if (!additions.length) {
        state.notice = 'Todos os ' + count(scope.total) + ' itens já estão selecionados.';
        return;
      }
      job.phase = 'applying';
      api = lazyReview();
      snapshot = api.rows().data().toArray().map(rowCopy);
      for (var start = 0; start < additions.length; start += batchSize) {
        check(job);
        api.rows.add(additions.slice(start, start + batchSize).map(function (item) { return reviewRow(item.id, state.type, item.name); }));
        updateJob(job, 'Selecionando ' + count(Math.min(start + batchSize, additions.length)) + ' de ' + count(additions.length) + ' itens…');
        await tick();
      }
      check(job);
      // Publish the native draft only after every page and Review batch passed.
      job.model[state.type] = selection.concat(additions.map(function (item) { return item.id; }));
      modelPublished = true;
      api.draw(false);
      additions.forEach(function (item) { names.set(state.type + '-' + item.id, item.name); });
      committed = true;
      state.notice = count(additions.length) + (additions.length === 1 ? ' item selecionado.' : ' itens selecionados.');
    } catch (error) {
      if (snapshot && api) {
        if (modelPublished) job.model[state.type] = selection;
        // One linear restore avoids removing hundreds of thousands of rows
        // individually, which would repeatedly reindex the complete table.
        try { api.clear(); api.rows.add(snapshot); api.draw(false); }
        catch (_restoreError) { state.notice = 'Não foi possível restaurar a revisão. Recarregue a página antes de salvar.'; }
      }
      if (!state.notice) state.notice = error.message === 'cancelled' ? 'Seleção cancelada. O rascunho foi preservado.' :
        error.message === 'changed' ? 'Busca ou categoria alterada. O rascunho foi preservado.' :
        'Não foi possível selecionar todos os itens. O rascunho foi preservado; tente novamente.';
    } finally {
      if (!committed && modelPublished) job.model[state.type] = selection;
      bulk = null;
      unlock(job);
      if (committed) repaintVisible(state);
      states.forEach(refresh);
    }
  }

  function visible(element) {
    if (!element || !element.isConnected || element.hidden || !element.getClientRects().length) return false;
    var style = window.getComputedStyle(element);
    return style.display !== 'none' && style.visibility !== 'hidden' && style.visibility !== 'collapse';
  }

  function selected(type) {
    if (!window.rBouquet || !Array.isArray(window.rBouquet[type])) return null;
    return new Set(window.rBouquet[type].map(Number));
  }

  function review() {
    var jq = window.jQuery;
    var table = document.getElementById('datatable-review');
    if (!jq || !jq.fn || !jq.fn.dataTable || typeof jq.fn.dataTable.isDataTable !== 'function' ||
        !table || !jq.fn.dataTable.isDataTable(table)) return null;
    return jq(table).DataTable();
  }

  function nativeReady(state) {
    return typeof window.toggleBouquet === 'function' && window.rBouquet &&
      Array.isArray(window.rBouquet[state.type]) && review() !== null;
  }

  function items(state, mode, selection) {
    if (!visible(state.table)) return [];
    selection = selection || selected(state.type);
    if (!selection) return [];
    var seen = new Set();
    var selector = mode === 'add' ? '.btn-add[data-id][data-type]' :
      mode === 'remove' ? '.btn-remove[data-id][data-type]' : '.btn-add[data-id][data-type],.btn-remove[data-id][data-type]';
    return Array.prototype.filter.call(state.table.querySelectorAll('tbody ' + selector.split(',').join(',tbody ')), function (button) {
      var raw = button.getAttribute('data-id');
      var id = Number(raw);
      if (button.closest('table') !== state.table || button.getAttribute('data-type') !== state.type ||
          !/^[1-9]\d*$/.test(raw || '') || !Number.isSafeInteger(id) ||
          button.disabled || button.getAttribute('aria-disabled') === 'true' || !visible(button) || seen.has(id)) return false;
      if (mode === 'add' && selection.has(id) || mode === 'remove' && !selection.has(id)) return false;
      seen.add(id);
      return true;
    });
  }

  function text(element, value) {
    if (element.textContent !== value) element.textContent = value;
  }

  function refresh(state) {
    if (bulk) {
      state.add.disabled = state.remove.disabled = state.all.disabled = true;
      var current = bulk.state === state;
      if (state.cancel.hidden !== !current) state.cancel.hidden = !current;
      state.cancel.disabled = false;
      if (current) text(state.status, bulk.message);
      return;
    }
    if (!state.cancel.hidden) state.cancel.hidden = true;
    var ready = nativeReady(state);
    var selection = visible(state.table) ? selected(state.type) : null;
    var adds = items(state, 'add', selection);
    var removes = items(state, 'remove', selection);
    var total = items(state, null, selection).length;
    var unavailable = state.busy || state.loading || !ready || !visible(state.table);
    state.add.disabled = unavailable || adds.length === 0;
    state.remove.disabled = unavailable || removes.length === 0;
    var scope = allScope(state);
    state.all.disabled = unavailable || !scope || scope.total === 0;
    text(state.all, 'Selecionar tudo' + (scope && scope.total ? ' (' + count(scope.total) + ')' : ''));
    text(state.add, 'Selecionar visíveis' + (adds.length ? ' (' + adds.length + ')' : ''));
    text(state.remove, 'Desmarcar visíveis' + (removes.length ? ' (' + removes.length + ')' : ''));
    var status = state.busy ? 'Atualizando seleção…' : state.loading || !ready ? 'Carregando itens…' :
      total + (total === 1 ? ' item nesta página' : ' itens nesta página') + ' · ' + removes.length +
        (removes.length === 1 ? ' selecionado.' : ' selecionados.');
    text(state.status, state.notice ? state.notice + ' ' + status : status);
  }

  function apply(state, mode) {
    if (bulk || state.busy || state.loading || !nativeReady(state) || !visible(state.table)) return;
    var buttons = items(state, mode);
    if (!buttons.length) return;
    state.busy = true;
    state.notice = '';
    refresh(state);
    var changed = 0;
    var failed = false;
    try {
      buttons.forEach(function (button) {
        var id = Number(button.getAttribute('data-id'));
        var values = window.rBouquet && window.rBouquet[state.type];
        // A callback nativa pode redesenhar/ocultar uma linha. Nunca inverta
        // novamente um item que já atingiu o estado solicitado.
        if (!Array.isArray(values) || !visible(button) || (mode === 'add') === values.some(function (value) { return Number(value) === id; })) return;
        window.toggleBouquet(id, state.type, false);
        var after = window.rBouquet && window.rBouquet[state.type];
        if (Array.isArray(after) && after.some(function (value) { return Number(value) === id; }) === (mode === 'add')) changed++;
        else throw new Error('selection_not_confirmed');
      });
    } catch (_error) {
      failed = true;
    } finally {
      try {
        // Cada toggle atualiza o rascunho e as linhas da revisão nativa;
        // desenhar uma única vez evita redesenhar a lista inteira a cada item.
        if (changed) review().draw(false);
      } catch (_error) { failed = true; }
      state.busy = false;
      state.notice = failed ? 'A seleção foi parcialmente atualizada. Confira os itens antes de salvar.' :
        changed + (changed === 1 ? ' item ' : ' itens ') + (mode === 'add' ?
          (changed === 1 ? 'selecionado.' : 'selecionados.') : (changed === 1 ? 'desmarcado.' : 'desmarcados.'));
      refresh(state);
    }
  }

  function create(table, definition) {
    var box = document.createElement('div');
    box.className = 'naxx-bouquet-selection mb-3';
    box.setAttribute('role', 'group');
    box.setAttribute('aria-label', 'Seleção dos itens visíveis: ' + definition.label);
    var actions = document.createElement('div');
    actions.className = 'd-flex flex-wrap align-items-center';
    actions.style.gap = '8px';
    var add = document.createElement('button');
    add.type = 'button'; add.className = 'btn btn-outline-primary btn-sm';
    add.setAttribute('aria-controls', table.id);
    var remove = document.createElement('button');
    remove.type = 'button'; remove.className = 'btn btn-outline-secondary btn-sm';
    remove.setAttribute('aria-controls', table.id);
    var all = document.createElement('button');
    all.type = 'button'; all.className = 'btn btn-primary btn-sm';
    all.setAttribute('aria-controls', table.id);
    all.setAttribute('data-naxx-bouquet-all', definition.type);
    var cancel = document.createElement('button');
    cancel.type = 'button'; cancel.className = 'btn btn-outline-secondary btn-sm';
    cancel.textContent = 'Cancelar'; cancel.hidden = true;
    var status = document.createElement('span');
    status.className = 'text-muted small';
    status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite');
    var help = document.createElement('div');
    help.className = 'text-muted small mt-2';
    help.textContent = 'Visíveis: página atual. Tudo: todos os resultados da busca e categoria. Salve a lista para gravar as alterações.';
    actions.appendChild(add); actions.appendChild(remove); actions.appendChild(status);
    actions.appendChild(all); actions.appendChild(cancel);
    box.appendChild(actions); box.appendChild(help);
    var target = table.closest('.dataTables_wrapper') || table;
    target.parentNode.insertBefore(box, target);
    var state = {table: table, type: definition.type, definition: definition, box: box, add: add, remove: remove,
      all: all, cancel: cancel, status: status, busy: false, loading: false, notice: ''};
    add.addEventListener('click', function (event) { event.preventDefault(); apply(state, 'add'); });
    remove.addEventListener('click', function (event) { event.preventDefault(); apply(state, 'remove'); });
    all.addEventListener('click', function (event) { event.preventDefault(); return applyAll(state); });
    cancel.addEventListener('click', function (event) { event.preventDefault(); cancelBulk(); });
    return state;
  }

  function schedule() {
    if (frame !== null) return;
    frame = window.requestAnimationFrame(function () { frame = null; enhance(); });
  }

  function bind() {
    var jq = window.jQuery;
    if (bound || !jq || !jq.fn || !jq.fn.dataTable) return;
    bound = true;
    jq(document).on('draw.dt.naxxBouquetSelection init.dt.naxxBouquetSelection', 'table', function () {
      var state = states.get(this);
      if (state) { state.loading = false; state.notice = ''; }
      schedule();
    });
    jq(document).on('processing.dt.naxxBouquetSelection', 'table', function (_event, _settings, processing) {
      var state = states.get(this);
      if (state) {
        if (bulk && bulk.state === state && processing) cancelBulk('changed');
        state.loading = Boolean(processing); refresh(state);
      }
    });
    jq(document).on('shown.bs.tab.naxxBouquetSelection', schedule);
  }

  function enhance() {
    if (!/\/bouquet(?:\.php)?$/.test(window.location.pathname)) {
      if (bulk) cancelBulk('changed');
      if (observer) observer.disconnect();
      observedForm = null;
      states.forEach(function (state) { state.box.remove(); });
      states.clear();
      return;
    }
    var form = document.getElementById('bouquet_form');
    if (!form) return;
    bind();
    states.forEach(function (state, table) {
      if (!table.isConnected || !form.contains(table)) { state.box.remove(); states.delete(table); }
    });
    Object.keys(tables).forEach(function (id) {
      var table = document.getElementById(id);
      if (!table || !form.contains(table)) return;
      var state = states.get(table);
      if (!state) { state = create(table, tables[id]); states.set(table, state); }
      refresh(state);
    });
    if (observedForm !== form && typeof MutationObserver === 'function') {
      if (observer) observer.disconnect();
      observer = new MutationObserver(schedule);
      observer.observe(form, {childList: true, subtree: true, attributes: true, attributeFilter: ['style', 'class', 'hidden']});
      observedForm = form;
      form.addEventListener('submit', function (event) {
        if (bulk) { event.preventDefault(); event.stopImmediatePropagation(); }
      }, true);
      form.addEventListener('click', function (event) {
        if (bulk && !bulk.state.cancel.contains(event.target)) { event.preventDefault(); event.stopImmediatePropagation(); }
      }, true);
      ['change', 'input'].forEach(function (name) {
        form.addEventListener(name, function () { if (bulk) cancelBulk('changed'); }, true);
      });
    }
  }

  window.NaxxBouquetSelection = {enhance: enhance};
  enhance();
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', enhance, {once: true});
}());
