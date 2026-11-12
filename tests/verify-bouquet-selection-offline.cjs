/* Exercita o contrato do editor nativo, sem HTTP, banco ou salvamento de lista. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../xui-naxx/src/bouquet-selection-ui.js'), 'utf8');

function fixture(pathname = '/admin/bouquet', options = {}) {
  const frames = [], observers = [], handlers = [], calls = [];
  let writes = 0, draws = 0, duringToggle = null, throwAt = null;
  const requests = [], migrations = [];
  let reviewInitialized = true, clearCalls = 0, removeCalls = 0, onRowsAdd = null, failDraw = false;
  function mutation(target, type, attributeName) {
    observers.forEach(observer => {
      if (!observer.target || !observer.target.contains(target)) return;
      if (type === 'attributes' && !observer.options.attributeFilter.includes(attributeName)) return;
      observer.callback([{target, type, attributeName}]);
    });
  }
  class Element {
    constructor(tag, id = '') {
      this.tagName = tag.toUpperCase(); this.id = id; this.children = []; this.parentNode = null;
      this.disabled = false; this.hidden = false; this.attributes = {}; this.events = {};
      this._text = ''; this._class = '';
      this.style = new Proxy({}, {set: (target, key, value) => {
        target[key] = value; mutation(this, 'attributes', 'style'); return true;
      }});
    }
    get isConnected() {return this === doc.body || Boolean(this.parentNode?.isConnected);}
    get className() {return this._class;}
    set className(value) {this._class = value; mutation(this, 'attributes', 'class');}
    get textContent() {return this._text;}
    set textContent(value) {this._text = value; writes++; mutation(this, 'childList');}
    setAttribute(key, value) {this.attributes[key] = String(value); mutation(this, 'attributes', key);}
    getAttribute(key) {return Object.hasOwn(this.attributes, key) ? this.attributes[key] : null;}
    appendChild(child) {child.remove(); this.children.push(child); child.parentNode = this; mutation(this, 'childList'); return child;}
    insertBefore(child, target) {
      child.remove(); const at = this.children.indexOf(target); assert(at >= 0);
      this.children.splice(at, 0, child); child.parentNode = this; mutation(this, 'childList');
    }
    remove() {
      if (!this.parentNode) return;
      const parent = this.parentNode; parent.children.splice(parent.children.indexOf(this), 1);
      this.parentNode = null; mutation(parent, 'childList');
    }
    contains(node) {for (let current = node; current; current = current.parentNode) if (current === this) return true; return false;}
    closest(selector) {
      for (let current = this; current; current = current.parentNode) {
        if (current.tagName.toLowerCase() === selector) return current;
        if (selector === '.dataTables_wrapper' && current.className.split(' ').includes('dataTables_wrapper')) return current;
      }
      return null;
    }
    getClientRects() {
      if (!this.isConnected) return [];
      for (let current = this; current; current = current.parentNode) {
        if (current.hidden || current.style.display === 'none' || current.style.visibility === 'hidden') return [];
      }
      return [{}];
    }
    querySelectorAll(selector) {
      const result = [];
      const selectors = selector.split(',').map(value => value.replace(/^tbody /, ''));
      function matches(child, rule) {
        if (rule.startsWith('#')) return child.id === rule.slice(1);
        if (!rule.startsWith('.')) return child.tagName.toLowerCase() === rule;
        const className = rule.match(/^\.([\w-]+)/)[1];
        return child.className.split(' ').includes(className) &&
          (!rule.includes('[data-id]') || child.getAttribute('data-id') !== null) &&
          (!rule.includes('[data-type]') || child.getAttribute('data-type') !== null);
      }
      const visit = node => {
        node.children.forEach(child => {
          if (selectors.some(rule => matches(child, rule))) result.push(child);
          visit(child);
        });
      };
      visit(this); return result;
    }
    querySelector(selector) {return this.querySelectorAll(selector)[0] || null;}
    addEventListener(type, listener) {this.events[type] = listener;}
    click() {
      if (this.disabled) return;
      const event = {target: this, stopped: false, preventDefault() {}, stopImmediatePropagation() {this.stopped = true;}};
      for (let parent = this.parentNode; parent; parent = parent.parentNode) {
        parent.events.click?.(event);
        if (event.stopped) return;
      }
      return this.events.click?.(event);
    }
  }
  const doc = {
    readyState: 'complete', body: null,
    createElement: tag => new Element(tag),
    addEventListener() {},
    getElementById(id) {
      let found = null;
      const visit = node => {if (node.id === id) found = node; node.children.forEach(visit);};
      visit(this.body); return found;
    }
  };
  doc.body = new Element('body');
  const form = doc.body.appendChild(new Element('form', 'bouquet_form'));
  const review = form.appendChild(new Element('table', 'datatable-review'));
  const definitions = [['datatable-stream', 'stream'], ['datatable-movies', 'movies'], ['datatable-series', 'series'], ['datatable-radios', 'radios']];
  const selections = {stream: [2, 11], movies: [900], series: [], radios: []};
  const queries = {stream: 'bouquets_streams', movies: 'bouquets_vod', series: 'bouquets_series', radios: 'bouquets_radios'};
  const categoryIds = {stream: 'category_id', movies: 'category_idv', series: 'category_ids', radios: 'category_idr'};
  const searchIds = {stream: 'stream_search', movies: 'vod_search', series: 'series_search', radios: 'radios_search'};
  const datasets = Object.assign({stream: [], movies: [], series: [], radios: []}, options.datasets);
  let reviewData = Object.entries(selections).flatMap(([type, ids]) => ids.map(id => {
    const data = [id, type[0].toUpperCase() + type.slice(1), 'Anterior ' + id, '<button>native</button>'];
    data.nodeId = type + '-' + id; return data;
  }));
  const originalDraw = () => {};
  let reviewConfig = {pageLength: 50, searching: true, language: {emptyTable: 'Nenhum'}, drawCallback: originalDraw};
  const reviewOrder = [[1, 'desc']], reviewSearch = 'anterior', columnSearches = ['', '', 'abc', ''];
  const pages = {};
  definitions.forEach(([id, type]) => {
    const category = form.appendChild(new Element('select', categoryIds[type])); category.value = '12';
    const search = form.appendChild(new Element('input', searchIds[type])); search.value = 'termo & ação';
    const pane = form.appendChild(new Element('div'));
    pane.style.display = type === 'stream' ? '' : 'none';
    const wrapper = pane.appendChild(new Element('div')); wrapper.className = 'dataTables_wrapper';
    const table = wrapper.appendChild(new Element('table', id));
    const body = table.appendChild(new Element('tbody'));
    const params = {id: queries[type], category_id: category.value, draw: '7', start: 50, length: 50,
      search: {value: search.value, regex: false}, order: [{column: 1, dir: 'desc'}],
      columns: [0, 1, 2, 3].map(data => ({data, name: '', searchable: true, orderable: true, search: {value: '', regex: false}}))};
    pages[type] = {pane, wrapper, table, body, rows: new Map(), params, url: './table', category, search, type};
  });
  function row(type, id, options = {}) {
    const page = pages[type]; const tr = page.body.appendChild(new Element('tr', type + '-' + id));
    tr.appendChild(new Element('td')).textContent = String(id);
    tr.appendChild(new Element('td')).textContent = options.name || 'Item ' + id;
    tr.appendChild(new Element('td')).textContent = 'Categoria';
    const td = tr.appendChild(new Element('td'));
    const buttons = {};
    for (const mode of ['add', 'remove']) {
      const button = td.appendChild(new Element('button')); button.className = 'btn-' + mode;
      button.setAttribute('data-id', id); button.setAttribute('data-type', options.type || type);
      button.style.display = selections[type].includes(Number(id)) === (mode === 'add') ? 'none' : '';
      buttons[mode] = button;
    }
    if (options.hidden) tr.style.display = 'none';
    if (options.disabled) {buttons.add.disabled = true; buttons.remove.disabled = true;}
    if (!page.rows.has(String(id))) page.rows.set(String(id), []);
    page.rows.get(String(id)).push({tr, ...buttons});
    return {tr, ...buttons};
  }
  function emit(name, table, processing) {
    handlers.filter(entry => entry.events.split(' ').some(event => event.split('.')[0] === name))
      .forEach(entry => entry.callback.call(table, {target: table}, {nTable: table}, processing));
  }
  const reviewApi = {
    init: () => reviewConfig,
    page: {info: () => ({length: 50, start: 0, recordsTotal: reviewData.length, recordsDisplay: reviewData.length})},
    order: () => reviewOrder,
    search: () => reviewSearch,
    columns: () => ({search: () => ({toArray: () => columnSearches})}),
    clear() {clearCalls++; reviewData = []; return this;},
    destroy(remove) {assert.equal(remove, false); reviewInitialized = false;},
    draw(reset) {
      assert.equal(reset, false); draws++;
      if (failDraw) {failDraw = false; throw new Error('draw failure');}
      emit('draw', review); return this;
    },
    rows: Object.assign(() => ({data: () => ({toArray: () => reviewData.slice()})}), {
      add(data) {reviewData.push(...data); if (onRowsAdd) onRowsAdd(data); return reviewApi;}
    }),
    row: Object.assign(selector => ({remove() {
      removeCalls++;
      const at = reviewData.findIndex(data => '#' + (data.DT_RowId || data.nodeId) === selector);
      if (at >= 0) reviewData.splice(at, 1);
      return reviewApi;
    }}), {
      add(data) {
        reviewData.push(data);
        return {node() {
          assert(!reviewConfig.deferRender, 'O addRow nativo não pode exigir nó após migração lazy.');
          return {set id(value) {data.nodeId = value;}};
        }};
      }
    })
  };
  function jq(node) {
    if (node === doc) return {on(events, selector, callback) {handlers.push({events, callback: callback || selector});}};
    if (node === review) return {DataTable(config) {
      if (config) {
        assert.equal(reviewInitialized, false); reviewInitialized = true;
        reviewConfig = config; reviewData = config.data.slice(); migrations.push(config);
      }
      return reviewApi;
    }};
    const page = Object.values(pages).find(page => page.table === node);
    assert(page, 'Só tabelas nativas são consultadas.');
    return {DataTable: () => ({ajax: {params: () => page.params, url: () => page.url},
      page: {info: () => ({recordsDisplay: datasets[page.type].length,
        recordsTotal: Object.values(datasets).reduce((total, data) => total + data.length, 0)})}})};
  }
  jq.fn = {dataTable: {isDataTable: node => node === review ? reviewInitialized : Object.values(pages).some(page => page.table === node)}};
  jq.ajax = request => {
    const captured = {url: request.url, type: request.type, data: JSON.parse(JSON.stringify(request.data))};
    requests.push(captured);
    let completed = false;
    const timer = setTimeout(() => {
      if (completed) return;
      completed = true;
      try {
        const type = Object.keys(queries).find(type => queries[type] === request.data.id);
        let response = {draw: String(request.data.draw), recordsFiltered: String(datasets[type].length),
          recordsTotal: String(Object.values(datasets).reduce((total, data) => total + data.length, 0)),
          data: datasets[type].slice(request.data.start, request.data.start + (options.cap || 1000))};
        if (options.respond) response = options.respond(captured, requests.length, response);
        request.success(response);
      } catch (error) {request.error({}, 'error', error);}
    }, options.delay || 0);
    return {abort() {if (!completed) {completed = true; clearTimeout(timer); request.error({}, 'abort');}}};
  };
  const win = {
    location: {pathname, href: 'https://painel.test' + pathname, origin: 'https://painel.test'}, rBouquet: selections, jQuery: jq,
    setTimeout,
    requestAnimationFrame(callback) {frames.push(callback); return frames.length;},
    getComputedStyle: element => ({display: element.style.display || 'block', visibility: element.style.visibility || 'visible'}),
    toggleBouquet(id, type, draw) {
      assert.equal(draw, false, 'O lote nunca pede redesenho por item.');
      calls.push([id, type]);
      if (throwAt === id) throw new Error('native failure');
      const current = selections[type]; const at = current.indexOf(id);
      if (at < 0) current.push(id); else current.splice(at, 1);
      if (at < 0) win.addRow(id, type); else win.delRow(id, type);
      for (const record of pages[type].rows.get(String(id)) || []) {
        record.add.style.display = current.includes(id) ? 'none' : '';
        record.remove.style.display = current.includes(id) ? '' : 'none';
      }
      if (duringToggle) duringToggle();
    }
  };
  win.addRow = (id, type) => {reviewApi.row.add([id, type[0].toUpperCase() + type.slice(1), 'Item ' + id, 'native']).node().id = type + '-' + id;};
  win.delRow = (id, type) => reviewApi.row('#' + type + '-' + id).remove();
  class Observer {
    constructor(callback) {this.callback = callback; observers.push(this);}
    observe(target, options) {this.target = target; this.options = options;}
    disconnect() {this.target = null;}
  }
  row('stream', 1); row('stream', 2); row('stream', 3); row('stream', 4, {hidden: true});
  row('stream', 1); // Duplicate rendering must not toggle the same ID twice.
  row('stream', 'bad'); row('stream', 0); row('stream', 5, {type: 'movies'}); row('stream', 6, {disabled: true});
  row('movies', 900); row('movies', 901); row('series', 700); row('radios', 800);
  vm.runInNewContext(source, {window: win, document: doc, MutationObserver: Observer, URL});
  function flush() {
    let count = 0;
    while (frames.length) {assert(++count < 25, 'O observer não deve agendar frames sem fim.'); frames.shift()();}
  }
  function toolbar(type) {
    const box = pages[type].pane.children.find(child => child.className.includes('naxx-bouquet-selection'));
    if (!box) return null;
    const [add, remove, status, all, cancel] = box.children[0].children;
    return {box, add, remove, status, all, cancel};
  }
  flush();
  return {win, doc, form, pages, selections, calls, row, emit, flush, toolbar,
    draws: () => draws, writes: () => writes,
    reenter: callback => {duringToggle = callback;}, fail: id => {throwAt = id;}, requests, migrations,
    reviewData: () => reviewData, originalDraw, reviewOrder, reviewSearch, columnSearches,
    clearCalls: () => clearCalls, removeCalls: () => removeCalls,
    onRowsAdd: callback => {onRowsAdd = callback;}, failNextDraw: () => {failDraw = true;},
    bindings: () => handlers.length};
}

const f = fixture();
const controls = f.toolbar('stream');
assert.equal(controls.add.type, 'button');
assert.equal(controls.remove.type, 'button');
assert.equal(controls.status.getAttribute('role'), 'status');
assert.equal(controls.status.getAttribute('aria-live'), 'polite');
assert.match(controls.add.textContent, /\(2\)/);
assert.match(controls.status.textContent, /3 itens nesta página · 1 selecionado/);
assert(f.toolbar('movies').add.disabled, 'A aba oculta nunca oferece seleção.');

// A seleção mista acrescenta só os dois itens ausentes, ignorando duplicação,
// linhas filtradas, IDs inválidos, tipos divergentes, botões desabilitados e outras abas.
f.reenter(() => controls.add.events.click({preventDefault() {}}));
controls.add.click(); f.flush();
assert.deepEqual(f.calls, [[1, 'stream'], [3, 'stream']]);
assert.deepEqual(f.selections.stream, [2, 11, 1, 3]);
assert.deepEqual(f.selections.movies, [900]);
assert.equal(f.draws(), 1);
assert.match(controls.status.textContent, /2 itens selecionados/);
controls.add.events.click({preventDefault() {}}); f.flush();
assert.equal(f.calls.length, 2, 'Duplo clique não inverte nem duplica seleções.');
assert.equal(f.draws(), 1);

controls.remove.click(); f.flush();
assert.deepEqual(f.selections.stream, [11], 'Limpar visíveis preserva o item de outra página.');
assert.equal(f.draws(), 2);
assert.match(controls.status.textContent, /3 itens desmarcados/);

// O redraw substitui apenas a página mostrada. O lote seguinte usa o novo tbody.
const page = f.pages.stream;
for (const child of [...page.body.children]) child.remove();
f.row('stream', 11); f.row('stream', 12); f.emit('draw', page.table); f.flush();
f.emit('processing', page.table, true);
assert(controls.add.disabled && controls.remove.disabled, 'Durante busca/categoria em andamento nenhum lote é permitido.');
controls.add.events.click({preventDefault() {}});
assert.equal(f.calls.length, 5);
f.emit('draw', page.table); f.flush();
controls.add.click(); f.flush();
assert.deepEqual(f.calls.at(-1), [12, 'stream']);
assert.deepEqual(f.selections.stream, [11, 12]);
assert.match(controls.status.textContent, /1 item selecionado\./);

// Trocar de aba não seleciona a página anterior e mantém o namespace de cada tipo.
page.pane.style.display = 'none'; f.pages.movies.pane.style.display = '';
f.emit('shown', f.pages.movies.table); f.flush();
assert(controls.add.disabled && controls.remove.disabled);
f.toolbar('movies').add.click(); f.flush();
assert.deepEqual(f.selections.movies, [900, 901]);
assert.deepEqual(f.selections.stream, [11, 12]);
assert.equal(f.calls.at(-1)[1], 'movies');

for (const child of [...f.pages.movies.body.children]) child.remove();
f.emit('draw', f.pages.movies.table); f.flush();
assert(f.toolbar('movies').add.disabled && f.toolbar('movies').remove.disabled);
assert.match(f.toolbar('movies').status.textContent, /0 itens nesta página/);
const writesBefore = f.writes(); f.win.NaxxBouquetSelection.enhance(); f.flush();
assert.equal(f.writes(), writesBefore, 'Atualização sem mudanças não reescreve textos do próprio observer.');
assert.equal(f.pages.movies.pane.children.filter(child => child.className.includes('naxx-bouquet-selection')).length, 1);

const failed = fixture(); failed.fail(3);
failed.toolbar('stream').add.click(); failed.flush();
assert.deepEqual(failed.selections.stream, [2, 11, 1]);
assert.equal(failed.draws(), 1, 'Mesmo com falha, a parte aplicada é desenhada uma única vez para revisão.');
assert.match(failed.toolbar('stream').status.textContent, /parcialmente atualizada/);
assert(failed.toolbar('stream').remove.disabled === false, 'Uma falha não deixa os controles presos.');

const otherPage = fixture('/admin/bouquets');
assert.equal(typeof otherPage.win.NaxxBouquetSelection.enhance, 'function', 'A API fica disponível para a navegação seamless.');
assert.equal(otherPage.toolbar('stream'), null);
assert.equal(otherPage.bindings(), 0, 'Outra rota não instala UI nem bindings do editor.');
otherPage.win.NaxxBouquetSelection.enhance(); otherPage.flush();
assert.equal(otherPage.toolbar('stream'), null);
assert.equal(otherPage.bindings(), 0);
otherPage.win.location.pathname = '/admin/bouquet';
otherPage.win.NaxxBouquetSelection.enhance(); otherPage.flush();
assert(otherPage.toolbar('stream'), 'Navegar para o editor sem recarregar inicializa os controles.');
assert(otherPage.bindings() > 0);
const spaBindings = otherPage.bindings();
otherPage.win.NaxxBouquetSelection.enhance(); otherPage.flush();
assert.equal(otherPage.bindings(), spaBindings, 'Reinicialização do editor não duplica bindings.');
assert.equal(otherPage.pages.stream.pane.children.filter(child => child.className.includes('naxx-bouquet-selection')).length, 1);
otherPage.win.location.pathname = '/admin/streams';
otherPage.win.NaxxBouquetSelection.enhance(); otherPage.flush();
assert.equal(otherPage.toolbar('stream'), null, 'Sair da rota remove os controles do editor.');
function records(ids, name = id => 'Resultado ' + id) {
  return ids.map(id => [String(id), name(id), 'Categoria', '<a href="https://fonte-invalida.test/video">ignorar</a>']);
}

function draft(test) {
  return JSON.stringify({selection: test.selections, review: test.reviewData()});
}

async function allTests() {
  for (const [type, ids, endpoint] of [
    ['stream', [1, 2, 8], 'bouquets_streams'], ['movies', [901, 902, 903], 'bouquets_vod'],
    ['series', [701, 702, 703], 'bouquets_series'], ['radios', [801, 802, 803], 'bouquets_radios']
  ]) {
    const test = fixture('/admin/bouquet', {datasets: {[type]: records(ids, id => id === ids[0] ? '<img src=x onerror="alert(1)"> & Nome' : 'Nome ' + id)}, cap: 2});
    test.pages.stream.pane.style.display = 'none'; test.pages[type].pane.style.display = '';
    test.flush();
    const toolbar = test.toolbar(type), initialParams = JSON.stringify(test.pages[type].params);
    assert.match(toolbar.all.textContent, /Selecionar tudo \(3\)/);
    const operation = toolbar.all.click();
    assert(test.pages[type].category.disabled && toolbar.add.disabled && toolbar.all.disabled);
    assert.equal(toolbar.cancel.hidden, false); assert.equal(toolbar.cancel.disabled, false);
    await toolbar.all.events.click({preventDefault() {}});
    assert.equal(test.requests.length, 1, 'Duplo clique não inicia outro lote.');
    await operation; test.flush();
    assert.deepEqual(test.requests.map(request => request.data.start), [0, 2], 'Avança pelo tamanho real da página, inclusive quando o servidor limita length.');
    for (const request of test.requests) {
      assert.equal(request.type, 'GET'); assert.equal(request.url, 'https://painel.test/admin/table');
      assert.equal(request.data.id, endpoint); assert.equal(request.data.length, 1000);
      assert.deepEqual(request.data.order, [{column: 0, dir: 'asc'}]);
      assert.deepEqual(request.data.search, test.pages[type].params.search);
      assert.equal(request.data.category_id, '12');
      assert.deepEqual(request.data.columns, test.pages[type].params.columns);
    }
    assert.equal(JSON.stringify(test.pages[type].params), initialParams, 'Os parâmetros da tabela nativa não são mutados.');
    assert.equal(new Set(test.selections[type]).size, test.selections[type].length);
    for (const id of ids) assert(test.selections[type].includes(id));
    assert(test.selections.stream.includes(11), 'Seleções fora do filtro são preservadas.');
    const config = test.migrations[0];
    assert.equal(test.migrations.length, 1); assert.equal(config.deferRender, true); assert.equal(config.rowId, 'DT_RowId');
    assert.equal(config.drawCallback, test.originalDraw); assert.equal(config.pageLength, 50);
    assert.equal(config.search.search, test.reviewSearch);
    assert.equal(JSON.stringify(config.order), JSON.stringify(test.reviewOrder));
    assert.equal(JSON.stringify(config.searchCols.map(value => value.search)), JSON.stringify(test.columnSearches));
    assert(test.reviewData().every(row => row.DT_RowId === String(row[1]).toLowerCase() + '-' + row[0]));
    assert(test.reviewData().find(row => row.DT_RowId === type + '-' + ids[0])[2].startsWith('&lt;img'));
    assert(test.reviewData().filter(row => row.DT_RowId.startsWith(type + '-')).every(row => !row[3].includes('fonte-invalida')));
    assert.equal(test.pages[type].category.disabled, false); assert.equal(toolbar.cancel.hidden, true);
    assert.equal(test.calls.length, 0, 'Tudo não chama o toggle nativo que depende de nomes no DOM.');
    if (type === 'stream') {
      test.win.toggleBouquet(8, 'stream', false);
      assert(!test.reviewData().some(row => row.DT_RowId === 'stream-8'), 'O delRow nativo encontra linha sem nó DOM.');
      test.row('stream', 42, {name: '<svg onload=bad()> & nome'});
      test.win.toggleBouquet(42, 'stream', false);
      assert.equal(test.reviewData().find(row => row.DT_RowId === 'stream-42')[2], '&lt;svg onload=bad()&gt; &amp; nome');
      toolbar.remove.click(); test.flush();
      assert(test.selections.stream.includes(11));
      assert(!test.selections.stream.includes(42), 'Visíveis e toggles nativos continuam funcionando após a migração.');
    }
  }

  const failureCases = [
    ['rede', (_request, index, response) => {if (index === 2) throw new Error('offline'); return response;}],
    ['página vazia', (_request, index, response) => index === 2 ? {...response, data: []} : response],
    ['ID duplicado', (_request, index, response) => index === 2 ? {...response, data: records([1])} : response],
    ['total alterado', (_request, index, response) => index === 2 ? {...response, recordsFiltered: '4'} : response],
    ['total geral alterado', (_request, index, response) => index === 2 ? {...response, recordsTotal: '4'} : response],
    ['ID inválido', (_request, _index, response) => ({...response, data: records(['9007199254740992'])})],
    ['nome inválido', (_request, _index, response) => ({...response, data: [['1', {}, '', '']]})],
    ['envelope inválido', () => null]
  ];
  for (const [label, respond] of failureCases) {
    const test = fixture('/admin/bouquet', {datasets: {stream: records([1, 2, 8])}, cap: 2, respond});
    const before = draft(test);
    await test.toolbar('stream').all.click(); test.flush();
    assert.equal(draft(test), before, label + ' preserva o rascunho inteiro.');
    assert.equal(test.migrations.length, 0, label + ' não inicia commit parcial.');
    assert.match(test.toolbar('stream').status.textContent, /rascunho foi preservado/);
    assert.equal(test.pages.stream.category.disabled, false);
  }

  for (const reason of ['cancel', 'filter', 'silent-filter']) {
    let test;
    const opts = {datasets: {stream: records([1, 2, 8])}, cap: 2, delay: 5};
    if (reason === 'silent-filter') opts.respond = (_request, index, response) => {
      if (index === 1) test.pages.stream.category.value = '99';
      return response;
    };
    test = fixture('/admin/bouquet', opts);
    const before = draft(test), operation = test.toolbar('stream').all.click();
    if (reason === 'cancel') test.toolbar('stream').cancel.click();
    if (reason === 'filter') {test.pages.stream.search.value = 'outra busca'; test.form.events.input();}
    await operation; test.flush();
    assert.equal(draft(test), before, reason + ' preserva o rascunho.');
    assert.equal(test.migrations.length, 0);
    assert.match(test.toolbar('stream').status.textContent, /rascunho foi preservado/);
    assert.equal(test.requests.length, 1);
  }

  // Cancelar durante os batches também restaura de forma linear, sem N
  // chamadas remove() e sem publicar uma seleção parcialmente aplicada.
  const rollback = fixture('/admin/bouquet', {datasets: {stream: records(Array.from({length: 2501}, (_, index) => index + 100))}});
  const rollbackBefore = draft(rollback);
  let cancelled = false;
  rollback.onRowsAdd(() => {if (!cancelled) {cancelled = true; rollback.toolbar('stream').cancel.click();}});
  await rollback.toolbar('stream').all.click(); rollback.flush();
  assert.equal(draft(rollback), rollbackBefore);
  assert.equal(rollback.clearCalls(), 1); assert.equal(rollback.removeCalls(), 0);
  assert.match(rollback.toolbar('stream').status.textContent, /Seleção cancelada/);

  for (const failure of ['add', 'draw']) {
    const test = fixture('/admin/bouquet', {datasets: {stream: records([1, 2, 8])}});
    const before = draft(test);
    if (failure === 'draw') test.failNextDraw();
    else {
      let thrown = false;
      test.onRowsAdd(() => {if (!thrown) {thrown = true; throw new Error('rows.add failure');}});
    }
    await test.toolbar('stream').all.click(); test.flush();
    assert.equal(draft(test), before, 'Falha no commit ' + failure + ' restaura revisão e array nativo.');
    assert.equal(test.clearCalls(), 1); assert.equal(test.removeCalls(), 0);
  }

  for (const navigation of ['model', 'new-form']) {
    const test = fixture('/admin/bouquet', {datasets: {stream: records(Array.from({length: 1501}, (_, index) => index + 100))}});
    const originalDraft = draft(test);
    const nextModel = {stream: [777777], movies: [888888], series: [999999], radios: []};
    const nextDraft = JSON.stringify(nextModel);
    let navigated = false;
    test.win.setTimeout = (callback, delay) => setTimeout(() => {
      if (!navigated) {
        navigated = true;
        // Another editor can have the same pathname while owning a new model
        // and new DOM. An old batch must never restore into that global model.
        test.win.rBouquet = nextModel;
        if (navigation === 'new-form') {
          test.form.remove();
          const form = test.doc.body.appendChild(test.doc.createElement('form')); form.id = 'bouquet_form';
          const review = form.appendChild(test.doc.createElement('table')); review.id = 'datatable-review';
          const table = form.appendChild(test.doc.createElement('table')); table.id = 'datatable-stream';
          table.appendChild(test.doc.createElement('tbody'));
        }
        test.win.NaxxBouquetSelection.enhance();
      }
      callback();
    }, delay);
    await test.toolbar('stream').all.click(); test.flush();
    assert.equal(test.win.rBouquet, nextModel);
    assert.equal(JSON.stringify(nextModel), nextDraft, navigation + ': o rollback antigo não toca no novo editor.');
    assert.equal(draft(test), originalDraft, navigation + ': só o modelo e Review antigos são restaurados.');
    assert.equal(test.clearCalls(), 1); assert.equal(test.removeCalls(), 0);
  }

  for (const url of ['https://fonte-invalida.test/table', './stream_source', 'javascript:alert(1)', './table#fragment']) {
    const test = fixture('/admin/bouquet', {datasets: {stream: records([1])}});
    test.pages.stream.url = url; test.win.NaxxBouquetSelection.enhance();
    const before = draft(test);
    await test.toolbar('stream').all.click(); test.flush();
    assert.equal(test.requests.length, 0, 'Não acessa destinos fora do endpoint nativo: ' + url);
    assert.equal(draft(test), before);
  }

  const large = fixture('/admin/bouquet', {datasets: {stream: records(Array.from({length: 300000}, (_, index) => index + 1000000))}});
  await large.toolbar('stream').all.click(); large.flush();
  assert.equal(large.requests.length, 300);
  assert.equal(large.selections.stream.length, 300002);
  assert.equal(large.reviewData().length, 300003);
  assert.equal(large.migrations[0].deferRender, true);
  assert.equal(large.draws(), 1, '300 mil itens não redesenham por item/batch.');
  assert.equal(large.calls.length, 0); assert.equal(large.removeCalls(), 0);
  console.log('PASS: visíveis e tudo nos quatro tipos; GET paginado com limite real, busca/categoria, 300 mil itens, Review lazy, coexistência nativa, nomes seguros, cancelamento/rollback e falhas sem alterar o rascunho; sem HTTP real ou salvamento.');
}

allTests().catch(error => {console.error(error); process.exitCode = 1;});
