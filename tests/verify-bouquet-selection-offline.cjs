/* Exercita o contrato do editor nativo, sem HTTP, banco ou salvamento de lista. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../xui-naxx/src/bouquet-selection-ui.js'), 'utf8');

function fixture(pathname = '/admin/bouquet') {
  const frames = [], observers = [], handlers = [], calls = [];
  let writes = 0, draws = 0, duringToggle = null, throwAt = null;
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
        if (selector === 'table' && current.tagName === 'TABLE') return current;
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
      assert.match(selector, /^tbody /);
      const result = [];
      const wantsAdd = selector.includes('.btn-add'), wantsRemove = selector.includes('.btn-remove');
      const visit = node => {
        node.children.forEach(child => {
          const classes = child.className.split(' ');
          if ((wantsAdd && classes.includes('btn-add') || wantsRemove && classes.includes('btn-remove')) &&
              child.getAttribute('data-id') !== null && child.getAttribute('data-type') !== null) result.push(child);
          visit(child);
        });
      };
      visit(this); return result;
    }
    addEventListener(type, listener) {this.events[type] = listener;}
    click() {if (!this.disabled) this.events.click?.({preventDefault() {}});}
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
  const pages = {};
  definitions.forEach(([id, type]) => {
    const pane = form.appendChild(new Element('div'));
    pane.style.display = type === 'stream' ? '' : 'none';
    const wrapper = pane.appendChild(new Element('div')); wrapper.className = 'dataTables_wrapper';
    const table = wrapper.appendChild(new Element('table', id));
    const body = table.appendChild(new Element('tbody'));
    pages[type] = {pane, wrapper, table, body, rows: new Map()};
  });
  function row(type, id, options = {}) {
    const page = pages[type]; const tr = page.body.appendChild(new Element('tr'));
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
  function jq(node) {
    if (node === doc) return {on(events, selector, callback) {handlers.push({events, callback: callback || selector});}};
    assert.equal(node, review);
    return {DataTable: () => ({draw(reset) {assert.equal(reset, false); draws++; emit('draw', review);}})};
  }
  jq.fn = {dataTable: {isDataTable: node => node === review}};
  const win = {
    location: {pathname}, rBouquet: selections, jQuery: jq,
    requestAnimationFrame(callback) {frames.push(callback); return frames.length;},
    getComputedStyle: element => ({display: element.style.display || 'block', visibility: element.style.visibility || 'visible'}),
    toggleBouquet(id, type, draw) {
      assert.equal(draw, false, 'O lote nunca pede redesenho por item.');
      calls.push([id, type]);
      if (throwAt === id) throw new Error('native failure');
      const current = selections[type]; const at = current.indexOf(id);
      if (at < 0) current.push(id); else current.splice(at, 1);
      for (const record of pages[type].rows.get(String(id)) || []) {
        record.add.style.display = current.includes(id) ? 'none' : '';
        record.remove.style.display = current.includes(id) ? '' : 'none';
      }
      if (duringToggle) duringToggle();
    }
  };
  class Observer {
    constructor(callback) {this.callback = callback; observers.push(this);}
    observe(target, options) {this.target = target; this.options = options;}
    disconnect() {this.target = null;}
  }
  row('stream', 1); row('stream', 2); row('stream', 3); row('stream', 4, {hidden: true});
  row('stream', 1); // Duplicate rendering must not toggle the same ID twice.
  row('stream', 'bad'); row('stream', 0); row('stream', 5, {type: 'movies'}); row('stream', 6, {disabled: true});
  row('movies', 900); row('movies', 901); row('series', 700); row('radios', 800);
  vm.runInNewContext(source, {window: win, document: doc, MutationObserver: Observer});
  function flush() {
    let count = 0;
    while (frames.length) {assert(++count < 25, 'O observer não deve agendar frames sem fim.'); frames.shift()();}
  }
  function toolbar(type) {
    const box = pages[type].pane.children.find(child => child.className.includes('naxx-bouquet-selection'));
    if (!box) return null;
    const [add, remove, status] = box.children[0].children;
    return {box, add, remove, status};
  }
  flush();
  return {win, doc, form, pages, selections, calls, row, emit, flush, toolbar,
    draws: () => draws, writes: () => writes,
    reenter: callback => {duringToggle = callback;}, fail: id => {throwAt = id;}};
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
assert.equal(otherPage.win.NaxxBouquetSelection, undefined, 'O módulo não altera a lista geral nem outras telas.');
assert.equal(otherPage.toolbar('stream'), null);
console.log('PASS: página e filtros, seleção mista, IDs/tipos, abas ocultas, deduplicação, loading, lote com um draw, erro parcial e observer estável; sem salvar ou HTTP.');
