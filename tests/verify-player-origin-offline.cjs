/* Regressão isolada: executa o monitor real com DOM e JWPlayer simulados, sem rede. */
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');

const source = fs.readFileSync(path.join(__dirname, '../xui-naxx/src/naxx.js'), 'utf8');
const start = source.indexOf('  function monitorChannelPlayer(frame) {');
const end = source.indexOf('  function enhanceChannelPlayer()', start);
assert(start >= 0 && end > start, 'Monitor do player não encontrado');
const monitorSource = source.slice(start, end);
const origin = 'https://painel.example:8443';
const panelURL = origin + '/acesso/player?type=live&id=1';
const localSource = origin + '/admin/live?uitoken=local';
const foreignSource = 'http://servidor.example:8080/admin/live.php?uitoken=a%2Fb%2Bc%3D&other=one+two&other=%2f#keep';

function fixture(options = {}) {
  const timers = new Map(), events = new Map(), frameEvents = new Map(), documentEvents = new Map();
  const calls = {loads: [], plays: 0, fetches: 0, observerDisconnects: 0};
  const stateLabel = {textContent: ''}, errorText = {textContent: ''};
  const overlay = {hidden: true, querySelector() { return errorText; }};
  const card = {querySelector(selector) { return selector === '.naxx-player-error' ? overlay : stateLabel; }};
  let timerID = 0, currentSource = options.source ?? foreignSource;
  let currentState = options.state || 'idle';
  const item = {sources: [{file: currentSource}]};
  const playerDocument = {
    documentElement: {}, body: {}, head: {appendChild() {}},
    querySelector() { return null; }, querySelectorAll() { return []; },
    getElementById() { return {}; }, createElement() { return {}; },
    addEventListener(name, callback) { documentEvents.set(name, callback); },
    removeEventListener(name, callback) { if (documentEvents.get(name) === callback) documentEvents.delete(name); }
  };
  const instance = {
    getConfig() { return {playlist: [item]}; },
    getPlaylistItem() { if (options.sourceThrows) throw new Error('Falha ao ler fonte'); return item; },
    getState() { return currentState; },
    on(name, callback) { if (!events.has(name)) events.set(name, new Set()); events.get(name).add(callback); },
    off(name, callback) { events.get(name)?.delete(callback); },
    load(playlist) {
      calls.loads.push(playlist);
      currentSource = playlist[0].file;
      item.sources[0].file = currentSource;
      currentState = 'buffering';
      if (options.onLoad) options.onLoad(api);
      if (options.loadThrows) { currentState = 'error'; throw new Error('Falha no load'); }
    },
    play() {
      calls.plays += 1;
      if (options.playThrows) { currentState = 'error'; throw new Error('Falha no play'); }
      currentState = options.playState || 'playing';
      if (currentState === 'playing') emit('play');
    }
  };
  const frame = {
    src: options.frameURL || panelURL, dataset: {}, isConnected: true,
    contentWindow: {document: playerDocument, jwplayer() { return instance; }},
    closest() { return card; },
    addEventListener(name, callback) { frameEvents.set(name, callback); }
  };
  function emit(name, value) { for (const callback of [...events.get(name) || []]) callback(value); }
  const window = {
    setTimeout(callback, delay) { const id = ++timerID; timers.set(id, {callback, delay}); return id; },
    clearTimeout(id) { timers.delete(id); }
  };
  const context = vm.createContext({
    window, URL, Promise, console,
    MutationObserver: class { observe() {} disconnect() { calls.observerDisconnects += 1; } },
    requestAnimationFrame(callback) { return window.setTimeout(callback, 0); },
    cancelAnimationFrame(id) { window.clearTimeout(id); },
    fetch() { calls.fetches += 1; throw new Error('O monitor não deve buscar o manifesto'); }
  });
  vm.runInContext(monitorSource, context);
  const api = {
    calls, frame, events, documentEvents, overlay, errorText, stateLabel, instance, emit,
    setSource(value) { currentSource = value; item.sources[0].file = value; },
    setState(value) { currentState = value; },
    loadFrame() { frameEvents.get('load')(); },
    bind() {
      for (const [id, timer] of [...timers]) {
        if (timer.delay === 0) { timers.delete(id); timer.callback(); }
      }
    }
  };
  context.monitorChannelPlayer(frame);
  if (!options.deferBind) api.bind();
  return api;
}

async function settle() { await Promise.resolve(); await Promise.resolve(); }
function assertNoRequest(api) { assert.equal(api.calls.fetches, 0, 'Consulta redundante ao manifesto'); }

(async () => {
  // Corrige antes de esperar error e conserva a representação original da query e do token.
  const early = fixture();
  assert.equal(early.calls.loads.length, 1);
  assert.equal(early.calls.loads[0][0].type, 'hls');
  assert.equal(early.calls.loads[0][0].file, origin + '/admin/live.php?uitoken=a%2Fb%2Bc%3D&other=one+two&other=%2f#keep');
  assert.equal(early.calls.plays, 1);
  assert.equal(early.overlay.hidden, true);
  assertNoRequest(early);

  // A fonte pode aparecer ou mudar depois do bind: o tratamento de erro continua recuperando.
  const fallback = fixture({source: localSource});
  assert.equal(fallback.calls.loads.length, 0);
  fallback.setSource(foreignSource.replace('/live.php?', '/live?'));
  fallback.setState('error');
  fallback.emit('error', {code: 232404});
  await settle();
  assert.equal(fallback.calls.loads.length, 1);
  assert.equal(new URL(fallback.calls.loads[0][0].file).pathname, '/admin/live');
  assert.equal(fallback.overlay.hidden, true);
  assertNoRequest(fallback);

  // Não redireciona fontes externas nem rotas sem o token nativo.
  for (const url of [localSource, 'https://outro.example/live/1.m3u8',
    'http://servidor.example/admin/live?other=1', 'http://servidor.example/admin/live-extra?uitoken=x']) {
    const api = fixture({source: url});
    assert.equal(api.calls.loads.length, 0, url);
    api.setState('error'); api.emit('error', {code: 232404});
    await settle();
    assert.equal(api.calls.loads.length, 0, url);
    assert.equal(api.overlay.hidden, false, 'Falha real deve continuar visível');
    assertNoRequest(api);
  }

  // Reprodução iniciada ou pausada pelo usuário não deve ser interrompida.
  for (const activeState of ['playing', 'paused']) {
    const api = fixture({state: activeState});
    api.emit('error', {code: 232404});
    await settle();
    assert.equal(api.calls.loads.length, 0);
    assert.equal(api.calls.plays, 0);
    assert.equal(api.overlay.hidden, true);
    assertNoRequest(api);
  }

  // Fontes ausentes, malformadas e getters que falham não geram rejeições.
  for (const options of [{source: ''}, {source: 'http://['}, {sourceThrows: true}, {frameURL: 'http://['}]) {
    const api = fixture(options);
    api.setState('error'); api.emit('setupError', {code: 232404});
    await settle();
    assert.equal(api.calls.loads.length, 0);
    assert.equal(api.overlay.hidden, false);
    assertNoRequest(api);
  }

  // Erro reentrante ou atrasado da tentativa antiga não cobre a nova reprodução.
  const racing = fixture({playState: 'buffering', onLoad(api) { api.emit('error', {code: 232404}); }});
  racing.emit('error', {code: 232404});
  await settle();
  assert.equal(racing.overlay.hidden, true);
  assert.equal(racing.calls.loads.length, 1);
  racing.setState('error'); racing.emit('error', {code: 232404});
  await settle();
  assert.equal(racing.overlay.hidden, false, 'Falha da fonte corrigida precisa ser exibida');
  racing.overlay.hidden = true;
  racing.emit('error', {code: 232404});
  racing.setState('playing'); racing.emit('play');
  await settle();
  assert.equal(racing.overlay.hidden, true, 'Callback pendente não pode cobrir play mais recente');
  assertNoRequest(racing);

  // Exceções síncronas de JWPlayer também não escapam como rejeições.
  for (const options of [{loadThrows: true}, {playThrows: true}]) {
    const api = fixture(options);
    await settle();
    assert.equal(api.calls.loads.length, 1);
    assert.equal(api.overlay.hidden, false);
    api.emit('error', {code: 232404}); await settle();
    assert.equal(api.calls.loads.length, 1, 'Não deve repetir a recuperação');
    assertNoRequest(api);
  }

  // Fechar invalida callbacks pendentes, remove handlers e impede nova recuperação.
  const closed = fixture({source: localSource});
  const staleHandler = [...closed.events.get('error')][0];
  closed.setState('error'); closed.emit('error', {code: 232404});
  closed.frame.__naxxStopMonitor();
  closed.frame.isConnected = false;
  closed.setSource(foreignSource); staleHandler({code: 232404});
  await settle();
  assert.equal(closed.calls.loads.length, 0);
  assert.equal(closed.overlay.hidden, true);
  assert.equal(closed.documentEvents.size, 0);
  assert([...closed.events.values()].every(handlers => handlers.size === 0));
  const beforeBind = fixture({deferBind: true});
  beforeBind.frame.__naxxStopMonitor(); beforeBind.bind();
  assert.equal(beforeBind.calls.loads.length, 0);

  // Recarregar usa outra geração sem duplicar os handlers nem reaplicar o erro anterior.
  const reloaded = fixture({source: localSource});
  reloaded.setState('error'); reloaded.emit('error', {code: 232404});
  reloaded.setSource(foreignSource); reloaded.setState('idle');
  reloaded.loadFrame(); reloaded.bind();
  await settle();
  assert.equal(reloaded.calls.loads.length, 1);
  assert.equal(reloaded.events.get('error').size, 1);
  assert.equal(reloaded.overlay.hidden, true);
  assertNoRequest(reloaded);

  console.log('Player: correção antecipada e por erro, token/query preservados, rotas restritas, reprodução ativa, fontes inválidas, corridas de eventos, fechamento e recarga passaram; sem fetch do manifesto.');
})().catch(error => { console.error(error); process.exitCode = 1; });
