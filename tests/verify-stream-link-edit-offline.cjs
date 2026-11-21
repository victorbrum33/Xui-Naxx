/* Contrato da edição de links: transporte simulado, sem painel, banco ou fontes. */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {TextDecoder, TextEncoder} = require('node:util');
let JSDOM, VirtualConsole;
try {({JSDOM, VirtualConsole} = require(process.env.NAXX_JSDOM || 'jsdom'));}
catch (error) {throw new Error('Instale jsdom ou defina NAXX_JSDOM para executar esta verificação offline.', {cause: error});}
const source = fs.readFileSync(path.join(__dirname, '../xui-naxx/src/stream-link-edit-ui.js'), 'utf8');
const importer = fs.readFileSync(path.join(__dirname, '../xui-naxx/src/importer.js'), 'utf8');
const csrf = 'a'.repeat(64);
const pause = () => new Promise(resolve => setImmediate(resolve));
const delay = duration => new Promise(resolve => setTimeout(resolve, duration));
async function until(check, label) {for (let index = 0; index < 1000; index++) {if (check()) return; await pause();} assert.fail(label);}
function deferred() {let resolve, reject; const promise = new Promise((yes, no) => {resolve = yes; reject = no;}); return {promise, resolve, reject};}
function plain(value) {return JSON.parse(JSON.stringify(value));}
function json(value, status = 200) {return {ok: status >= 200 && status < 300, status, redirected: false, json: async () => plain(value)};}
function change(id = '1') {return {id, name: '<img src=x onerror=alert(1)> Canal ' + id, old_sources: ['https://old-user:old-pass@old.example/live/old-user/old-pass/1.ts?token=old-secret|User-Agent=Agent'], new_sources: ['https://new-user:new-pass@new.example/live/new-user/new-pass/1.ts?token=new-secret|User-Agent=Agent'], old_logo: 'https://logos.example/1.png?key=logo-secret', new_logo: 'https://logos.example/2.png?key=next-secret'};}
function preview(ids, overrides = {}) {return Object.assign({ok: true, csrf, token: 'immutable-preview-token', expires_at: Math.floor(Date.now() / 1000) + 600, summary: {selected: ids.length, changed: ids.length, unchanged: 0, unmatched: 0, ambiguous: 0, invalid: 0}, changes: ids.slice(0, 100).map(change), issues: [], truncated: ids.length > 100}, overrides);}
function key(name) {return String(name).replace(/[\u0009-\u000d\u0020\u0085\u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000\ufeff]+/g, ' ').replace(/^ +| +$/g, '').replace(/[A-Z]/g, letter => letter.toLowerCase());}
function fixture(options = {}) {
  const errors = [], calls = [], posts = [], submits = [];
  const console = new VirtualConsole(); console.on('jsdomError', error => errors.push(error.message));
  const dom = new JSDOM('<!doctype html><form><input name="streams" value="rascunho"><input name="server_tree_data" value="arvore"><input name="user_agent" value="agente"><input type="checkbox" name="restart_on_edit" checked><div id="stream-selection"><table id="datatable-mass"></table></div><div id="stream-details"><input name="native_field" value="preservado"></div><button type="submit">Salvar nativo</button></form>', {url: 'https://panel.example' + (options.pathname || '/stream_mass'), runScripts: 'outside-only', virtualConsole: console});
  const window = dom.window, document = window.document;
  Object.defineProperty(document, 'readyState', {value: 'complete', configurable: true});
  window.TextDecoder = TextDecoder; window.TextEncoder = TextEncoder;
  window.rSelected = (options.selected || ['1', '2', '3']).slice();
  window.document.querySelector('form').addEventListener('submit', event => {event.preventDefault(); submits.push([...new window.FormData(event.target)]);});
  function response(payload, request, count) {
    if (!payload) return json({ok: true, csrf, limits: {selected: 50000}});
    if (payload.action === 'catalog') return json({ok: true, csrf, channels: payload.ids.map(id => ({id, name: 'Canal ' + id, match_key: key('Canal ' + id)}))});
    if (payload.action === 'preview') return json(preview(payload.ids));
    if (payload.action === 'apply') return json({ok: true, csrf, applied: 3, total: 3, next_cursor: 3, done: true, cache_pending: true});
    assert.fail('Ação inesperada ' + payload.action);
  }
  window.fetch = async (address, request = {}) => {
    const parsed = new URL(address), payload = request.body && request.headers['Content-Type'] === 'application/json' ? JSON.parse(request.body) : null;
    const call = {url: parsed, request, payload}; calls.push(call); if (payload) posts.push(payload);
    assert.equal(parsed.origin, 'https://panel.example', 'todo transporte usa o painel autenticado');
    if (parsed.pathname === '/naxx-import-url.php') {
      assert.equal(request.method, 'POST'); assert.equal(request.credentials, 'same-origin'); assert.equal(request.headers['X-Requested-With'], 'XMLHttpRequest');
      assert(options.download, 'download precisa de simulação explícita'); return options.download(call);
    }
    assert.equal(parsed.pathname, '/naxx-update.php'); assert.equal(parsed.searchParams.get('feature'), 'stream-link-edit');
    assert.equal(request.credentials, 'same-origin'); assert.equal(request.cache, 'no-store'); assert.equal(request.headers['X-Requested-With'], 'XMLHttpRequest');
    if (payload) {assert.equal(request.method, 'POST'); assert.equal(payload.csrf, csrf, 'todo POST tem CSRF');}
    return (options.respond || response)(payload, call, posts.length, h);
  };
  const h = {window, document, dom, calls, posts, submits, errors,
    control(name) {const node = document.querySelector('[data-naxx-link="' + name + '"]'); assert(node, name + ' existe'); return node;},
    click(name) {h.control(name).click();},
    set(name, value) {const node = h.control(name); if (node.type === 'checkbox') node.checked = value; else node.value = value; node.dispatchEvent(new window.Event(node.tagName === 'SELECT' || node.type === 'checkbox' ? 'change' : 'input', {bubbles: true}));},
    async review() {h.click('preview'); await until(() => !h.control('preview').disabled, 'a prévia deve terminar');},
    status() {return document.querySelector('.naxx-stream-link-edit__status')?.textContent || '';},
    close() {window.close();}
  };
  if (options.parser !== false) window.eval(importer);
  window.eval(source);
  return h;
}
function rules(h) {h.set('source-find', 'old.example'); h.set('source-replace', 'new.example');}
function framed(text, options = {}) {
  const data = new TextEncoder().encode(text), status = new TextEncoder().encode(JSON.stringify({ok: true, bytes: data.byteLength + (options.badBytes ? 1 : 0)}));
  const bytes = new Uint8Array(4 + data.byteLength + 8 + status.byteLength + (options.trailing ? 1 : 0)), view = new DataView(bytes.buffer);
  view.setUint32(0, data.byteLength); bytes.set(data, 4); view.setUint32(4 + data.byteLength, 0); view.setUint32(8 + data.byteLength, status.byteLength); bytes.set(status, 12 + data.byteLength);
  let offset = 0, canceled = false;
  return {ok: true, status: 200, redirected: false, headers: {get: name => name === 'X-Naxx-Stream-Protocol' ? '1' : null},
    body: {getReader: () => ({async read() {if (offset === bytes.length) return {done: true}; const value = bytes.subarray(offset, Math.min(offset + 7, bytes.length)); offset += value.length; return {done: false, value};}, async cancel() {canceled = true;}, releaseLock() {}})}, get canceled() {return canceled}};
}
(async () => {
  {
    const h = fixture();
    try {
      assert.equal(h.document.querySelectorAll('.naxx-stream-link-edit').length, 1);
      h.window.NaxxStreamLinkEdit.enhance(); assert.equal(h.document.querySelectorAll('.naxx-stream-link-edit').length, 1);
      assert.equal(h.calls.length, 0, 'montagem não faz leituras nem escritas');
      assert.deepEqual([...new h.window.FormData(h.document.querySelector('form'))], [['streams', 'rascunho'], ['server_tree_data', 'arvore'], ['user_agent', 'agente'], ['restart_on_edit', 'on'], ['native_field', 'preservado']], 'nenhum controle novo interfere no submit nativo');
      rules(h); h.set('logo', true); h.set('logo-mode', 'set'); h.set('logo-url', 'https://logos.example/new.png'); await h.review();
      assert.deepEqual(h.posts[0].operation, {kind: 'replace', source: {find: 'old.example', replace: 'new.example'}, logo: {mode: 'set', url: 'https://logos.example/new.png'}});
      assert.equal(h.posts.filter(post => post.action === 'apply').length, 0, 'prévia não aplica');
      const previewBox = h.document.querySelector('.naxx-stream-link-edit__preview');
      assert(!previewBox.textContent.includes('old-pass')); assert(!previewBox.textContent.includes('old-secret')); assert(!previewBox.textContent.includes('logo-secret'));
      assert.equal(previewBox.querySelectorAll('img, iframe, video, audio, a').length, 0, 'valores e nomes são texto; fontes/logos não são carregados');
      h.set('show', true); assert(previewBox.textContent.includes('old-secret'), 'revelação é local e explícita');
      h.click('apply'); await until(() => h.status().includes('3 canais atualizados.'), 'aplicação explícita termina');
      assert.deepEqual(h.posts[1], {action: 'apply', csrf, token: 'immutable-preview-token', cursor: 0});
      assert.equal(h.submits.length, 0, 'nem prévia nem aplicação disparam submit nativo');
      assert.equal(h.document.querySelector('[name="restart_on_edit"]').checked, true, 'não modifica campo de reinício nativo');
      assert(h.status().includes('próximos minutos')); assert.deepEqual(h.errors, []);
      console.log('UI nativa preservada; prévia autenticada, URLs mascaradas, texto seguro e escrita apenas por aplicação explícita.');
    } finally {h.close();}
  }
  {
    const h = fixture();
    try {
      rules(h); await h.review(); h.set('source-replace', 'later.example'); assert.equal(h.control('apply').disabled, true);
      await h.review(); h.window.rSelected.push('4'); h.click('apply'); await pause();
      assert.equal(h.posts.filter(post => post.action === 'apply').length, 0, 'alteração da seleção bloqueia aplicação imediatamente, sem depender do timer');
      assert(h.status().includes('mudaram'));
      await h.review(); h.window.rSelected = ['3']; await delay(300); assert.equal(h.control('apply').disabled, true);
      console.log('Mudanças de regra ou seleção invalidam a prévia, inclusive seleção fora da página atual.');
    } finally {h.close();}
    const late = deferred(), stale = fixture({respond: payload => !payload ? json({ok: true, csrf}) : late.promise});
    try {
      rules(stale); stale.click('preview'); await until(() => stale.posts.length, 'consulta iniciou');
      const pending = stale.calls.at(-1); stale.set('source-replace', 'changed.example'); assert.equal(pending.request.signal.aborted, true);
      late.resolve(json(preview(['1', '2', '3']))); await pause(); await pause();
      assert.equal(stale.control('apply').disabled, true); assert.equal(stale.document.querySelector('.naxx-stream-link-edit__preview').hidden, true);
    } finally {late.resolve(json(preview(['1', '2', '3']))); stale.close();}
  }
  {
    for (const pathname of ['/streams', '/movie', '/stream_mass/']) {
      const h = fixture({pathname}); try {assert.equal(h.document.querySelector('.naxx-stream-link-edit'), null);} finally {h.close();}
    }
    const h = fixture({pathname: '/stream_mass.php'});
    try {
      rules(h); await h.review(); h.window.history.pushState({}, '', '/streams'); h.window.NaxxStreamLinkEdit.enhance();
      assert.equal(h.document.querySelector('.naxx-stream-link-edit'), null); h.window.history.pushState({}, '', '/stream_mass'); h.window.NaxxStreamLinkEdit.enhance();
      assert.equal(h.document.querySelectorAll('.naxx-stream-link-edit').length, 1); assert.equal(h.control('apply').disabled, true);
    } finally {h.close();}
    console.log('Ciclo de vida: montagem exclusiva na edição em massa; navegação descarta prévia e remonta sem duplicar.');
  }
  {
    const h = fixture({respond(payload) {
      if (!payload) return json({ok: true, csrf});
      return json(preview(payload.ids, {token: null, expires_at: null, summary: {selected: 3, changed: 0, unchanged: 0, unmatched: 1, ambiguous: 1, invalid: 1}, changes: [], issues: [{id: 1, name: 'Ausente', reason: 'unmatched'}, {id: 2, name: 'Duplicado', reason: 'ambiguous'}, {id: 3, name: 'Inválido', reason: 'invalid'}]}));
    }});
    try {
      rules(h); await h.review(); assert.equal(h.control('apply').disabled, true); assert(h.status().includes('Nenhuma alteração'));
      const issues = h.document.querySelector('.naxx-stream-link-edit__issues'); assert.equal(issues.hidden, false); assert.equal(issues.querySelectorAll('li').length, 3); assert(issues.textContent.includes('Duplicado'));
    } finally {h.close();}
  }
  {
    for (const selected of [[], ['0'], ['9007199254740992'], Array.from({length: 50001}, (_, index) => String(index + 1))]) {
      const h = fixture({selected});
      try {rules(h); await h.review(); assert.equal(h.calls.length, 0, 'seleção inválida ou acima do limite não inicia requisições'); assert.equal(h.control('apply').disabled, true);} finally {h.close();}
    }
    const oversized = fixture({respond(payload) {if (!payload) return json({ok: true, csrf, limits: {request_bytes: 100}}); assert.fail('payload acima do limite não deve sair do navegador');}});
    try {rules(oversized); await oversized.review(); assert(oversized.status().includes('ultrapassam')); assert.equal(oversized.posts.length, 0);} finally {oversized.close();}
    for (const status of [413, 422, 503]) {
      const h = fixture({respond: payload => !payload ? json({ok: true, csrf}) : json({ok: false, message: 'Mensagem fixa do painel ' + status}, status)});
      try {rules(h); await h.review(); assert(h.status().includes('Mensagem fixa do painel')); assert.equal(h.control('apply').disabled, true);} finally {h.close();}
    }
    const expired = fixture({respond: payload => !payload ? json({ok: true, csrf}) : json(preview(payload.ids, {expires_at: Math.floor(Date.now() / 1000) - 1}))});
    try {rules(expired); await expired.review(); assert(expired.status().includes('expirou')); assert.equal(expired.control('apply').disabled, true);} finally {expired.close();}
    const conflict = fixture({respond(payload) {
      if (!payload) return json({ok: true, csrf}); if (payload.action === 'preview') return json(preview(payload.ids));
      return json({ok: false, applied: 1, message: 'Um canal mudou. Gere outra prévia.'}, 409);
    }});
    try {rules(conflict); await conflict.review(); conflict.click('apply'); await until(() => conflict.status().includes('1 canais já atualizados'), 'conflito informa progresso parcial'); assert.equal(conflict.control('apply').disabled, true); assert.equal(conflict.posts.filter(post => post.action === 'apply').length, 1);} finally {conflict.close();}
    console.log('Limites, CSRF, expiração, erros do painel e conflito parcial falham sem iniciar novas alterações.');
  }
  {
    const first = deferred(), h = fixture({respond(payload) {
      if (!payload) return json({ok: true, csrf}); if (payload.action === 'preview') return json(preview(payload.ids));
      if (payload.cursor === 0) return first.promise;
      return json({ok: true, csrf, applied: 3, total: 3, next_cursor: 3, done: true, cache_pending: true});
    }});
    try {
      rules(h); await h.review(); h.click('apply'); await until(() => h.posts.some(post => post.action === 'apply'), 'primeiro lote iniciou');
      h.click('stop-apply'); first.resolve(json({ok: true, csrf, applied: 1, total: 3, next_cursor: 1, done: false, cache_pending: true}));
      await until(() => !h.control('apply').disabled, 'pausa aguarda lote');
      assert.equal(h.posts.filter(post => post.action === 'apply').length, 1); assert(h.status().includes('1 canais atualizados'));
      h.click('apply'); await until(() => h.status().includes('3 canais atualizados.'), 'retomada terminou');
      assert.deepEqual(h.posts.filter(post => post.action === 'apply').map(post => post.cursor), [0, 1]);
    } finally {first.resolve(json({ok: true, csrf, applied: 1, total: 3, next_cursor: 1, done: false})); h.close();}
    let attempts = 0;
    const retry = fixture({respond(payload) {
      if (!payload) return json({ok: true, csrf}); if (payload.action === 'preview') return json(preview(payload.ids));
      if (++attempts === 1) throw new TypeError('simulated disconnect');
      return json({ok: true, csrf, applied: 3, total: 3, next_cursor: 3, done: true, cache_pending: true});
    }});
    try {
      rules(retry); await retry.review(); retry.click('apply'); await until(() => !retry.control('apply').disabled, 'erro habilita retomada');
      assert(retry.status().includes('Retome a mesma prévia')); retry.click('apply'); await until(() => retry.status().includes('3 canais atualizados.'), 'retry terminou');
      assert.deepEqual(retry.posts.filter(post => post.action === 'apply').map(post => post.cursor), [0, 0], 'resposta incerta repete somente o cursor idempotente');
    } finally {retry.close();}
    console.log('Lotes: parada após lote, retomada pelo cursor seguinte e repetição idempotente do mesmo cursor após queda de rede.');
  }
  {
    const list = '#EXTM3U\n#EXTINF:-1 tvg-logo="https://logos.example/a.png",  CANAL\u0085 1  \nhttps://media.example/1\n#EXTINF:-1,Canal 2\nhttps://media.example/2\n#EXTINF:-1,Canal 2\nhttps://media.example/2\n#EXTINF:-1,Canal 2\nhttps://media.example/2\n#EXTINF:-1,Canal Novo\nhttps://media.example/new\n';
    const h = fixture({download: () => framed(list)});
    try {
      h.set('mode', 'm3u'); h.set('input-mode', 'url'); h.set('url', 'https://provider.example/list.m3u?token=secret'); await h.review();
      const update = h.posts.find(post => post.action === 'preview').operation;
      assert.equal(update.kind, 'm3u'); assert.equal(update.update_source, true); assert.equal(update.update_logo, true);
      assert.equal(update.items.length, 3, 'só selecionados; no máximo duas evidências por nome');
      assert.equal(update.items.filter(item => key(item.name) === 'canal 2').length, 2, 'URLs iguais não apagam ambiguidade');
      assert(update.items[0].logo.includes('a.png'));
      assert.equal(h.calls.filter(call => call.url.pathname === '/naxx-import-url.php').length, 1);
      assert.equal(h.posts.filter(post => post.action === 'apply').length, 0);
      assert(h.document.querySelector('.naxx-stream-link-edit__import').textContent.includes('fontes alternativas'));
    } finally {h.close();}
    for (const options of [{badBytes: true}, {trailing: true}]) {
      const bad = fixture({download: () => framed(list, options)});
      try {bad.set('mode', 'm3u'); bad.set('input-mode', 'url'); bad.set('url', 'https://provider.example/list'); await bad.review(); assert.equal(bad.posts.filter(post => post.action === 'preview').length, 0); assert.equal(bad.control('apply').disabled, true);} finally {bad.close();}
    }
    console.log('M3U por URL: proxy autenticado, protocolo completo obrigatório, matching conservador e duplicatas preservadas.');
  }
  {
    const h = fixture({selected: ['1', '2'], download: () => framed('#EXTM3U\n#EXTINF:-1,Canal 1\nhttps://media.example/1\n'), respond(payload) {
      if (!payload) return json({ok: true, csrf});
      if (payload.action === 'catalog') return json({ok: true, csrf, channels: [{id: '1', name: 'Canal 1', match_key: 'canal 1'}, {id: '2', name: 'Nome inválido', match_key: null}]});
      assert.equal(payload.action, 'preview'); assert.equal(payload.operation.items.length, 1);
      return json(preview(payload.ids, {summary: {selected: 2, changed: 1, unchanged: 0, unmatched: 0, ambiguous: 0, invalid: 1}, changes: [change('1')], issues: [{id: '2', name: 'Nome inválido', reason: 'Nome do canal inválido para correspondência.'}]}));
    }});
    try {
      h.set('mode', 'm3u'); h.set('input-mode', 'url'); h.set('url', 'https://provider.example/list'); await h.review();
      assert.equal(h.control('apply').disabled, false, 'nome inválido não bloqueia canais válidos da seleção');
      assert.equal(h.document.querySelectorAll('.naxx-stream-link-edit__issues li').length, 1);
      assert(h.document.querySelector('.naxx-stream-link-edit__issues').textContent.includes('Nome do canal inválido'));
    } finally {h.close();}
    console.log('Nome existente inválido é ignorado no pré-filtro e revisado como inválido pelo servidor; os canais válidos continuam disponíveis.');
  }
  {
    const h = fixture({parser: false});
    try {
      h.set('mode', 'm3u');
      const file = new h.window.File(['#EXTM3U\n#EXTINF:-1,Canal 1\nhttps://media.example/1\n'], 'list.m3u');
      Object.defineProperty(h.control('file'), 'files', {value: [file], configurable: true}); h.control('file').dispatchEvent(new h.window.Event('change', {bubbles: true}));
      h.click('preview'); await until(() => h.document.querySelector('script[src]'), 'parser é carregado sob demanda');
      const script = h.document.querySelector('script[src]'); assert.equal(script.src, 'https://panel.example/assets/js/naxx-importer.js'); h.window.eval(importer); script.dispatchEvent(new h.window.Event('load'));
      await until(() => !h.control('preview').disabled, 'lista local analisada'); assert.equal(h.posts.find(post => post.action === 'preview').operation.items.length, 1);
    } finally {h.close();}
    console.log('Leitor M3U é carregado sob demanda fora da página do importador; arquivo não é enviado ao painel.');
  }
  {
    const selected = Array.from({length: 50000}, (_, index) => String(index + 1));
    const h = fixture({selected});
    try {
      h.set('mode', 'm3u');
      const chunks = ['#EXTM3U\n'];
      for (let index = 0; index < 300000; index++) chunks.push('#EXTINF:-1,Outro ' + index + '\nhttps://media.example/' + index + '\n');
      chunks.push('#EXTINF:-1,Canal 1\nhttps://media.example/a\n#EXTINF:-1,Canal 1\nhttps://media.example/a\n#EXTINF:-1,Canal 1\nhttps://media.example/a\n#EXTINF:-1,Canal 50000\nhttps://media.example/last\n');
      const file = new h.window.File(chunks, '300k.m3u'); chunks.length = 0;
      Object.defineProperty(h.control('file'), 'files', {value: [file], configurable: true}); h.control('file').dispatchEvent(new h.window.Event('change', {bubbles: true}));
      h.click('preview');
      for (let count = 0; count < 400 && h.control('preview').disabled; count++) await delay(50);
      assert.equal(h.control('preview').disabled, false, '300k entradas terminam dentro de 20s');
      const payload = h.posts.find(post => post.action === 'preview'); assert(payload, h.status());
      assert.equal(payload.ids.length, 50000); assert.equal(payload.operation.items.length, 3, '300k entradas não são retidas nem enviadas; apenas candidatos e duplicatas dos selecionados');
      assert.equal(h.document.querySelectorAll('.naxx-stream-link-edit__preview tbody tr').length, 100, 'DOM limitado a 100 amostras');
      assert.equal(h.posts.filter(post => post.action === 'apply').length, 0); assert.deepEqual(h.errors, []);
    } finally {h.close();}
    console.log('Escala: 50.000 selecionados + lista com 300.004 entradas; memória e payload limitados aos candidatos selecionados, DOM limitado a 100 linhas.');
  }
  console.log('Verificação offline de links e logos concluída sem HTTP, cadastro novo ou alteração real de canais.');
})().catch(error => {console.error(error); process.exitCode = 1;});
