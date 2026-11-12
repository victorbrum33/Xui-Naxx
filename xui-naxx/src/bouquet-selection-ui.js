/* Seleciona somente os itens da página visível do editor nativo de listas. */
(function () {
  'use strict';
  if (!/\/bouquet(?:\.php)?$/.test(window.location.pathname)) return;
  if (window.NaxxBouquetSelection) { window.NaxxBouquetSelection.enhance(); return; }

  var tables = {
    'datatable-stream': {type: 'stream', label: 'Canais'},
    'datatable-movies': {type: 'movies', label: 'Filmes'},
    'datatable-series': {type: 'series', label: 'Séries'},
    'datatable-radios': {type: 'radios', label: 'Rádio'}
  };
  var states = new Map();
  var observedForm = null;
  var observer = null;
  var bound = false;
  var frame = null;

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
    return typeof window.toggleBouquet === 'function' && selected(state.type) !== null && review() !== null;
  }

  function items(state, mode) {
    var selection = selected(state.type);
    if (!selection || !visible(state.table)) return [];
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
    var ready = nativeReady(state);
    var adds = items(state, 'add');
    var removes = items(state, 'remove');
    var total = items(state).length;
    var unavailable = state.busy || state.loading || !ready || !visible(state.table);
    state.add.disabled = unavailable || adds.length === 0;
    state.remove.disabled = unavailable || removes.length === 0;
    text(state.add, 'Selecionar visíveis' + (adds.length ? ' (' + adds.length + ')' : ''));
    text(state.remove, 'Desmarcar visíveis' + (removes.length ? ' (' + removes.length + ')' : ''));
    var status = state.busy ? 'Atualizando seleção…' : state.loading || !ready ? 'Carregando itens…' :
      total + (total === 1 ? ' item nesta página' : ' itens nesta página') + ' · ' + removes.length +
        (removes.length === 1 ? ' selecionado.' : ' selecionados.');
    text(state.status, state.notice ? state.notice + ' ' + status : status);
  }

  function apply(state, mode) {
    if (state.busy || state.loading || !nativeReady(state) || !visible(state.table)) return;
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
        var current = selected(state.type);
        // A callback nativa pode redesenhar/ocultar uma linha. Nunca inverta
        // novamente um item que já atingiu o estado solicitado.
        if (!current || !visible(button) || (mode === 'add') === current.has(id)) return;
        window.toggleBouquet(id, state.type, false);
        var after = selected(state.type);
        if (after && after.has(id) === (mode === 'add')) changed++;
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
    var status = document.createElement('span');
    status.className = 'text-muted small';
    status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite');
    var help = document.createElement('div');
    help.className = 'text-muted small mt-2';
    help.textContent = 'Respeita a busca, a categoria e a página atual. Salve a lista para gravar as alterações.';
    actions.appendChild(add); actions.appendChild(remove); actions.appendChild(status);
    box.appendChild(actions); box.appendChild(help);
    var target = table.closest('.dataTables_wrapper') || table;
    target.parentNode.insertBefore(box, target);
    var state = {table: table, type: definition.type, box: box, add: add, remove: remove,
      status: status, busy: false, loading: false, notice: ''};
    add.addEventListener('click', function (event) { event.preventDefault(); apply(state, 'add'); });
    remove.addEventListener('click', function (event) { event.preventDefault(); apply(state, 'remove'); });
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
      if (state) { state.loading = Boolean(processing); refresh(state); }
    });
    jq(document).on('shown.bs.tab.naxxBouquetSelection', schedule);
  }

  function enhance() {
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
    }
  }

  window.NaxxBouquetSelection = {enhance: enhance};
  enhance();
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', enhance, {once: true});
}());
