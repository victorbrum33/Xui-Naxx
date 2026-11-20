/* Exclusão em massa: consultas e seleção nativas simuladas, sem exclusão ou HTTP real. */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
let JSDOM, VirtualConsole;
try {({JSDOM, VirtualConsole} = require(process.env.NAXX_JSDOM || 'jsdom'));}
catch (error) {throw new Error('Instale jsdom ou defina NAXX_JSDOM para executar esta verificação offline.', {cause:error});}
const source = fs.readFileSync(path.join(__dirname, '../xui-naxx/src/bulk-delete-ui.js'), 'utf8');
const tick = () => new Promise(resolve => setImmediate(resolve));
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
async function settle() {await tick(); await pause(8); await tick();}
function deferred() {let resolve; const promise = new Promise(done => {resolve = done;}); return {promise, resolve};}
const configs = [
  ['md1','stream','show_entries','rStreams','streams','stream_list'],
  ['md2','movie','movie_show_entries','rMovies','movies','movie_list'],
  ['md3','line','line_show_entries','rLines','lines','lines'],
  ['md4','series','series_show_entries','rSeries','series','series_list'],
  ['md5','episode','episode_show_entries','rEpisodes','episodes','episode_list'],
  ['md6','radio','radio_show_entries','rRadios','radios','radio_list'],
  ['md7','user','user_show_entries','rUsers','users','reg_users'],
  ['md8','mag','mag_show_entries','rMAGs','mags','mags'],
  ['md9','enigma','enigma_show_entries','rEnigmas','enigmas','enigmas']
];
function encodeParams(data) {
  const params = new URLSearchParams();
  function append(key, value) {
    if (value !== null && typeof value === 'object') for (const [name, item] of Object.entries(value)) append(`${key}[${name}]`, item);
    else params.append(key, String(value ?? ''));
  }
  for (const [name, value] of Object.entries(data)) append(name, value);
  return params.toString();
}
function markup(config) {
  const [suffix, type, size, , field] = config, id = 'datatable-' + suffix;
  const options = ['10','25','50','250','500','1000'].map(value => `<option value="${value}"${value === '50' ? ' selected' : ''}>${value}</option>`).join('');
  return `<div class="tab-pane" id="${type}-selection"><form id="${type}_form"><input type="hidden" name="${field}" id="${field}"><div class="row"><div class="col-md-2"><input id="${type}_search" value=""></div><div class="col-md-3"><select id="${type}_server_id"><option value="">Todos os servidores</option><option value="1">Servidor 1</option></select></div><div class="col-md-3"><select id="${type}_category_search"><option value="">Todas as categorias</option><option value="2">Categoria 2</option></select></div><div class="col-md-2"><select id="${type}_filter"><option value="">Sem filtro</option><option value="1">Ativo</option></select></div><div class="col-md-1"><select id="${size}" class="select2-hidden-accessible">${options}</select></div><div class="col-md-1"><button type="button" onclick="toggle_${suffix}()">Selecionar</button></div><div class="xui-table-scroll"><div id="${id}_wrapper" class="dataTables_wrapper"><select name="${id}_length" aria-controls="${id}"><option value="10">10</option><option value="25">25</option><option selected value="50">50</option><option value="100">100</option></select><table id="${id}"><thead><tr><th>ID</th><th>Nome</th></tr></thead><tbody></tbody></table></div></div></div><button type="submit">Excluir</button></form></div>`;
}
function fixture(options = {}) {
  const virtualConsole = new VirtualConsole(), errors = [], requests = [], posts = [], delegated = [];
  virtualConsole.on('jsdomError', error => errors.push(error.message));
  const dom = new JSDOM('<!doctype html><html><body><main>' + (options.empty ? '' : configs.map(markup).join('')) + '</main></body></html>', {
    url:'https://panel.example.test/admin/' + (options.route || 'mass_delete?naxx_cleanup=channel'), runScripts:'dangerously', virtualConsole
  });
  const {window} = dom, document = window.document;
  Object.defineProperty(document, 'readyState', {value:'complete', configurable:true});
  const bindings = new Map(), profiles = new Map();
  const flags = {sourceError:false, pageError:false};
  let intercept = null;
  function emit(node, name, ...args) {node.dispatchEvent(new window.CustomEvent(name.split('.')[0], {bubbles:true, detail:args}));}
  function jq(node) {
    if (typeof node === 'string') node = document.querySelector(node);
    const api = {
      DataTable: () => profiles.get(node).api,
      on(names, target, callback) {
        if (typeof target === 'function') {callback = target; target = null;}
        for (const name of names.split(' ')) {
          const handler = event => {
            const selected = target ? event.target.closest(target) : node;
            if (selected) callback.call(selected, event, ...(event.detail || []));
          };
          const record = {name, handler};
          if (!bindings.has(node)) bindings.set(node, []); bindings.get(node).push(record);
          node.addEventListener(name.split('.')[0], handler);
          if (node === document) delegated.push({name, target});
        }
        return api;
      },
      off(namespace) {
        const records = bindings.get(node) || [];
        for (const record of records) if (record.name.includes(namespace)) node.removeEventListener(record.name.split('.')[0], record.handler);
        bindings.set(node, records.filter(record => !record.name.includes(namespace))); return api;
      },
      trigger(name) {
        if (name.includes('.')) {
          for (const record of bindings.get(node) || []) if (record.name.split('.')[0] === name.split('.')[0] && record.name.includes('.' + name.split('.')[1])) record.handler(new window.Event(name.split('.')[0]));
        } else emit(node, name);
        return api;
      },
      select2(action) {node.classList.toggle('select2-hidden-accessible', action !== 'destroy'); return api;}
    };
    return api;
  }
  jq.fn = {dataTable:{isDataTable:node => profiles.has(node) && profiles.get(node).initialized}, select2() {}};
  jq.param = encodeParams;
  window.jQuery = jq;
  function filtered(profile, params) {
    return profile.catalog.filter(row => {
      const id = Number(row[0]), search = params.get('search[value]') || '';
      return (!params.get('category') || id % 2 === 0) && (!params.get('server') || id % 5 === 0) &&
        (!params.get('filter') || id % 7 === 0) && (!search || row[1].includes(search));
    });
  }
  async function fetcher(address, settings = {}) {
    const url = new URL(address), params = url.searchParams;
    assert.equal(settings.credentials, 'same-origin'); assert.equal(settings.headers['X-Requested-With'], 'XMLHttpRequest');
    assert.equal(url.origin, 'https://panel.example.test');
    assert(!settings.method || settings.method === 'GET', 'A melhoria só pode consultar.');
    requests.push({url, settings});
    let body, status = 200;
    if (url.pathname === '/admin/naxx-update.php') {
      assert.equal(params.get('feature'), 'stream-sources');
      if (params.has('host')) {
        if (flags.sourceError) status = 500;
        const divisor = params.get('host') === 'fonte-a.example' ? 3 : 4;
        body = {ok:true, ids:Array.from(profiles.values())[0].catalog.map(row => Number(row[0])).filter(id => id % divisor === 0)};
      } else body = {ok:true, hosts:['fonte-a.example','fonte-b.example']};
    } else {
      assert.equal(url.pathname, '/admin/table');
      assert(Number(params.get('length')) <= 1000, 'Cada consulta deve respeitar o teto nativo de 1.000.');
      const profile = Array.from(profiles.values()).find(item => item.config[5] === params.get('id'));
      assert(profile, 'O ID nativo da tabela deve ser preservado.');
      const rows = filtered(profile, params), start = Number(params.get('start')), length = Number(params.get('length'));
      body = {draw:Number(params.get('draw')), recordsTotal:profile.catalog.length, recordsFiltered:rows.length, data:rows.slice(start, start + Math.min(1000, length))};
      if (flags.pageError) body.data = body.data.slice(1);
    }
    const response = {ok:status === 200, status, url:url.href, json:async () => body};
    if (intercept) {const replacement = await intercept(url, settings, response); if (replacement) return replacement;}
    return response;
  }
  window.fetch = fetcher;
  window.XMLHttpRequest = function () {throw new Error('XHR direto não permitido na verificação.');};
  function install(config) {
    const [suffix, type, size, selection, field, queryId] = config, table = document.getElementById('datatable-' + suffix);
    if (!table) return;
    window[selection] = ['999999'];
    const catalog = Array.from({length:type === 'movie' ? 6207 : 2307}, (_, index) => [String(8000 - index), 'Canal ' + (8000 - index)]);
    const profile = {config, table, catalog, rows:[], length:50, start:0, draw:1, initialized:options.initialized !== false, current:{}};
    const native = {url:'./table', data(params) {
      params.id = queryId;
      if (['stream','movie','radio','series'].includes(type)) params.category = document.getElementById(type + '_category_search').value;
      if (type !== 'series') params.filter = document.getElementById(type + '_filter').value;
      if (['stream','movie','episode','radio'].includes(type)) params.server = document.getElementById(type + '_server_id').value;
      if (type === 'stream') params.include_channels = true;
      if (type === 'line') {params.no_url = true; params.reseller = '';}
      if (type === 'episode') params.series = '';
    }};
    profile.settings = {nTable:table, _bInitComplete:profile.initialized, _iDisplayStart:0, ajax:native};
    profile.native = native;
    function render(data) {
      table.tBodies[0].textContent = '';
      profile.rows = data.map(row => {
        const node = document.createElement('tr');
        const id = document.createElement('td'); id.textContent = row[0]; node.appendChild(id);
        const name = document.createElement('td'); name.textContent = row[1]; node.appendChild(name);
        if (window[selection].includes(row[0])) ['selectedfilter','ui-selected','selected'].forEach(value => node.classList.add(value));
        table.tBodies[0].appendChild(node); return {data:row, node};
      });
    }
    const api = {settings:() => [profile.settings], rows:() => ({every(callback) {
      for (const row of profile.rows) callback.call({data:() => row.data, node:() => row.node});
    }}), page:{len(value) {
      if (!arguments.length) return profile.length;
      profile.length = Number(value); emit(table, 'length', profile.settings, profile.length); return api;
    }}, draw() {
      const params = {draw:++profile.draw, start:profile.start, length:profile.length, search:{value:document.getElementById(type + '_search').value, regex:false}, order:[{column:0,dir:'desc'}]};
      profile.current = params; emit(table, 'preXhr', profile.settings, params);
      profile.idle = new Promise((resolve, reject) => {
        function callback(result) {
          profile.response = result; render(result.data); emit(table, 'draw', profile.settings); resolve(result);
        }
        if (typeof profile.settings.ajax === 'function') profile.settings.ajax(params, callback);
        else {
          native.data(params);
          fetcher('https://panel.example.test/admin/table?' + encodeParams(params), {credentials:'same-origin', headers:{'X-Requested-With':'XMLHttpRequest'}})
            .then(response => response.json()).then(callback, reject);
        }
      });
      return api;
    }};
    api.ajax = {params:() => profile.current, reload(_callback, reset) {if (reset !== false) profile.start = 0; api.draw();}};
    profile.api = api; native.data(profile.current); Object.assign(profile.current, {draw:1,start:0,length:50,search:{value:'',regex:false},order:[{column:0,dir:'desc'}]});
    profiles.set(table, profile); render(catalog.slice(0, 50));
    // Mesmo contrato nativo: o botão só inverte IDs das linhas visíveis; o
    // módulo não substitui essa função nem os eventos do formulário.
    window['toggle_' + suffix] = function () {
      for (const row of profile.rows) {
        const id = row.node.cells[0].textContent, selected = row.node.classList.contains('selected');
        ['selectedfilter','ui-selected','selected'].forEach(name => row.node.classList.toggle(name, !selected));
        if (selected) window[selection].splice(window[selection].indexOf(id), 1); else window[selection].push(id);
      }
    };
    document.getElementById(size).addEventListener('change', event => {api.page.len(event.target.value).draw();});
    document.querySelector('select[name="' + table.id + '_length"]').addEventListener('change', event => {api.page.len(event.target.value).draw();});
    table.closest('form').addEventListener('submit', event => {event.preventDefault(); posts.push(field);});
    return profile;
  }
  if (!options.empty) configs.forEach(install);
  window.eval(source);
  return {dom, window, document, profiles, requests, errors, posts, delegated, flags, install,
    get channel() {return profiles.get(document.getElementById('datatable-md1'));},
    get sourceSelect() {return document.getElementById('naxx-bulk-source');},
    async chooseSource(host) {this.sourceSelect.value = host; jq(this.sourceSelect).trigger('change'); await this.channel.idle; await settle();},
    async size(profile, value, generated = false) {
      const control = generated ? document.querySelector('select[name="' + profile.table.id + '_length"]') : document.getElementById(profile.config[2]);
      control.value = String(value); control.dispatchEvent(new window.Event('change', {bubbles:true})); await profile.idle; await settle();
    },
    intercept(callback) {intercept = callback;},
    emit, jq,
    close() {window.close();}
  };
}

(async () => {
  const f = fixture();
  try {
    await settle();
    assert.equal(f.requests.filter(call => call.url.pathname.endsWith('/table')).length, 0, 'Manter 50 não deve consultar catálogos em segundo plano.');
    assert.equal(f.requests.length, 1, 'Só a lista de nomes de fontes é consultada na abertura.');
    assert.equal(f.document.querySelectorAll('.naxx-bulk-delete-filters').length, 9);
    const channel = f.channel, originalToggle = f.window.toggle_md1, originalData = channel.native.data;
    const sourceBox = f.sourceSelect.closest('.naxx-bulk-source'), filters = channel.table.closest('form').querySelector('.row');
    const tableBox = filters.querySelector(':scope > .xui-table-scroll');
    assert(sourceBox.compareDocumentPosition(tableBox) & f.window.Node.DOCUMENT_POSITION_FOLLOWING, 'O filtro deve preceder a tabela, inclusive quando ela está dentro do wrapper de rolagem.');
    assert.equal(Array.from(filters.children).indexOf(sourceBox), 3, 'A fonte fica após busca, servidor e categoria.');
    assert(f.sourceSelect.previousElementSibling.classList.contains('sr-only'));
    for (const profile of f.profiles.values()) {
      assert.equal(profile.length, 50);
      assert.deepEqual(Array.from(f.document.getElementById(profile.config[2]).options).slice(-2).map(option => option.value), ['2000','5000']);
      assert.deepEqual(Array.from(f.document.querySelector('select[name="' + profile.table.id + '_length"]').options).slice(-2).map(option => option.value), ['2000','5000']);
    }
    await f.size(channel, 2000);
    assert.equal(channel.rows.length, 2000); assert.equal(channel.response.recordsFiltered, 2307);
    assert.equal(f.document.querySelector('select[name="datatable-md1_length"]').value, '2000');
    assert.equal(channel.settings.ajax === channel.native, false);
    assert.deepEqual(f.window.rStreams, ['999999']);
    channel.start = 2000; channel.api.draw(); await channel.idle;
    assert.equal(channel.rows.length, 307); assert.equal(channel.response.recordsFiltered, 2307);
    channel.start = 0; await f.size(channel, 5000, true);
    assert.equal(channel.rows.length, 2307); assert.equal(f.document.getElementById('show_entries').value, '5000');
    await f.size(channel, 50);
    assert.equal(channel.settings.ajax, channel.native, 'Sem fonte e até 1.000, a consulta volta ao objeto AJAX nativo.');
    assert.equal(channel.rows.length, 50);
    for (const profile of f.profiles.values()) {
      if (profile === channel) continue;
      await f.size(profile, 2000);
      assert.equal(profile.rows.length, 2000); assert.deepEqual(f.window[profile.config[3]], ['999999']);
      assert.equal(profile.settings.ajax === profile.native, false);
    }
    const movie = f.profiles.get(f.document.getElementById('datatable-md2'));
    await f.size(movie, 5000); assert.equal(movie.rows.length, 5000);
    movie.start = 5000; movie.api.draw(); await movie.idle; assert.equal(movie.rows.length, 1207);
    f.document.getElementById('stream_category_search').value = '2';
    f.document.getElementById('stream_server_id').value = '1';
    f.document.getElementById('stream_filter').value = '1';
    await f.chooseSource('fonte-a.example');
    const expected = channel.catalog.filter(row => {const id = Number(row[0]); return id % 2 === 0 && id % 5 === 0 && id % 7 === 0 && id % 3 === 0;}).map(row => row[0]);
    assert.deepEqual(Array.from(channel.rows, row => row.data[0]), expected);
    assert.equal(channel.response.recordsFiltered, expected.length);
    assert.equal(channel.response.recordsTotal, 2307);
    assert.equal(f.document.querySelector('.naxx-bulk-scope-help').hidden, false, 'A ação global de limpeza tem escopo explicitamente diferente.');
    const filteredRequests = f.requests.filter(call => call.url.pathname.endsWith('/table') && call.url.searchParams.get('category') === '2');
    assert(filteredRequests.length);
    for (const call of filteredRequests) {
      const params = call.url.searchParams;
      assert.equal(params.get('id'), 'stream_list'); assert.equal(params.get('include_channels'), 'true');
      assert.equal(params.get('server'), '1'); assert.equal(params.get('filter'), '1');
    }
    channel.table.closest('form').querySelector('button[onclick]').click();
    assert.deepEqual(Array.from(f.window.rStreams), ['999999', ...expected], 'O botão nativo só adiciona os IDs visíveis depois da interseção com a fonte.');
    assert.equal(JSON.parse(f.document.getElementById('streams').value).length, expected.length + 1);
    assert.equal(f.window.toggle_md1, originalToggle); assert.equal(channel.native.data, originalData);
    await settle();
    const selectedBefore = Array.from(f.window.rStreams);
    const ids = await f.window.NaxxBulkDelete.filteredIds(channel.table, new AbortController().signal);
    assert.deepEqual(Array.from(ids), expected, 'O provedor de IDs honra fonte e todos os filtros nativos.');
    assert.deepEqual(Array.from(f.window.rStreams), selectedBefore, 'Consultar IDs não muda a seleção nem dispara exclusão.');
    f.document.getElementById('stream_search').value = '999999999'; channel.api.draw(); await channel.idle;
    assert.equal(channel.rows.length, 0); assert.equal(channel.response.recordsFiltered, 0);
    f.document.getElementById('stream_search').value = '';
    f.flags.sourceError = true; channel.api.draw(); await channel.idle;
    assert.equal(channel.rows.length, 0, 'Falhar a consulta da fonte nunca revela a lista sem filtro.');
    assert.match(channel.table.closest('form').querySelector('.naxx-bulk-filter-status').textContent, /Não foi possível/);
    assert.deepEqual(Array.from(f.window.rStreams), selectedBefore);
    f.flags.sourceError = false; await f.chooseSource('');
    assert.equal(channel.settings.ajax, channel.native);
    assert.equal(f.document.querySelector('.naxx-bulk-scope-help').hidden, true);
    assert(f.requests.every(call => !call.url.pathname.includes('post') && !call.url.pathname.includes('/api')));
    assert.deepEqual(f.posts, []); assert.deepEqual(f.errors, []);
    const count = f.delegated.length, sourceReads = f.requests.filter(call => call.url.searchParams.get('feature') === 'stream-sources' && !call.url.searchParams.has('host')).length;
    f.window.eval(source); f.window.NaxxBulkDelete.enhance(); await settle();
    assert.equal(f.delegated.length, count); assert.equal(f.document.querySelectorAll('.naxx-bulk-source').length, 1);
    assert.equal(f.requests.filter(call => call.url.searchParams.get('feature') === 'stream-sources' && !call.url.searchParams.has('host')).length, sourceReads);
    f.window.history.pushState({}, '', '/admin/streams'); f.document.querySelector('main').textContent = ''; await settle();
    assert.equal(channel.settings.ajax, channel.native, 'A saída por navegação restaura a configuração nativa.');
  } finally {f.close();}

  const late = fixture({empty:true});
  try {
    late.document.querySelector('main').innerHTML = markup(configs[0]); const profile = late.install(configs[0]); await settle();
    assert.equal(late.document.querySelectorAll('.naxx-bulk-source').length, 1);
    await late.size(profile, 5000); assert.equal(profile.rows.length, 2307);
    const gate = deferred(); let blocked = false;
    late.intercept(async (url, settings, response) => {
      if (!blocked && url.pathname.endsWith('/table')) {blocked = true; await gate.promise;}
      return response;
    });
    late.sourceSelect.value = 'fonte-a.example'; late.jq(late.sourceSelect).trigger('change');
    for (let count = 0; count < 20 && !blocked; count++) await tick();
    assert(blocked);
    late.sourceSelect.value = 'fonte-b.example'; late.jq(late.sourceSelect).trigger('change'); await profile.idle;
    const expected = profile.catalog.filter(row => Number(row[0]) % 4 === 0).map(row => row[0]);
    assert.deepEqual(Array.from(profile.rows, row => row.data[0]), expected);
    gate.resolve(); await settle(); assert.deepEqual(Array.from(profile.rows, row => row.data[0]), expected, 'Uma resposta antiga não pode repor a fonte anterior.');
    late.intercept(null); late.flags.pageError = true; profile.api.draw(); await profile.idle;
    assert.equal(profile.rows.length, 0); assert.deepEqual(Array.from(late.window.rStreams), ['999999']);
    assert.deepEqual(late.posts, []); assert.deepEqual(late.errors, []);
  } finally {late.close();}

  const isolated = fixture({route:'streams'});
  try {
    await settle(); assert.equal(isolated.document.querySelectorAll('.naxx-bulk-source').length, 0);
    assert.equal(isolated.requests.length, 0); assert.deepEqual(isolated.posts, []);
  } finally {isolated.close();}
  console.log('OK: filtros nativos + fonte, 2.000/5.000 nas nove tabelas, seleção visível, falhas, corrida, navegação e zero exclusões.');
})().catch(error => {console.error(error); process.exitCode = 1;});
