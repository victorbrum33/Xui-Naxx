/* Exercita a função AJAX dos Canais com respostas locais simuladas. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const moduleSource = fs.readFileSync(path.join(__dirname, '../xui-naxx/src/stream-source-ui.js'), 'utf8');
const testSource = moduleSource.replace(/\}\(\)\);\s*$/, '  window.testAjax = runAjax;\n}());');
assert.notEqual(testSource, moduleSource, 'O teste precisa carregar a função AJAX do módulo.');

function encodeParams(data) {
  const params = new URLSearchParams();
  function append(key, value) {
    if (value !== null && typeof value === 'object') {
      for (const [name, item] of Object.entries(value)) append(`${key}[${name}]`, item);
    } else {
      params.append(key, String(value ?? ''));
    }
  }
  for (const [name, value] of Object.entries(data)) append(name, value);
  return params.toString();
}

const fixtureRows = (count, first = count) => Array.from({length: count}, (_, index) => [
  `<span>${first - index}</span>`, `Canal ${first - index}`
]);
const idsOf = rows => Array.from(rows, row => Number(row[0].replace(/<[^>]*>/g, '')));
const tick = () => new Promise(resolve => setImmediate(resolve));
function data(draw, start, length) {
  return {draw, start, length, search: {value: 'Notícias', regex: false}, order: [{column: 3, dir: 'desc'}],
    columns: [{data: '0', search: {value: '', regex: false}}]};
}

function fixture({rows, total, source = '', ids = [], tableResponse}) {
  const requests = [], sourceRequests = [], timers = new Map();
  let timerId = 0, now = 1000;
  const window = {
    location: new URL('https://naxx.test/admin/streams'),
    setTimeout(callback) {timers.set(++timerId, callback); return timerId;},
    clearTimeout(id) {timers.delete(id);},
    async fetch(url, options) {
      if (options.signal.aborted) throw new DOMException('Consulta interrompida', 'AbortError');
      const {pathname, searchParams, origin} = new URL(url);
      assert.equal(origin, 'https://naxx.test');
      assert.equal(options.credentials, 'same-origin');
      assert.equal(options.headers['X-Requested-With'], 'XMLHttpRequest');
      if (pathname === '/admin/naxx-update.php') {
        sourceRequests.push(searchParams);
        assert.equal(searchParams.get('feature'), 'stream-sources');
        assert.equal(searchParams.get('host'), source);
        return {ok: true, json: async () => ({ok: true, ids})};
      }
      assert.equal(pathname, '/admin/table');
      const start = Number(searchParams.get('start')), length = Number(searchParams.get('length'));
      requests.push({searchParams, start, length, signal: options.signal});
      // O servidor aceita valores maiores, mas entrega no máximo 1.000 por chamada.
      const page = {draw: Number(searchParams.get('draw')), recordsTotal: total, recordsFiltered: rows.length,
        data: rows.slice(start, start + Math.min(1000, length))};
      const response = tableResponse ? await tableResponse(page) : page;
      return {ok: true, json: async () => response};
    }
  };
  const document = {readyState: 'loading', addEventListener() {}, getElementById() {return null;}};
  vm.runInNewContext(testSource, {window, document, AbortController, URL, URLSearchParams, Date: {now: () => now}});
  const state = {
    source, native: {url: './table', data(params) {
      Object.assign(params, {id: 'streams', filter: '5', server: '1', category: '42'});
    }},
    settings: {}, jq: {param: encodeParams}, table: {isConnected: true},
    status: {hidden: true, textContent: ''}, cache: null, request: null
  };
  return {window, state, requests, sourceRequests, timers, advance(ms) {now += ms;}};
}

function uiFixture({length = 50, search = '', rows = fixtureRows(5500), complete = false} = {}) {
  const handlers = new Map(), documentHandlers = new Map(), requests = [], reloads = [], timers = new Map();
  let hostsResolve, initialized = complete, timerId = 0;
  function element(tagName = 'div') {
    const classes = new Set();
    return {tagName, children: [], isConnected: true, value: '',
      classList: {contains: name => classes.has(name), add: name => classes.add(name), remove: name => classes.delete(name)},
      appendChild(child) {this.children.push(child); child.parentElement = this;},
      after() {}, remove() {this.isConnected = false;}, setAttribute() {}};
  }
  const table = element('table'), filters = element(), clearButton = {disabled: true};
  const nodes = {'datatable-streampage': table, collapse_filters: filters, clearFilters: clearButton};
  const document = {
    readyState: 'complete',
    getElementById: id => nodes[id] || null,
    createElement: element,
    addEventListener(name, callback) {documentHandlers.set(name, callback);}
  };
  const settings = {_bInitComplete: complete, ajax: {url: './table', data(params) {params.id = 'streams';}}};
  const api = {settings: () => [settings], page: {len: () => length}, rows: () => ({count: () => 0}),
    ajax: {reload(callback, reset) {reloads.push({callback, reset});}}};
  function jq(node) {
    if (!handlers.has(node)) handlers.set(node, new Map());
    return {
      on(name, selector, callback) {handlers.get(node).set(name, callback || selector); return this;},
      off() {handlers.get(node).clear(); return this;},
      DataTable() {return api;},
      trigger(name) {const handler = handlers.get(node).get(name); if (handler) handler(); return this;}
    };
  }
  jq.fn = {dataTable: {isDataTable: node => node === table && initialized}};
  jq.param = encodeParams;
  const window = {jQuery: jq, location: new URL(`https://naxx.test/admin/streams${search}`),
    history: {replaceState(_state, _title, url) {window.location = new URL(url);}},
    clearFilters() {window.checkClear();}, checkClear() {clearButton.disabled = true;},
    setTimeout(callback) {timers.set(++timerId, callback); return timerId;},
    clearTimeout(id) {timers.delete(id);},
    async fetch(url, options) {
      const {pathname, searchParams} = new URL(url);
      if (pathname === '/admin/naxx-update.php') {
        assert.equal(searchParams.get('host'), null, 'O carregamento inicial pede apenas a lista de fontes.');
        return new Promise(resolve => {hostsResolve = hosts => resolve({ok: true, json: async () => ({ok: true, hosts})});});
      }
      assert.equal(pathname, '/admin/table');
      const start = Number(searchParams.get('start')), count = Number(searchParams.get('length'));
      requests.push({start, length: count, signal: options.signal});
      return {ok: true, json: async () => ({draw: Number(searchParams.get('draw')), recordsTotal: rows.length,
        recordsFiltered: rows.length, data: rows.slice(start, start + Math.min(1000, count))})};
    }
  };
  vm.runInNewContext(moduleSource, {window, document, AbortController, URL, URLSearchParams});
  function event(name, ...args) {
    const handler = handlers.get(document)?.get(name);
    assert.equal(typeof handler, 'function', `O módulo observa ${name}.`);
    handler({}, ...args);
  }
  return {window, settings, requests, reloads, clearButton, filters,
    preInit() {initialized = true; event('preInit.dt.naxxStreamTable', settings);},
    init() {settings._bInitComplete = true; event('init.dt.naxxStreamTable', settings);},
    resolveHosts(hosts) {assert.equal(typeof hostsResolve, 'function'); hostsResolve(hosts);},
    csv() {
      let prevented = false;
      documentHandlers.get('click')({target: {closest: selector => selector === '#btn-export-csv'},
        preventDefault() {prevented = true;}, stopImmediatePropagation() {}});
      return prevented;
    }
  };
}

async function run(harness, params) {
  const results = [];
  const request = harness.window.testAjax(harness.state, params, result => results.push(result));
  await tick();
  assert.equal(results.length, 1, 'A consulta atual deve concluir com um único callback.');
  assert.equal(harness.state.request, null);
  assert.equal(request.readyState, 4);
  return results[0];
}

function assertNativeFilters(requests) {
  for (const {searchParams} of requests) {
    for (const [key, value] of Object.entries({id: 'streams', filter: '5', server: '1', category: '42',
      'search[value]': 'Notícias', 'order[0][column]': '3', 'order[0][dir]': 'desc', 'columns[0][data]': '0'})) {
      assert.equal(searchParams.get(key), value, `Preserva o parâmetro nativo ${key}.`);
    }
  }
}

(async () => {
  const initial = uiFixture({length: 5000});
  initial.preInit();
  assert.equal(typeof initial.settings.ajax, 'function', 'O agregador deve ser instalado antes da primeira consulta nativa.');
  assert.equal(initial.reloads.length, 0, 'preInit não dispara uma segunda consulta.');
  const initialResults = [];
  initial.settings.ajax(data(1, 0, 5000), result => initialResults.push(result));
  await tick();
  assert.equal(initialResults.length, 1);
  assert.equal(initialResults[0].data.length, 5000, 'A primeira página já contém as 5.000 entradas.');
  assert.deepEqual(initial.requests.map(({start, length}) => [start, length]),
    [[0, 1000], [1000, 1000], [2000, 1000], [3000, 1000], [4000, 1000]]);
  initial.init();
  assert.equal(initial.reloads.length, 0, 'init não repete a consulta que já foi agregada.');
  initial.resolveHosts([]);
  await tick();

  const late = uiFixture({length: 5000, complete: true});
  assert.equal(typeof late.settings.ajax, 'function');
  assert.equal(late.reloads.length, 1, 'Se o módulo chegou após init, ele recarrega a página maior uma vez.');
  assert.equal(late.reloads[0].reset, false);
  late.resolveHosts([]);
  await tick();

  const pendingSource = uiFixture({search: '?naxx_source=old.example'});
  pendingSource.preInit();
  assert.equal(pendingSource.clearButton.disabled, false, 'A fonte pendente mantém Limpar filtros disponível.');
  assert.equal(pendingSource.csv(), true, 'O CSV fica bloqueado enquanto a fonte da URL aguarda validação.');
  pendingSource.window.clearFilters();
  assert.equal(pendingSource.window.location.searchParams.has('naxx_source'), false);
  assert.equal(pendingSource.clearButton.disabled, true);
  assert.equal(pendingSource.csv(), false, 'Limpar filtros libera imediatamente o CSV.');
  pendingSource.resolveHosts(['old.example']);
  await tick();
  assert.equal(pendingSource.reloads.length, 0, 'A resposta tardia de fontes não reativa a seleção antiga.');
  assert.equal(pendingSource.filters.children[0].children[0].value, '');
  assert.equal(pendingSource.csv(), false, 'O CSV continua liberado após a resposta tardia.');

  const rows = fixtureRows(7300, 9000);
  const large = fixture({rows, total: 9000});
  const expanded = await run(large, data(8, 2000, 5000));
  assert.deepEqual(large.requests.map(({start, length}) => [start, length]),
    [[2000, 1000], [3000, 1000], [4000, 1000], [5000, 1000], [6000, 1000]]);
  assert.deepEqual(idsOf(expanded.data), idsOf(rows.slice(2000, 7000)));
  assert.equal(expanded.draw, 8);
  assert.equal(expanded.recordsTotal, 9000);
  assert.equal(expanded.recordsFiltered, 7300);
  const last = await run(large, data(9, 7000, 5000));
  assert.deepEqual(idsOf(last.data), idsOf(rows.slice(7000)));
  assert.equal(large.requests.at(-1).start, 7000);
  assert.equal(last.recordsFiltered, 7300);
  assertNativeFilters(large.requests);
  const moved = await run(large, data(12, 10000, 5000));
  assert.deepEqual(idsOf(moved.data), idsOf(rows.slice(5000)), 'Uma página removida retorna a última página válida.');
  assert.equal(large.state.settings._iDisplayStart, 5000);
  assert.equal(large.requests.at(-1).start, 7000);

  const filtered = fixture({rows: fixtureRows(3500, 5000), total: 8000, source: 'source.example',
    ids: [1700, 2800, 3900, 9900]});
  const match = await run(filtered, data(10, 1, 1));
  assert.deepEqual(filtered.requests.map(request => request.start), [0, 1000, 2000, 3000]);
  assert.equal(filtered.sourceRequests.length, 1);
  assert.deepEqual(idsOf(match.data), [2800]);
  assert.equal(match.recordsTotal, 8000);
  assert.equal(match.recordsFiltered, 3, 'O total filtrado conta todos os lotes, não só a página exibida.');
  assertNativeFilters(filtered.requests);
  const first = await run(filtered, data(11, 0, 3));
  assert.deepEqual(idsOf(first.data), [3900, 2800, 1700]);
  assert.equal(first.recordsFiltered, 3);
  assert.equal(first.draw, 11);
  assert.equal(filtered.requests.length, 4, 'Paginar sobre os mesmos filtros reutiliza o resultado.');
  const expires = filtered.state.cache.expires;
  filtered.advance(10000);
  await run(filtered, data(12, 1, 1));
  assert.equal(filtered.state.cache.expires, expires, 'Paginação não renova os 15 segundos do cache.');
  filtered.advance(6000);
  await run(filtered, data(13, 2, 1));
  assert.equal(filtered.sourceRequests.length, 2, 'O resultado é consultado novamente após expirar, mesmo paginando.');
  assert.ok(filtered.state.cache.expires > expires);

  const shrinkingRows = fixtureRows(1200);
  const shrinking = fixture({rows: shrinkingRows, total: 1200, source: 'source.example', ids: [1200, 1199, 1198]});
  assert.deepEqual(idsOf((await run(shrinking, data(14, 2, 1))).data), [1198]);
  shrinkingRows.splice(1);
  const adjusted = await run(shrinking, data(15, 2, 1));
  assert.deepEqual(idsOf(adjusted.data), [1200], 'Recarregar a mesma página atualiza o catálogo e corrige seu offset.');
  assert.equal(adjusted.recordsFiltered, 1);
  assert.equal(shrinking.state.settings._iDisplayStart, 0);
  shrinkingRows.splice(0);
  const empty = await run(shrinking, data(16, 0, 1));
  assert.equal(empty.recordsFiltered, 0);
  assert.deepEqual(idsOf(empty.data), []);
  assert.equal(shrinking.state.settings._iDisplayStart, 0);

  const emptyNative = fixture({rows: [], total: 0});
  const emptyPage = await run(emptyNative, data(17, 5000, 5000));
  assert.equal(emptyPage.recordsFiltered, 0);
  assert.equal(emptyNative.state.settings._iDisplayStart, 0);
  assert.equal(emptyNative.requests.length, 1, 'Um catálogo vazio não exige uma segunda consulta.');

  let release;
  const stale = fixture({rows: fixtureRows(1800), total: 1800, tableResponse(page) {
    if (page.draw === 20) return new Promise(resolve => {release = () => resolve(page);});
    return page;
  }});
  const oldResults = [];
  stale.window.testAjax(stale.state, data(20, 0, 5000), result => oldResults.push(result));
  assert.equal(stale.requests[0].signal.aborted, false);
  const current = await run(stale, data(21, 1000, 5000));
  assert.equal(stale.requests[0].signal.aborted, true);
  assert.equal(current.draw, 21);
  release();
  await tick();
  assert.deepEqual(oldResults, [], 'Uma resposta antiga não pode sobrescrever a tabela atual.');
  assert.equal(stale.state.status.hidden, true);
  assert.equal(stale.timers.size, 0);

  const invalid = fixture({rows: fixtureRows(1200), total: 1200, tableResponse(page) {
    return {...page, data: page.data.slice(0, -1)};
  }});
  const error = await run(invalid, data(30, 0, 2000));
  assert.equal(invalid.requests.length, 1, 'Uma resposta inconsistente interrompe a coleta.');
  assert.equal(error.draw, 30);
  assert.equal(error.recordsFiltered, 0);
  assert.deepEqual(idsOf(error.data), []);
  assert.match(invalid.state.status.textContent, /Não foi possível carregar os canais/);
  console.log('PASS: preInit com 5.000, lotes de 1.000, filtros nativos, cache de 15s, fonte pendente/limpeza/CSV, ajuste de página, abort e resposta inválida.');
})().catch(error => {console.error(error.stack); process.exitCode = 1;});
