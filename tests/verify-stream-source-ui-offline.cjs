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
  let timerId = 0;
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
  const document = {readyState: 'loading', addEventListener() {}};
  vm.runInNewContext(testSource, {window, document, AbortController, URL, URLSearchParams});
  const state = {
    source, native: {url: './table', data(params) {
      Object.assign(params, {id: 'streams', filter: '5', server: '1', category: '42'});
    }},
    settings: {}, jq: {param: encodeParams}, table: {isConnected: true},
    status: {hidden: true, textContent: ''}, cache: null, request: null
  };
  return {window, state, requests, sourceRequests, timers};
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
  console.log('PASS: lotes de 1.000, offsets, ordem e filtros nativos, contagem por fonte, paginação, abort e resposta inválida.');
})().catch(error => {console.error(error.stack); process.exitCode = 1;});
