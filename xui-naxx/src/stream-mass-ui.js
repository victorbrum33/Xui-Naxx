/* Seleção explícita da edição em massa; o envio continua no formulário nativo. */
(function () {
  'use strict';
  var active = null, bound = false;

  function idOf(row) {
    var value = Array.isArray(row) ? String(row[0]) : '';
    return /^[1-9]\d*$/.test(value) && Number.isSafeInteger(Number(value)) ? value : null;
  }

  function selected() {
    if (!Array.isArray(window.rSelected)) return null;
    return window.rSelected;
  }

  function message(state, value) { state.status.textContent = value; }

  function sync(state) {
    var ids = selected();
    if (!ids) return;
    var chosen = new Set(ids.map(String));
    state.api.rows({page: 'current'}).every(function () {
      var node = this.node(), id = idOf(this.data());
      if (!node) return;
      ['selectedfilter', 'ui-selected', 'selected'].forEach(function (name) {
        node.classList.toggle(name, Boolean(id && chosen.has(id)));
      });
    });
    var count = document.getElementById('selected_count');
    if (count) count.textContent = ' — ' + ids.length + ' selecionados';
  }

  function cancel(state, announce) {
    if (!state.pending) return;
    state.pending.abort(); state.pending = null;
    state.cancel.hidden = true; state.all.disabled = false;
    if (announce) message(state, 'Seleção cancelada. Os canais já selecionados foram mantidos.');
  }

  function add(state, ids) {
    var current = selected();
    if (!current) throw new Error('selection_unavailable');
    var known = new Set(current.map(String));
    ids.forEach(function (id) {
      id = String(id);
      if (!known.has(id)) { current.push(id); known.add(id); }
    });
    sync(state);
  }

  function visible(state) {
    cancel(state, false);
    var ids = [];
    state.api.rows({page: 'current'}).every(function () {
      var node = this.node();
      if (!node || node.hidden || node.style.display === 'none') return;
      var id = idOf(this.data());
      if (id) ids.push(id);
    });
    add(state, ids);
    message(state, ids.length + ' canais visíveis selecionados.');
  }

  async function allFiltered(state) {
    cancel(state, false);
    if (!window.NaxxStreamSources || typeof window.NaxxStreamSources.filteredIds !== 'function') {
      message(state, 'Aguarde o carregamento da tabela e tente novamente.'); return;
    }
    var controller = new AbortController(); state.pending = controller;
    state.cancel.hidden = false; state.all.disabled = true;
    message(state, 'Buscando todos os canais dos filtros atuais…');
    try {
      var ids = await window.NaxxStreamSources.filteredIds(state.table, controller.signal);
      if (active !== state || state.pending !== controller || controller.signal.aborted || !state.table.isConnected) return;
      if (!Array.isArray(ids) || ids.some(function (id) { return !idOf([id]); })) throw new Error('invalid_ids');
      add(state, ids);
      message(state, ids.length + ' canais dos filtros atuais selecionados.');
    } catch (error) {
      if (active !== state || state.pending !== controller || controller.signal.aborted) return;
      message(state, error && error.message === 'catalog_limit' ?
        'A seleção aceita até 50.000 canais. Refine os filtros e tente novamente.' :
        'Não foi possível selecionar todos. Os canais já selecionados foram mantidos; aguarde a tabela e tente novamente.');
    } finally {
      if (state.pending === controller) { state.pending = null; state.cancel.hidden = true; state.all.disabled = false; }
    }
  }

  function selectable(state) {
    if (!state.jq.fn.selectable || !state.jq(state.table).data('ui-selectable')) return;
    state.jq(state.table).selectable('option', 'filter', 'tbody tr');
    state.jq(state.table).selectable('option', 'selected', state.selectRow);
  }

  function destroy(state) {
    cancel(state, false);
    window.clearTimeout(state.timer);
    state.jq(state.table).off('.naxxStreamMass');
    if (window.toggleStreams === state.toggle) window.toggleStreams = state.originalToggle;
    state.box.remove();
  }

  function button(box, name, label) {
    var node = document.createElement('button'); node.type = 'button';
    node.className = 'btn btn-light'; node.dataset.naxxMass = name; node.textContent = label;
    box.appendChild(node); return node;
  }

  function mount(table, jq, api) {
    var box = document.createElement('div'); box.className = 'naxx-stream-mass-selection';
    var visibleButton = button(box, 'visible', 'Selecionar visíveis');
    var all = button(box, 'all', 'Selecionar todos do filtro');
    var clear = button(box, 'clear', 'Limpar seleção');
    var stop = button(box, 'cancel', 'Cancelar seleção'); stop.hidden = true;
    var status = document.createElement('p'); status.className = 'text-muted mb-0'; status.setAttribute('role', 'status');
    box.appendChild(status); table.before(box);
    var state = {table: table, jq: jq, api: api, box: box, status: status, all: all, cancel: stop,
      pending: null, originalToggle: window.toggleStreams};
    active = state;
    state.toggle = function () { if (active === state && table.isConnected) visible(state); };
    window.toggleStreams = state.toggle;
    state.selectRow = function (_event, ui) {
      if (active !== state || !table.isConnected) return;
      var id = idOf(api.row(ui.selected).data()), ids = selected();
      if (!id || !ids) return;
      cancel(state, false);
      var index = ids.map(String).indexOf(id);
      if (index < 0) ids.push(id); else ids.splice(index, 1);
      sync(state);
    };
    visibleButton.addEventListener('click', function () { visible(state); });
    all.addEventListener('click', function () { allFiltered(state); });
    clear.addEventListener('click', function () {
      cancel(state, false); var ids = selected(); if (ids) ids.splice(0, ids.length);
      sync(state); message(state, 'Seleção limpa.');
    });
    stop.addEventListener('click', function () { cancel(state, true); });
    jq(table).on('preXhr.dt.naxxStreamMass', function () { cancel(state, true); });
    jq(table).on('draw.dt.naxxStreamMass', function () { selectable(state); sync(state); });
    jq(table).on('destroy.dt.naxxStreamMass', function () { if (active === state) { destroy(state); active = null; } });
    // A página nativa cria selectable logo depois de inicializar o DataTables.
    state.timer = window.setTimeout(function () { if (active === state) selectable(state); }, 0);
    var nativeButton = document.querySelector('#stream-selection button[onclick*="toggleStreams"]');
    if (nativeButton) { nativeButton.title = 'Selecionar visíveis'; nativeButton.setAttribute('aria-label', 'Selecionar visíveis'); }
    selectable(state); sync(state);
  }

  function enhance() {
    var table = /\/stream_mass(?:\.php)?$/.test(window.location.pathname) ? document.getElementById('datatable-mass') : null;
    if (active && (active.table !== table || !table || !table.isConnected)) { destroy(active); active = null; }
    var jq = window.jQuery;
    if (!jq || !jq.fn || !jq.fn.dataTable) return;
    if (!bound) {
      bound = true;
      jq(document).on('init.dt.naxxStreamMass', '#datatable-mass', enhance);
    }
    if (!table || !jq.fn.dataTable.isDataTable(table) || !selected()) return;
    if (active) { selectable(active); sync(active); return; }
    mount(table, jq, jq(table).DataTable());
  }

  window.NaxxStreamMass = {enhance: enhance};
  enhance();
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', enhance, {once: true});
}());
