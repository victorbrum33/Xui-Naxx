/* Executa o módulo real com contratos DOM/HTTP/nativo simulados; não usa rede. */
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');

const source = fs.readFileSync(path.join(__dirname, '../xui-naxx/src/ondemand-ui.js'), 'utf8');
const validProbe = () => ({format: {format_name: 'mpegts', filename: 'https://private.example/token'},
  streams: [{codec_type: 'video', codec_name: 'h264', tags: {private: 'discard'}}, {codec_type: 'audio', codec_name: 'aac'}], secret: 'discard'});
const clone = value => JSON.parse(JSON.stringify(value));

class Element {
  constructor(tag, properties = {}) { Object.assign(this, {tagName: tag.toUpperCase(), children: [], listeners: new Map(), attributes: {}, dataset: {}, disabled: false, hidden: false, value: '', checked: false, parentNode: null, isConnected: true, textContent: ''}, properties); }
  appendChild(child) { child.parentNode = this; this.children.push(child); return child; }
  setAttribute(key, value) { this.attributes[key] = String(value); }
  addEventListener(name, callback) { if (!this.listeners.has(name)) this.listeners.set(name, []); this.listeners.get(name).push(callback); }
  fire(name, target = this) { for (const callback of this.listeners.get(name) || []) callback({target, preventDefault() {}}); }
}
class Data {
  constructor(form) {
    this.items = [];
    if (!form) return;
    for (const control of form.controls) {
      if (!control.name || control.disabled || ['submit', 'button'].includes(control.type) || control.type === 'checkbox' && !control.checked) continue;
      if (control.multiple) for (const option of control.children) { if (option.selected) this.append(control.name, option.value); }
      else this.append(control.name, control.value);
    }
  }
  get(name) { return this.items.find(value => value[0] === name)?.[1] ?? null; }
  getAll(name) { return this.items.filter(value => value[0] === name).map(value => value[1]); }
  has(name) { return this.items.some(value => value[0] === name); }
  append(name, value) { this.items.push([name, String(value)]); }
  set(name, value) { this.items = this.items.filter(item => item[0] !== name); this.append(name, value); }
}

function makeForm({id = '2421', imported = false, direct = false, sources = ['https://source.example/signed?key=private'], onDemand = ['1'], mode = '0'} = {}) {
  const form = new Element('form', {id: 'stream_form', controls: []});
  function add(tag, properties) { const control = new Element(tag, properties); form.controls.push(control); return control; }
  if (id !== null) add('input', {type: 'hidden', name: 'edit', value: id});
  if (imported) add('input', {type: 'file', name: 'm3u_file'});
  const select = add('select', {id: 'llod', name: 'llod', value: mode});
  for (const value of ['0', '1', '2']) select.appendChild(new Element('option', {value}));
  const parent = new Element('div'); parent.appendChild(select);
  sources.forEach(value => add('input', {name: 'stream_source[]', value}));
  const servers = add('select', {name: 'on_demand[]', id: 'on_demand', multiple: true});
  for (const value of ['1', '2']) servers.appendChild(new Element('option', {value, selected: onDemand.includes(value)}));
  add('input', {type: 'checkbox', name: 'direct_source', value: 'on', checked: direct});
  add('input', {type: 'checkbox', name: 'enable_transcode', value: 'on', checked: false});
  add('select', {name: 'transcode_profile_id', value: '0'});
  add('input', {name: 'custom_ffmpeg', value: ''}); add('input', {name: 'delay_minutes', value: '0'});
  for (const name of ['user_agent', 'http_proxy', 'cookie', 'headers']) add('input', {name, value: ''});
  const submit = add('button', {type: 'submit', name: '', disabled: false});
  form.querySelector = selector => {
    if (selector === 'input[name="edit"]') return form.controls.find(x => x.name === 'edit') || null;
    if (selector === 'select#llod') return select;
    if (selector === 'input[name="m3u_file"]') return form.controls.find(x => x.name === 'm3u_file') || null;
    if (selector === '[name="direct_source"]') return form.controls.find(x => x.name === 'direct_source');
    throw new Error('Seletor inesperado no mock: ' + selector);
  };
  form.querySelectorAll = selector => {
    assert.equal(selector, 'input[type="submit"],button[type="submit"]'); return [submit];
  };
  return {form, select, parent, submit, field(name) { return form.controls.find(x => x.name === name); }};
}

function fixture(options = {}) {
  const created = [], calls = {fetch: [], native: [], ajax: [], callbacks: [], errors: 0, select2: 0}, timers = new Map();
  const jqueryEvents = new Map();
  let clock = 0, timerId = 0;
  const initial = makeForm(options);
  const forms = [initial.form];
  const document = {readyState: 'complete', body: {}, createElement(tag) { const element = new Element(tag); created.push(element); return element; },
    querySelectorAll(selector) { assert.equal(selector, 'form#stream_form'); return forms.filter(form => form.isConnected); }, addEventListener() {}};
  const jq = target => ({
    on(name, callback) {
      if (!jqueryEvents.has(target)) jqueryEvents.set(target, new Map());
      const events = jqueryEvents.get(target);
      if (!events.has(name)) events.set(name, []);
      events.get(name).push(callback);
      return this;
    },
    off(name) { if (jqueryEvents.has(target)) jqueryEvents.get(target).delete(name); return this; },
    trigger(name) {
      if (name === 'change.select2') calls.select2++;
      const [type, namespace] = name.split('.');
      const dispatch = node => {
        for (const [registered, callbacks] of jqueryEvents.get(node) || []) {
          const [registeredType, registeredNamespace] = registered.split('.');
          if (registeredType === type && (!namespace || namespace === registeredNamespace))
            callbacks.forEach(callback => callback({type, target}));
        }
      };
      // jQuery-synthetic events intentionally do not fire DOM addEventListener.
      dispatch(target);
      const owner = forms.find(form => form.controls.includes(target));
      if (owner && owner !== target) dispatch(owner);
      return this;
    }, show() {}, hide() {}
  });
  jq.ajax = function (settings) { calls.ajax.push(settings); return {abort() {}}; };
  const window = {
    location: {href: 'https://panel.example/access/stream?id=2421'}, jQuery: jq,
    setTimeout(callback, milliseconds) { const id = ++timerId; timers.set(id, {callback, due: clock + milliseconds, milliseconds}); return id; },
    clearTimeout(id) { timers.delete(id); },
    callbackForm(result) { calls.callbacks.push(result); },
    submitForm(type, data, referer) {
      calls.native.push({type, data, referer});
      return jq.ajax({type: 'POST', url: 'post.php?action=' + encodeURIComponent(type), data, error() { calls.errors++; },
        success(raw) { let result; try { result = JSON.parse(raw); } catch { result = {status: 0}; } window.callbackForm(result); }});
    }
  };
  function response(value, url, ok = true, status = ok ? 200 : 500) { return {ok, url, status, async json() { return clone(value); }}; }
  window.fetch = async function (url, settings) {
    const record = {url: new URL(url), settings}; calls.fetch.push(record);
    if (record.url.pathname.endsWith('/api')) {
      assert.equal(record.url.searchParams.get('map'), '1', 'O contrato nativo exige map=1 para responder JSON, em vez de HTML de resumo.');
      if (options.probe) return options.probe(record, response, api);
      return response(validProbe(), url);
    }
    if (settings.method === 'POST') {
      record.body = JSON.parse(settings.body);
      if (options.post) { const override = options.post(record, response, api); if (override !== undefined) return override; }
      if (record.body.action === 'plan') {
        const fallback = record.body.observations.some(value => value.error) || !record.body.observations.length;
        return response({ok: true, csrf: 'csrf-after-plan', plan: {nonce: 'a'.repeat(64), mode: fallback ? 0 : 2, reason: 'Fonte analisada.', format: fallback ? 'unknown' : 'mpegts', verified: !fallback}}, url);
      }
      if (record.body.action === 'commit') {
        const saved = calls.native.filter(call => call.type === 'stream').at(-1);
        return response({ok: true, profile: {active: true, mode: Number(saved.data.get('llod')), previous_mode: 0, reason: 'Modo confirmado.'}}, url);
      }
      if (record.body.action === 'deactivate') return response({ok: true, csrf: 'csrf-after-deactivate'}, url);
      throw new Error('Ação não simulada');
    }
    if (options.status) return options.status(record, response, api);
    return response({ok: true, feature: 'ondemand', csrf: 'csrf-initial', native: {mode: Number(options.mode || 0), on_demand_servers: [1]},
      profile: options.profile || {active: false}, capabilities: {mpegts: [2, 1, 0]}}, url);
  };
  const context = vm.createContext({window, document, FormData: Data, URL, AbortController, Promise, Set, Map,
    Date: class extends Date { static now() { return clock; } },
    MutationObserver: class { observe() {} }, console});
  const api = Object.assign(initial, {window, calls, created, timers, forms, response,
    controls() { const box = initial.parent.children.find(x => x.className === 'naxx-ondemand-profile mt-2'); return box ? {box, status: box.children[0], analyze: box.children[1], restore: box.children[2]} : null; },
    auto() { initial.select.value = 'naxx_auto'; initial.select.fire('change'); },
    select2(value) { initial.select.value = value; jq(initial.select).trigger('change'); },
    jqueryChange(control) { jq(control).trigger('change'); },
    jqueryHandlers(control) { return [...(jqueryEvents.get(control)?.values() || [])].reduce((sum, handlers) => sum + handlers.length, 0); },
    submit(type = 'stream', data = new Data(initial.form)) { initial.submit.disabled = true; return window.submitForm(type, data, 'streams'); },
    finish(value = {status: 1, location: 'streams'}, index = 0) { return calls.ajax[index].success(JSON.stringify(value)); },
    posts(action) { return calls.fetch.filter(x => x.body && (!action || x.body.action === action)); },
    probes() { return calls.fetch.filter(x => x.url.pathname.endsWith('/api')); },
    addForm(config) { const next = makeForm(config); forms.push(next.form); return next; },
    advance(milliseconds) { clock += milliseconds; const ready = [...timers].filter(([, timer]) => timer.due <= clock); for (const [id, timer] of ready) { timers.delete(id); timer.callback(); } }
  });
  vm.runInContext(source, context);
  return api;
}

async function settle() { for (let i = 0; i < 35; i++) await Promise.resolve(); }
function assertNativeModes(api) { for (const call of api.calls.native.filter(x => x.type === 'stream')) assert.match(call.data.get('llod') || '', /^[012]$/); }

(async () => {
  // Escolha automática se torna um modo nativo antes do único POST e só persiste depois.
  const first = fixture(); await settle(); first.auto(); await first.submit(); await settle();
  assert.equal(first.calls.native.length, 1); assert.equal(first.calls.native[0].data.get('llod'), '2');
  assert.equal(first.posts('commit').length, 0); assert.equal(first.posts('plan')[0].body.csrf, 'csrf-initial');
  const sentObservation = first.posts('plan')[0].body.observations[0];
  assert.deepEqual(sentObservation, {format: {format_name: 'mpegts'}, streams: [{codec_type: 'video', codec_name: 'h264'}, {codec_type: 'audio', codec_name: 'aac'}]});
  first.finish(); await settle();
  assert.equal(first.posts('commit').length, 1); assert.equal(first.posts('commit')[0].body.csrf, 'csrf-after-plan');
  assert.equal(first.calls.callbacks.length, 1); assertNativeModes(first);

  // Select2 emite change sintético do jQuery; a opção deve atualizar a UI sem evento DOM.
  const plugin = fixture(); await settle();
  assert.equal(plugin.controls().analyze.disabled, true);
  plugin.select2('naxx_auto');
  assert.equal(plugin.controls().analyze.disabled, false);
  assert.match(plugin.controls().status.textContent, /Analisa as fontes/);
  plugin.window.NaxxOnDemand.enhance(); plugin.window.NaxxOnDemand.enhance();
  assert.equal(plugin.jqueryHandlers(plugin.select), 1);
  assert.equal(plugin.jqueryHandlers(plugin.form), 1);
  plugin.controls().analyze.fire('click'); plugin.controls().analyze.fire('click'); await settle();
  assert.equal(plugin.probes().length, 1); assert.equal(plugin.posts('plan').length, 1);
  const demandSelect = plugin.field('on_demand[]');
  demandSelect.children[0].selected = false; plugin.jqueryChange(demandSelect);
  demandSelect.children[0].selected = true; plugin.jqueryChange(demandSelect);
  plugin.controls().analyze.fire('click'); await settle();
  assert.equal(plugin.probes().length, 2, 'Alterar servidores pelo Select2 invalida o plano em cache');
  plugin.select2('1');
  assert.equal(plugin.controls().analyze.disabled, true);
  assert.match(plugin.controls().status.textContent, /Modo manual selecionado/);
  plugin.select2('naxx_auto');
  plugin.field('direct_source').checked = true; plugin.jqueryChange(plugin.field('direct_source'));
  assert.equal(plugin.controls().analyze.disabled, true);
  assert.notEqual(plugin.select.value, 'naxx_auto');
  plugin.form.isConnected = false; plugin.window.NaxxOnDemand.enhance();
  assert.equal(plugin.jqueryHandlers(plugin.select), 0);
  assert.equal(plugin.jqueryHandlers(plugin.form), 0);

  // Erro nativo não grava metadata nem bloqueia o tratamento de erros original.
  const rejected = fixture(); await settle(); rejected.auto(); await rejected.submit(); rejected.finish({status: 0, result: false}); await settle();
  assert.equal(rejected.posts('commit').length, 0); assert.equal(rejected.posts('deactivate').length, 0);
  assert.equal(rejected.calls.callbacks.length, 1); assert.equal(rejected.select.disabled, false); assertNativeModes(rejected);

  // Outro formulário pode receber sua resposta enquanto o canal aguarda seu próprio callback.
  const other = fixture(); await settle(); other.auto(); await other.submit();
  const movie = new Data(); movie.set('edit', '2421'); movie.set('title', 'Exemplo');
  other.window.submitForm('movie', movie); other.finish({status: 1, location: 'movies'}, 1); await settle();
  assert.equal(other.posts('commit').length, 0); assert.equal(other.calls.callbacks[0].location, 'movies');
  other.finish({status: 1, location: 'streams'}, 0); await settle(); assert.equal(other.posts('commit').length, 1);

  // Status restaura a opção virtual; restaurar o modo anterior usa o Save nativo e remove só metadata.
  const saved = fixture({mode: '2', profile: {active: true, mode: 2, previous_mode: 1, reason: 'TS validado.'}}); await settle();
  assert.equal(saved.select.value, 'naxx_auto'); assert.equal(saved.controls().restore.hidden, false);
  saved.controls().restore.fire('click'); assert.equal(saved.select.value, '1'); assert.equal(saved.calls.native.length, 0);
  saved.submit(); assert.equal(saved.calls.native[0].data.get('llod'), '1'); saved.finish(); await settle();
  assert.equal(saved.posts('deactivate').length, 1); assert.equal(saved.posts('plan').length, 0); assert.equal(saved.calls.callbacks.length, 1);

  // Sem perfil ativo, os modos manuais não passam pela análise nem pela persistência NAXX.
  const manual = fixture({mode: '1'}); await settle(); manual.submit();
  assert.equal(manual.calls.native.length, 1); assert.equal(manual.posts().length, 0);
  for (const config of [{id: null}, {id: '0'}, {imported: true}]) {
    const missing = fixture(config); await settle();
    assert.equal(missing.controls(), null); assert.equal(missing.calls.fetch.length, 0);
    missing.submit(); assert.equal(missing.calls.native.length, 1);
  }

  // Serviço antigo/ausente nunca habilita a opção, e o caminho manual continua utilizável.
  const oldServer = fixture({status(record, response) { return response({ok: true, feature: 'updates', csrf: 'wrong'}, record.url.href); }}); await settle();
  assert.equal(oldServer.select.children.find(x => x.value === 'naxx_auto').disabled, true);
  oldServer.submit(); assert.equal(oldServer.calls.native.length, 1);
  oldServer.auto(); await oldServer.submit(); assert.equal(oldServer.calls.native.length, 1);
  assertNativeModes(oldServer);

  // Sessão recusada orienta novo login; não vira fallback de probe nem tenta salvar.
  for (const status of [401, 403]) {
    const expired = fixture({status(record, response) { return response({ok: false}, record.url.href, false, status); }}); await settle();
    assert.match(expired.controls().status.textContent, /sessão|permissão/);
    assert.match(expired.controls().status.textContent, /Entre novamente/);
    assert.equal(expired.controls().status.attributes.role, 'alert');
    assert.equal(expired.select.children.find(x => x.value === 'naxx_auto').disabled, true);
    const probeDenied = fixture({probe(record, response) { return response({}, record.url.href, false, status); }});
    await settle(); probeDenied.auto(); await probeDenied.submit(); await settle();
    assert.equal(probeDenied.calls.native.length, 0); assert.equal(probeDenied.posts('plan').length, 0);
    assert.match(probeDenied.controls().status.textContent, /Entre novamente/);
    assert.equal(probeDenied.form.controls.find(x => x.type === 'submit').disabled, false);
  }
  const loginRedirect = fixture({probe(record, response) { return response({}, 'https://panel.example/access/login.php'); }});
  await settle(); loginRedirect.auto(); await loginRedirect.submit(); await settle();
  assert.equal(loginRedirect.calls.native.length, 0); assert.equal(loginRedirect.posts('plan').length, 0);
  assert.match(loginRedirect.controls().status.textContent, /Entre novamente/);
  const planDenied = fixture({post(record, response) { if (record.body.action === 'plan') return response({ok: false}, record.url.href, false, 403); }});
  await settle(); planDenied.auto(); await planDenied.submit(); await settle();
  assert.equal(planDenied.calls.native.length, 0); assert.match(planDenied.controls().status.textContent, /Entre novamente/);

  // Fonte direta e falta de servidor sob demanda falham antes de probe/POST nativo.
  for (const config of [{direct: true}, {onDemand: []}, {sources: []}]) {
    const incompatible = fixture(config); await settle();
    if (config.direct) { assert.equal(incompatible.select.children.find(x => x.value === 'naxx_auto').disabled, true); incompatible.select.value = 'naxx_auto'; }
    else incompatible.auto();
    await incompatible.submit(); await settle();
    assert.equal(incompatible.probes().length, 0); assert.equal(incompatible.calls.native.length, 0);
    assert.equal(incompatible.form.controls.find(x => x.type === 'submit').disabled, false);
  }

  // Probe malformado/falha vira observação segura e permite fallback explícito para modo0.
  for (const probe of [async () => { throw new Error('segredo não deve aparecer'); }, async (record, response) => response({bad: true}, record.url.href)]) {
    const fallback = fixture({probe}); await settle(); fallback.auto(); await fallback.submit(); await settle();
    assert.deepEqual(fallback.posts('plan')[0].body.observations, [{error: 'probe_failed'}]);
    assert.equal(fallback.calls.native[0].data.get('llod'), '0'); assertNativeModes(fallback);
    assert(!fallback.controls().status.textContent.includes('segredo'));
    fallback.finish(); await settle(); assert.equal(fallback.calls.callbacks.length, 1, 'Fallback 0 confirmado também conclui o Save');
  }

  // Tempo total de probe é20s, com um pedido por vez e no máximo três fontes.
  const timed = fixture({sources: ['https://one.example/live', 'https://two.example/live', 'https://three.example/live'],
    probe(record) { return new Promise((resolve, reject) => record.settings.signal.addEventListener('abort', () => reject(new Error('aborted')), {once: true})); }});
  await settle(); timed.auto(); const timedSave = timed.submit(); await settle();
  assert.equal(timed.probes().length, 1); timed.advance(8000); await settle(); assert.equal(timed.probes().length, 2);
  timed.advance(8000); await settle(); assert.equal(timed.probes().length, 3);
  assert([...timed.timers.values()].some(timer => timer.milliseconds === 4000));
  timed.advance(4000); await timedSave; await settle();
  assert.equal(timed.calls.native.length, 1); assert.equal(timed.calls.native[0].data.get('llod'), '0');
  assert.equal(timed.posts('plan')[0].body.observations.length, 3);
  const many = fixture({sources: ['1', '2', '3', '4'].map(x => 'https://source.example/' + x)}); await settle(); many.auto(); await many.submit();
  assert.equal(many.probes().length, 0); assert.equal(many.calls.native[0].data.get('llod'), '0');

  // Alteração da fonte durante o probe invalida a análise inteira, sem enviar dados antigos.
  let resolveProbe;
  const changed = fixture({probe(record, response) { return new Promise(resolve => { resolveProbe = () => resolve(response(validProbe(), record.url.href)); }); }});
  await settle(); changed.auto(); const changedSave = changed.submit(); await settle();
  changed.field('stream_source[]').value = 'https://source.example/new-secret'; resolveProbe(); await changedSave; await settle();
  assert.equal(changed.calls.native.length, 0); assert.equal(changed.posts('plan').length, 0);
  assert.match(changed.controls().status.textContent, /mudaram durante/); assert(!changed.controls().status.textContent.includes('new-secret'));

  // Cliques repetidos compartilham a operação em andamento; análise manual pode ser reutilizada no Save.
  let release;
  const duplicate = fixture({probe(record, response) { return new Promise(resolve => { release = () => resolve(response(validProbe(), record.url.href)); }); }});
  await settle(); duplicate.auto(); const one = duplicate.submit(); duplicate.submit(); await settle();
  assert.equal(duplicate.probes().length, 1); release(); await one; await settle();
  assert.equal(duplicate.calls.native.length, 1); duplicate.finish(); await settle(); assert.equal(duplicate.posts('commit').length, 1);
  const analyzed = fixture(); await settle(); analyzed.auto(); analyzed.controls().analyze.fire('click'); await settle();
  assert.equal(analyzed.calls.native.length, 0); assert.equal(analyzed.posts('plan').length, 1);
  await analyzed.submit(); assert.equal(analyzed.probes().length, 1); assert.equal(analyzed.posts('plan').length, 1);

  // Metadata recusada depois do Save não apresenta sucesso nem navega; mostra o modo efetivamente enviado.
  const commitFailure = fixture({post(record, response) { if (record.body.action === 'commit') return response({ok: false}, record.url.href, false); }});
  await settle(); commitFailure.auto(); await commitFailure.submit(); commitFailure.finish(); await settle();
  assert.equal(commitFailure.calls.native.length, 1); assert.equal(commitFailure.calls.callbacks.length, 0);
  assert.equal(commitFailure.select.value, '2'); assert.equal(commitFailure.form.controls.find(x => x.type === 'submit').disabled, false);
  assert.match(commitFailure.controls().status.textContent, /canal foi salvo/);

  // ok:true só confirma Automático quando o perfil salvo está ativo no modo solicitado.
  for (const payload of [{ok: true}, {ok: true, profile: {active: false, mode: 2}}, {ok: true, profile: {active: true, mode: 1}}]) {
    const inconsistent = fixture({post(record, response) { if (record.body.action === 'commit') return response(payload, record.url.href); }});
    await settle(); inconsistent.auto(); await inconsistent.submit(); inconsistent.finish(); await settle();
    assert.equal(inconsistent.calls.callbacks.length, 0, 'Perfil incompleto ou divergente não deve navegar como sucesso');
    assert.equal(inconsistent.select.value, '2'); assert.equal(inconsistent.select.disabled, false);
    assert.equal(inconsistent.form.controls.find(x => x.type === 'submit').disabled, false);
    assert.match(inconsistent.controls().status.textContent, /canal foi salvo.*perfil.*não foi confirmado/);
  }

  // Respostas tardias da página anterior não podem chamar os callbacks da página atual.
  const lateError = fixture(); await settle(); lateError.auto(); await lateError.submit();
  lateError.form.isConnected = false; lateError.window.NaxxOnDemand.enhance();
  lateError.finish({status: 0, result: false}); await settle();
  assert.equal(lateError.calls.callbacks.length, 0); assert.equal(lateError.posts('commit').length, 0);
  const lateTransportError = fixture(); await settle(); lateTransportError.auto(); await lateTransportError.submit();
  lateTransportError.form.isConnected = false; lateTransportError.window.NaxxOnDemand.enhance();
  lateTransportError.calls.ajax[0].error(); assert.equal(lateTransportError.calls.errors, 0);
  const liveTransportError = fixture(); await settle(); liveTransportError.auto(); await liveTransportError.submit();
  liveTransportError.calls.ajax[0].error(); assert.equal(liveTransportError.calls.errors, 1);
  const lateSuccess = fixture(); await settle(); lateSuccess.auto(); await lateSuccess.submit();
  lateSuccess.form.isConnected = false; lateSuccess.window.NaxxOnDemand.enhance(); lateSuccess.finish(); await settle();
  assert.equal(lateSuccess.posts('commit').length, 1, 'Save já confirmado ainda registra a escolha solicitada');
  assert.equal(lateSuccess.calls.callbacks.length, 0, 'Confirmar metadata não deve navegar a página nova');

  // Formulário desconectado cancela análise e não envia para uma página que já saiu da tela.
  const departed = fixture({probe(record) { return new Promise((resolve, reject) => record.settings.signal.addEventListener('abort', () => reject(new Error('aborted')), {once: true})); }});
  await settle(); departed.auto(); const departedSave = departed.submit(); await settle(); departed.form.isConnected = false; departed.window.NaxxOnDemand.enhance(); await departedSave; await settle();
  assert.equal(departed.calls.native.length, 0);
  const stale = new Data(); stale.set('edit', '2421'); stale.set('llod', 'naxx_auto');
  departed.window.submitForm('stream', stale); assert.equal(departed.calls.native.length, 0, 'FormData virtual órfão não chega ao nativo');
  const initialOptions = first.select.children.length; first.window.NaxxOnDemand.enhance(); first.window.NaxxOnDemand.enhance();
  assert.equal(first.select.children.length, initialOptions, 'Enhance não duplica opções ou controles');

  // Editar outro campo enquanto status carrega preserva o perfil automático já salvo.
  let resolveStatus;
  const statusRace = fixture({status(record, response) { return new Promise(resolve => { resolveStatus = () => resolve(response({ok: true, feature: 'ondemand', csrf: 'csrf', profile: {active: true, mode: 2, previous_mode: 0}}, record.url.href)); }); }});
  statusRace.field('stream_source[]').value = 'https://source.example/updated';
  statusRace.form.fire('change', statusRace.field('stream_source[]')); resolveStatus(); await settle();
  assert.equal(statusRace.select.value, 'naxx_auto');
  assertNativeModes(duplicate); assertNativeModes(commitFailure);
  const fetchArguments = fixture(); await settle();
  fetchArguments.field('user_agent').value = 'FixtureAgent/1.0';
  fetchArguments.field('http_proxy').value = '127.0.0.1:8080';
  fetchArguments.field('cookie').value = 'private-cookie=value';
  fetchArguments.field('headers').value = 'X-Fixture: private-header';
  fetchArguments.auto(); await fetchArguments.submit();
  assert.deepEqual(fetchArguments.posts('plan')[0].body.draft.flags.fetch,
    {user_agent: 'FixtureAgent/1.0', proxy: '127.0.0.1:8080', cookie: 'private-cookie=value', headers: 'X-Fixture: private-header'});
  assert(!fetchArguments.controls().status.textContent.includes('private-cookie'));
  assert(!fetchArguments.controls().status.textContent.includes('private-header'));
  console.log('NAXX Automático: POST nativo numérico único, CSRF/perfil confirmado, sessão expirada, modos manuais, timeout/fallback, races, respostas tardias e navegação passaram. Sem rede.');
})().catch(error => { console.error(error.stack); process.exitCode = 1; });
