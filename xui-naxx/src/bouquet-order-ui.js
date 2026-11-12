/* Editor de ordem: o formulário e o salvamento continuam sendo os nativos. */
(function () {
  'use strict';
  if (window.NaxxBouquetOrder) { window.NaxxBouquetOrder.enhance(); return; }

  var definitions = [
    {type: 'stream', panel: 'bouquet-stream', label: 'Canais'},
    {type: 'movie', panel: 'bouquet-movie', label: 'Filmes'},
    {type: 'series', panel: 'bouquet-series', label: 'Séries'},
    {type: 'radio', panel: 'bouquet-stations', label: 'Rádio'}
  ];
  var pageSize = 100;
  var historyLimit = 10;
  var collator = new Intl.Collator('pt-BR', {numeric: true, sensitivity: 'base'});
  var formatter = new Intl.NumberFormat('pt-BR');
  var active = null;
  var observer = null;
  var pending = null;

  function isOrderPage() { return /\/bouquet_sort(?:\.php)?$/.test(window.location.pathname); }
  function count(value) { return formatter.format(value); }
  function normalize(value) { return String(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR'); }
  function equal(a, b) {
    if (a.length !== b.length) return false;
    for (var i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
    return true;
  }
  function element(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }
  function button(text, action, className) {
    var node = element('button', 'naxx-order-button' + (className ? ' ' + className : ''), text);
    node.type = 'button';
    node.setAttribute('data-order-action', action);
    return node;
  }
  function readState(definition, form) {
    var panel = document.getElementById(definition.panel);
    var left = document.getElementById('sort_' + definition.type + '_l');
    var right = document.getElementById('sort_' + definition.type + '_r');
    if (!panel || !left || !right || left.form !== form || right.form !== form || !panel.contains(left) || !panel.contains(right)) return null;
    var leftOptions = Array.from(left.options), rightOptions = Array.from(right.options);
    if (leftOptions.length !== rightOptions.length) return null;
    var entries = [];
    for (var i = 0; i < leftOptions.length; i++) {
      var option = leftOptions[i], mirror = rightOptions[i];
      if (option.value !== mirror.value || option.text !== mirror.text) return null;
      var name = option.text.trim() || 'Sem nome' + (option.value ? ' · ID ' + option.value : '');
      entries.push({key: i, value: option.value, text: option.text, name: name,
        search: normalize(name + ' ' + option.value), left: option, right: mirror});
    }
    var order = entries.map(function (entry) { return entry.key; });
    return {definition: definition, panel: panel, left: left, right: right, entries: entries,
      order: order, nativeOrder: order.slice(), initial: order.slice(), selected: new Set(),
      undo: [], redo: [], query: '', page: 0, matches: null, changed: 0, dragKeys: null};
  }
  function matches(state) {
    if (state.matches) return state.matches;
    state.matches = [];
    state.order.forEach(function (key, index) {
      if (!state.query || state.entries[key].search.includes(state.query)) state.matches.push({key: key, index: index});
    });
    return state.matches;
  }
  function refreshFilter(state) {
    window.clearTimeout(state.searchTimer);
    var query = normalize(state.search.value.trim());
    if (query === state.query) return;
    state.query = query; state.page = 0; state.matches = null; render(state, true);
  }
  function announce(state, text) { state.notice.textContent = text; }
  function isSaving(editor) {
    // The native failure callback enables submit buttons. Respect that unlock,
    // including when the user retries before the attribute observer has run.
    if (editor.submitting && !editor.save.disabled) {
      editor.submitting = false;
      editor.form.removeAttribute('aria-busy');
    }
    return Boolean(editor.submitting);
  }
  function updateGlobal(editor) {
    var types = editor.states.filter(function (state) { return state.changed > 0; });
    var changed = editor.states.reduce(function (total, state) { return total + state.changed; }, 0);
    editor.pending.textContent = changed ? count(changed) + ' posições alteradas em ' + count(types.length) +
      (types.length === 1 ? ' tipo de conteúdo. Salve para aplicar.' : ' tipos de conteúdo. Salve para aplicar.') : 'Nenhuma alteração pendente.';
    if (!isSaving(editor)) editor.save.disabled = !changed;
    editor.footer.setAttribute('data-pending', changed ? 'true' : 'false');
  }
  function updateControls(state) {
    var selected = state.selected.size;
    var first = -1, last = -1;
    state.order.forEach(function (key, index) { if (state.selected.has(key)) { if (first < 0) first = index; last = index; } });
    ['up', 'top'].forEach(function (action) { state.buttons[action].disabled = !selected || first === 0 && last === selected - 1; });
    ['down', 'bottom'].forEach(function (action) { state.buttons[action].disabled = !selected || first === state.order.length - selected && last === state.order.length - 1; });
    state.buttons.move.disabled = !selected || selected === state.order.length;
    state.position.disabled = !selected || selected === state.order.length;
    state.position.max = String(Math.max(1, state.order.length));
    state.buttons.clear.disabled = !selected;
    state.buttons.select.disabled = !matches(state).some(function (match) { return !state.selected.has(match.key); });
    state.buttons.az.disabled = matches(state).length < 2;
    state.buttons.za.disabled = matches(state).length < 2;
    state.buttons.undo.disabled = !state.undo.length;
    state.buttons.redo.disabled = !state.redo.length;
    state.buttons.restore.disabled = !state.changed;
    state.summary.textContent = count(matches(state).length) + ' resultados de ' + count(state.order.length) + ' itens · ' + count(selected) + ' marcados';
    updateGlobal(state.editor);
  }
  function render(state, resetScroll) {
    var scrollTop = resetScroll ? 0 : state.list.scrollTop;
    var focused = document.activeElement;
    var focusedRow = focused && state.list.contains(focused) && focused.closest('[data-order-key]');
    var focusKey = focusedRow && focusedRow.getAttribute('data-order-key');
    var focusSelector = focused && focused.matches('input[type="checkbox"]') ? 'input[type="checkbox"]' : '.naxx-order-handle';
    var found = matches(state);
    var pages = Math.max(1, Math.ceil(found.length / pageSize));
    state.page = Math.min(state.page, pages - 1);
    if (!resetScroll && focusedRow) {
      var focusIndex = found.findIndex(function (match) { return match.key === Number(focusKey); });
      var focusPage = Math.floor(focusIndex / pageSize);
      if (focusIndex >= 0 && focusPage !== state.page) { state.page = focusPage; scrollTop = 0; }
    }
    var start = state.page * pageSize;
    var fragment = document.createDocumentFragment();
    found.slice(start, start + pageSize).forEach(function (match) {
      var entry = state.entries[match.key];
      var row = element('li', 'naxx-order-item' + (state.selected.has(match.key) ? ' is-selected' : ''));
      row.setAttribute('data-order-key', String(match.key));
      if (match.index !== match.key) row.classList.add('is-moved');
      var handle = button('⠿', 'drag', 'naxx-order-handle');
      handle.draggable = true;
      handle.setAttribute('aria-label', 'Arrastar ' + entry.name + '. Alt + seta para cima ou para baixo também move.');
      handle.title = 'Arraste para outra posição ou use Alt + ↑ / ↓';
      var label = element('label', 'naxx-order-item-label');
      var check = element('input'); check.type = 'checkbox'; check.checked = state.selected.has(match.key);
      check.setAttribute('aria-label', 'Marcar ' + entry.name + ', posição ' + count(match.index + 1));
      var position = element('span', 'naxx-order-position', count(match.index + 1));
      position.setAttribute('aria-label', 'Posição ' + count(match.index + 1));
      var name = element('span', 'naxx-order-name', entry.name); name.title = entry.name;
      label.append(check, position, name); row.append(handle, label); fragment.appendChild(row);
    });
    state.list.replaceChildren(fragment);
    if (focusKey !== null && focusKey !== false) {
      var restored = state.list.querySelector('[data-order-key="' + focusKey + '"] ' + focusSelector);
      if (restored) restored.focus({preventScroll: true});
    }
    state.list.scrollTop = scrollTop;
    state.empty.hidden = found.length > 0;
    state.empty.textContent = state.order.length ? 'Nenhum resultado. Tente outro nome ou ID.' : 'Nenhum item neste tipo de conteúdo.';
    state.buttons.previous.disabled = state.page === 0;
    state.buttons.next.disabled = state.page >= pages - 1;
    state.pageLabel.textContent = 'Página ' + count(state.page + 1) + ' de ' + count(pages) +
      (found.length ? ' · resultados ' + count(start + 1) + '–' + count(Math.min(start + pageSize, found.length)) : '');
    updateControls(state);
  }
  function apply(state, next, message) {
    if (equal(next, state.order)) { announce(state, 'A ordem já está nessa posição.'); return false; }
    state.undo.push(state.order.slice());
    if (state.undo.length > historyLimit) state.undo.shift();
    state.redo = [];
    state.order = next; state.matches = null;
    state.changed = next.reduce(function (total, key, index) { return total + (key !== state.initial[index] ? 1 : 0); }, 0);
    render(state); announce(state, message + ' Salve para aplicar.'); return true;
  }
  function selectedKeys(state) { return state.order.filter(function (key) { return state.selected.has(key); }); }
  function move(state, action, position, keys) {
    var moving = new Set(keys || selectedKeys(state));
    if (!moving.size) return;
    var next = state.order.slice(), i, temporary;
    if (action === 'up') {
      for (i = 1; i < next.length; i++) if (moving.has(next[i]) && !moving.has(next[i - 1])) {
        temporary = next[i - 1]; next[i - 1] = next[i]; next[i] = temporary;
      }
    } else if (action === 'down') {
      for (i = next.length - 2; i >= 0; i--) if (moving.has(next[i]) && !moving.has(next[i + 1])) {
        temporary = next[i + 1]; next[i + 1] = next[i]; next[i] = temporary;
      }
    } else {
      var block = next.filter(function (key) { return moving.has(key); });
      var rest = next.filter(function (key) { return !moving.has(key); });
      var target = action === 'top' ? 0 : action === 'bottom' ? rest.length : Math.max(0, Math.min(rest.length, position - 1));
      next = rest.slice(0, target).concat(block, rest.slice(target));
    }
    apply(state, next, count(moving.size) + (moving.size === 1 ? ' item movido.' : ' itens movidos.'));
  }
  function sortResults(state, descending) {
    var found = matches(state);
    var keys = found.map(function (match) { return match.key; });
    keys.sort(function (a, b) { return collator.compare(state.entries[a].name, state.entries[b].name) * (descending ? -1 : 1); });
    var next = state.order.slice();
    found.forEach(function (match, index) { next[match.index] = keys[index]; });
    apply(state, next, 'Resultados ordenados de ' + (descending ? 'Z a A.' : 'A a Z.'));
  }
  function history(state, redo) {
    var source = redo ? state.redo : state.undo, destination = redo ? state.undo : state.redo;
    if (!source.length) return;
    destination.push(state.order.slice());
    if (destination.length > historyLimit) destination.shift();
    state.order = source.pop(); state.matches = null;
    state.changed = state.order.reduce(function (total, key, index) { return total + (key !== state.initial[index] ? 1 : 0); }, 0);
    render(state); announce(state, redo ? 'Alteração refeita.' : 'Alteração desfeita.');
  }
  function build(state, editor) {
    state.editor = editor;
    var wrapper = element('section', 'naxx-content-order');
    wrapper.setAttribute('aria-label', 'Ordenar ' + state.definition.label);
    var head = element('div', 'naxx-order-section-head');
    head.appendChild(element('h3', '', state.definition.label));
    state.summary = element('p', 'naxx-order-summary'); head.appendChild(state.summary); wrapper.appendChild(head);
    var searchLabel = element('label', 'naxx-order-search');
    searchLabel.appendChild(element('span', '', 'Buscar por nome ou ID'));
    state.search = element('input'); state.search.type = 'search'; state.search.placeholder = 'Digite para encontrar um item…';
    state.search.autocomplete = 'off'; searchLabel.appendChild(state.search); wrapper.appendChild(searchLabel);
    var toolbar = element('div', 'naxx-order-toolbar'); state.buttons = {};
    function add(target, action, text, className) { var node = button(text, action, className); state.buttons[action] = node; target.appendChild(node); return node; }
    add(toolbar, 'select', 'Marcar resultados'); add(toolbar, 'clear', 'Limpar marcações');
    var sorts = element('div', 'naxx-order-button-group');
    add(sorts, 'az', 'Ordenar resultados A–Z'); add(sorts, 'za', 'Z–A'); toolbar.appendChild(sorts); wrapper.appendChild(toolbar);
    var moves = element('div', 'naxx-order-moves');
    moves.appendChild(element('span', 'naxx-order-moves-label', 'Mover marcados'));
    var directions = element('div', 'naxx-order-button-group');
    add(directions, 'up', '↑ Subir'); add(directions, 'down', '↓ Descer'); add(directions, 'top', '⇈ Início'); add(directions, 'bottom', '⇊ Fim'); moves.appendChild(directions);
    var moveTo = element('div', 'naxx-order-move-to');
    var positionLabel = element('label', '', 'Para a posição');
    state.position = element('input'); state.position.type = 'text'; state.position.inputMode = 'numeric'; state.position.value = '1';
    state.position.setAttribute('data-order-position', '');
    state.position.setAttribute('aria-label', 'Posição do primeiro item marcado na lista completa');
    positionLabel.appendChild(state.position); moveTo.appendChild(positionLabel); add(moveTo, 'move', 'Mover'); moves.appendChild(moveTo); wrapper.appendChild(moves);
    wrapper.appendChild(element('p', 'naxx-order-help', 'As posições pertencem à lista completa. A busca só oculta itens; ordenar A–Z reorganiza os resultados nas posições que já ocupam. Arraste pela alça ⠿ ou marque itens para movê-los juntos.'));
    var listHead = element('div', 'naxx-order-list-head'); listHead.append(element('span', '', 'POSIÇÃO'), element('span', '', 'NOME DO CONTEÚDO')); wrapper.appendChild(listHead);
    state.list = element('ol', 'naxx-order-list'); state.list.setAttribute('aria-label', 'Ordem de ' + state.definition.label); wrapper.appendChild(state.list);
    state.empty = element('p', 'naxx-order-empty'); wrapper.appendChild(state.empty);
    var pager = element('div', 'naxx-order-pagination'); add(pager, 'previous', '← Anterior');
    state.pageLabel = element('span', 'naxx-order-page-label'); pager.appendChild(state.pageLabel); add(pager, 'next', 'Próxima →'); wrapper.appendChild(pager);
    var historyBar = element('div', 'naxx-order-history'); add(historyBar, 'undo', 'Desfazer'); add(historyBar, 'redo', 'Refazer'); add(historyBar, 'restore', 'Restaurar ordem inicial'); wrapper.appendChild(historyBar);
    state.notice = element('p', 'naxx-order-notice'); state.notice.setAttribute('role', 'status'); state.notice.setAttribute('aria-live', 'polite'); wrapper.appendChild(state.notice);
    // Hide only this panel's original visible controls. Keep the native selects,
    // hidden fields, form and backend handler intact.
    Array.from(state.panel.children).forEach(function (child) { child.classList.add('naxx-order-native'); });
    state.panel.appendChild(wrapper); state.wrapper = wrapper;
    wrapper.addEventListener('click', function (event) {
      if (!isSaving(editor)) return;
      event.preventDefault(); event.stopImmediatePropagation(); announce(state, 'Salvamento em andamento. Aguarde a resposta.');
    }, true);
    state.search.addEventListener('input', function () {
      if (isSaving(editor)) return;
      window.clearTimeout(state.searchTimer);
      state.searchTimer = window.setTimeout(function () { refreshFilter(state); }, 100);
    });
    wrapper.addEventListener('keydown', function (event) {
      if (isSaving(editor)) { event.preventDefault(); return; }
      if (event.key !== 'Enter' || !event.target.matches('input[type="search"], [data-order-position]')) return;
      event.preventDefault();
      refreshFilter(state);
      if (event.target === state.position && !state.buttons.move.disabled) state.buttons.move.click();
    });
    wrapper.addEventListener('click', function (event) {
      var control = event.target.closest('[data-order-action]');
      if (!control || !wrapper.contains(control) || control.disabled) return;
      var action = control.getAttribute('data-order-action');
      refreshFilter(state);
      if (action === 'select') { matches(state).forEach(function (match) { state.selected.add(match.key); }); render(state); }
      else if (action === 'clear') { state.selected.clear(); render(state); }
      else if (action === 'az' || action === 'za') sortResults(state, action === 'za');
      else if (action === 'undo' || action === 'redo') history(state, action === 'redo');
      else if (action === 'restore') apply(state, state.initial.slice(), 'Ordem inicial restaurada.');
      else if (action === 'previous' || action === 'next') { state.page += action === 'next' ? 1 : -1; render(state, true); }
      else if (action === 'move') {
        var destination = Number(state.position.value);
        if (!Number.isSafeInteger(destination) || destination < 1 || destination > state.order.length) {
          announce(state, 'Informe uma posição de 1 a ' + count(state.order.length) + '.'); state.position.focus(); return;
        }
        move(state, action, destination);
      } else if (['up', 'down', 'top', 'bottom'].includes(action)) move(state, action);
    });
    state.list.addEventListener('change', function (event) {
      if (!event.target.matches('input[type="checkbox"]')) return;
      var row = event.target.closest('[data-order-key]'), key = Number(row.getAttribute('data-order-key'));
      if (isSaving(editor)) { event.target.checked = state.selected.has(key); return; }
      if (event.target.checked) state.selected.add(key); else state.selected.delete(key);
      row.classList.toggle('is-selected', event.target.checked); updateControls(state);
    });
    state.list.addEventListener('keydown', function (event) {
      if (isSaving(editor)) { event.preventDefault(); return; }
      if (!event.altKey || !['ArrowUp', 'ArrowDown'].includes(event.key)) return;
      var row = event.target.closest('[data-order-key]'); if (!row) return;
      event.preventDefault(); var key = Number(row.getAttribute('data-order-key'));
      move(state, event.key === 'ArrowUp' ? 'up' : 'down', null, state.selected.has(key) ? selectedKeys(state) : [key]);
      var handle = state.list.querySelector('[data-order-key="' + key + '"] .naxx-order-handle'); if (handle) handle.focus({preventScroll: true});
    });
    state.list.addEventListener('dragstart', function (event) {
      if (isSaving(editor)) { event.preventDefault(); return; }
      var handle = event.target.closest('.naxx-order-handle'); if (!handle) { event.preventDefault(); return; }
      var key = Number(handle.closest('[data-order-key]').getAttribute('data-order-key'));
      state.dragKeys = state.selected.has(key) ? selectedKeys(state) : [key];
      if (event.dataTransfer) { event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('text/plain', 'naxx-order:' + state.definition.type + ':' + key); }
    });
    state.list.addEventListener('dragover', function (event) {
      if (isSaving(editor)) return;
      var row = event.target.closest('[data-order-key]');
      if (!state.dragKeys || !row) return;
      event.preventDefault(); if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
      state.list.querySelectorAll('.is-drop-target').forEach(function (item) { item.classList.remove('is-drop-target'); }); row.classList.add('is-drop-target');
    });
    state.list.addEventListener('drop', function (event) {
      if (isSaving(editor)) { event.preventDefault(); state.dragKeys = null; return; }
      var row = event.target.closest('[data-order-key]'); if (!state.dragKeys || !row) return;
      event.preventDefault(); var key = Number(row.getAttribute('data-order-key')), keys = state.dragKeys; state.dragKeys = null;
      if (keys.includes(key)) { render(state); return; }
      var index = state.order.indexOf(key), moving = new Set(keys), before = 0;
      for (var i = 0; i < index; i++) if (moving.has(state.order[i])) before++;
      move(state, 'move', index - before + 1, keys);
    });
    state.list.addEventListener('dragend', function () { state.dragKeys = null; state.list.querySelectorAll('.is-drop-target').forEach(function (item) { item.classList.remove('is-drop-target'); }); });
    render(state);
  }
  function valid(state) {
    var form = state.editor.form;
    if (!form.isConnected || !state.panel.isConnected || document.getElementById(state.definition.panel) !== state.panel ||
        !state.left.isConnected || !state.right.isConnected ||
        document.getElementById('sort_' + state.definition.type + '_l') !== state.left ||
        document.getElementById('sort_' + state.definition.type + '_r') !== state.right ||
        state.left.form !== form || state.right.form !== form || !form.contains(state.panel) ||
        !state.panel.contains(state.left) || !state.panel.contains(state.right)) return false;
    if (state.order.length !== state.entries.length || new Set(state.order).size !== state.entries.length) return false;
    var left = state.left.options, right = state.right.options;
    if (left.length !== state.entries.length || right.length !== state.entries.length) return false;
    for (var i = 0; i < state.order.length; i++) {
      var key = state.order[i], native = state.entries[state.nativeOrder[i]];
      if (!Number.isInteger(key) || !state.entries[key] || !native || left[i] !== native.left || right[i] !== native.right ||
          native.left.value !== native.value || native.right.value !== native.value || native.left.text !== native.text || native.right.text !== native.text) return false;
    }
    return true;
  }
  function sync(state) {
    if (equal(state.order, state.nativeOrder)) return;
    var left = document.createDocumentFragment(), right = document.createDocumentFragment();
    state.order.forEach(function (key) { left.appendChild(state.entries[key].left); right.appendChild(state.entries[key].right); });
    state.left.appendChild(left); state.right.appendChild(right); state.nativeOrder = state.order.slice();
  }
  function enhance() {
    if (!isOrderPage()) return false;
    if (active && active.form.isConnected) return true;
    var field = document.getElementById('stream_order_array'), form = field && field.form;
    if (!form || !form.querySelector('input[name="reorder"]')) return false;
    var states = definitions.map(function (definition) { return readState(definition, form); });
    if (states.some(function (state) { return !state; })) return false;
    if (active && active.lockObserver) active.lockObserver.disconnect();
    var editor = {form: form, field: field, states: states, submitting: false};
    var intro = element('header', 'naxx-content-order naxx-order-intro');
    intro.appendChild(element('span', 'naxx-order-eyebrow', 'ORDEM DO CONTEÚDO'));
    intro.appendChild(element('h2', '', 'Ordenar conteúdos'));
    intro.appendChild(element('p', '', 'Uma lista por tipo de conteúdo. Encontre, marque e mova os itens para definir como serão exibidos.'));
    form.insertBefore(intro, form.firstChild);
    editor.footer = element('div', 'naxx-content-order naxx-order-savebar');
    var saveText = element('div'); saveText.appendChild(element('strong', '', 'Salve para aplicar a nova ordem'));
    editor.pending = element('p'); saveText.appendChild(editor.pending); editor.footer.appendChild(saveText);
    editor.save = element('button', 'naxx-order-save', 'Salvar alterações'); editor.save.type = 'submit';
    // Position is an auxiliary editor input, not a backend field. Its manual
    // Move validation must never prevent saving an otherwise valid draft.
    editor.save.formNoValidate = true; editor.footer.appendChild(editor.save);
    editor.lockObserver = new MutationObserver(function () { isSaving(editor); });
    editor.lockObserver.observe(editor.save, {attributes: true, attributeFilter: ['disabled']});
    form.appendChild(editor.footer);
    states.forEach(function (state) { build(state, editor); });
    states.forEach(function (state) {
      var tab = form.querySelector('a[href="#' + state.definition.panel + '"]');
      if (tab) {
        var span = tab.querySelector('span'); if (span) span.textContent = state.definition.label;
        tab.setAttribute('aria-label', state.definition.label); tab.classList.add('naxx-order-tab');
      }
    });
    form.classList.add('naxx-order-form');
    // Capture runs before the existing jQuery submit handler. Nothing is written
    // to the native selects or payload until the user explicitly submits Save.
    form.addEventListener('submit', function (event) {
      if (isSaving(editor)) { event.preventDefault(); event.stopImmediatePropagation(); return; }
      if (!isOrderPage() || document.getElementById('stream_order_array') !== field || field.form !== form || !states.every(valid)) {
        event.preventDefault(); event.stopImmediatePropagation();
        editor.pending.textContent = 'Não foi possível validar a ordem. Recarregue a página antes de salvar.';
        editor.pending.setAttribute('role', 'alert'); return;
      }
      try {
        states.forEach(sync);
        var order = {stream: [], movie: [], radio: [], series: []};
        states.forEach(function (state) { order[state.definition.type] = state.order.map(function (key) { return state.entries[key].value; }); });
        field.value = JSON.stringify(order);
        editor.submitting = true; editor.save.disabled = true; form.setAttribute('aria-busy', 'true');
      } catch (_error) {
        event.preventDefault(); event.stopImmediatePropagation();
        editor.pending.textContent = 'Não foi possível preparar a ordem para salvar. Recarregue a página e tente novamente.';
        editor.pending.setAttribute('role', 'alert');
      }
    }, true);
    active = editor;
    if (observer) { observer.disconnect(); observer = null; }
    return true;
  }
  function bootstrap() {
    if (!isOrderPage()) return;
    if (enhance() || observer || !document.body) return;
    observer = new MutationObserver(function () {
      if (pending) return;
      pending = window.setTimeout(function () { pending = null; enhance(); }, 50);
    });
    observer.observe(document.body, {childList: true, subtree: true});
  }
  window.NaxxBouquetOrder = {enhance: enhance};
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bootstrap, {once: true});
  else bootstrap();
})();
