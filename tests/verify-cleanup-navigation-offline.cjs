/* Limpeza em lotes: navegação/cancelamento simulados sem browser, servidor ou exclusão real. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

(async () => {
  const documentEvents = new Map(), timers = [], requests = [], opened = [];
  const controls = new Map();
  function element(name) {
    return {
      name, dataset: {}, children: [], isConnected: true, hidden: false, disabled: false, textContent: '',
      classList: {toggle() {}},
      setAttribute() {}, appendChild(child) {this.children.push(child);},
      addEventListener(type, listener) {this[type] = listener;},
      querySelector(selector) {return controls.get(selector) || null;},
      querySelectorAll() {return [];}
    };
  }
  ['[data-cleanup-modes]', '[data-cleanup-delete-all]', '[data-cleanup-cancel]', '[data-cleanup-status]', '[name="streams"]'].forEach(selector => controls.set(selector, element(selector)));
  const form = element('stream_form'); form.id = 'stream_form';
  const heading = element('heading'); heading.after = panel => {heading.panel = panel;};
  const pageTitle = element('title');
  const doc = {
    body: element('body'), readyState: 'complete', title: '',
    getElementById: id => id === 'stream_form' ? form : null,
    querySelector: selector => selector === '.page-title-box' ? heading : selector === '.page-title' ? pageTitle : null,
    querySelectorAll: () => [], createElement: element,
    addEventListener: (type, listener) => documentEvents.set(type, listener)
  };
  const firstPost = {};
  firstPost.promise = new Promise(resolve => {firstPost.resolve = resolve;});
  const location = {pathname: '/mass_delete', search: '?naxx_cleanup=channel', href: 'https://naxx.test/mass_delete?naxx_cleanup=channel'};
  const win = {
    rStreams: Array.from({length: 201}, (_, index) => String(1000 + index)),
    confirm: () => true, addEventListener() {},
    setTimeout: callback => {timers.push(callback); return timers.length;},
    open: (...args) => opened.push(args)
  };
  const context = {
    window: win, document: doc, location, URL, URLSearchParams, AbortController,
    MutationObserver: class {observe() {}},
    FormData: class {constructor() {this.fields = new Map();} set(name, value) {this.fields.set(name, value);}},
    fetch: (url, options) => {requests.push({url, options}); return firstPost.promise;}
  };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../xui-naxx/src/cleanup-tools.js'), 'utf8'), context);
  const submit = {target: form, preventDefault() {}, stopImmediatePropagation() {}};
  documentEvents.get('submit')(submit);
  assert.equal(requests.length, 1, 'A limpeza inicia um único lote.');
  assert.equal(JSON.parse(requests[0].options.body.fields.get('streams')).length, 100);

  function nativeClick(tag, onclick, href) {
    const control = {
      getAttribute: name => name === 'onclick' ? onclick : name === 'href' ? href : null,
      closest: selector => selector === '[onclick]' ? control : selector === 'a[href]' && tag === 'a' ? control : null,
      href
    };
    const event = {target: control, prevented: false, stopped: false, preventDefault() {this.prevented = true;}, stopImmediatePropagation() {this.stopped = true;}};
    documentEvents.get('click')(event);
    return event;
  }
  // Formatos presentes no HTML nativo: link javascript e botão com navigate().
  for (const args of [['a', "navigate('settings_watch');", 'javascript: void(0);'], ['button', "navigate('settings');"], ['button', "window.navigate('streams');"]]) {
    const click = nativeClick(...args);
    assert(click.prevented && click.stopped, 'A troca SPA deve ser bloqueada antes do onclick durante um lote.');
  }
  assert.equal(opened.length, 0, 'JavaScript inline nunca é enviado a window.open.');
  assert.match(controls.get('[data-cleanup-status]').textContent, /Há uma limpeza em andamento/);
  assert.equal(nativeClick('a', 'openDetails();', 'javascript: void(0);').stopped, false, 'Ações sem navegação continuam disponíveis.');

  controls.get('[data-cleanup-cancel]').click();
  firstPost.resolve({ok: true, url: 'https://naxx.test/post.php', text: async () => JSON.stringify({status: 1, location: 'mass_delete'})});
  // Resolve fetch/text e então o intervalo entre lotes.
  for (let i = 0; i < 12; i++) await Promise.resolve();
  while (timers.length) timers.shift()();
  for (let i = 0; i < 12; i++) await Promise.resolve();
  assert.equal(requests.length, 1, 'Cancelar aguarda o lote enviado e impede os demais.');
  assert.equal(win.rStreams.length, 101, 'Os IDs não processados permanecem selecionados.');
  assert.match(controls.get('[data-cleanup-status]').textContent, /Limpeza interrompida\. 100 conteúdos processados/);
  assert.equal(nativeClick('button', "navigate('settings');").stopped, false, 'A navegação volta a funcionar quando a limpeza termina.');
  console.log('PASS: links/botões navigate bloqueados durante lote; cancelamento preserva 101 IDs; nenhum HTTP real.');
})().catch(error => {console.error(error.stack); process.exitCode = 1;});
