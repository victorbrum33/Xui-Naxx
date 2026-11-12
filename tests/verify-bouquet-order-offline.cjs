/* DOM e contrato de salvamento offline. Dependência de teste: npm install --no-save jsdom
 * Alternativa: NAXX_JSDOM=/caminho/para/jsdom node verificacao/verify-bouquet-order-offline.cjs
 * Não usa HTTP, credenciais, banco de dados nem o submitForm real. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
let JSDOM;
try { ({JSDOM} = require(process.env.NAXX_JSDOM || 'jsdom')); }
catch (error) { throw new Error('Instale jsdom para executar este teste, ou defina NAXX_JSDOM.', {cause: error}); }
const source = fs.readFileSync(path.join(__dirname, '../xui-naxx/src/bouquet-order-ui.js'), 'utf8');
const css = fs.readFileSync(path.join(__dirname, '../xui-naxx/src/naxx.css'), 'utf8');
const definitions = [['stream', 'bouquet-stream'], ['movie', 'bouquet-movie'], ['series', 'bouquet-series'], ['radio', 'bouquet-stations']];
const samples = {
  stream: [['11', 'Canal 10'], ['22', 'Água 2'], ['33', 'Canal 2'], ['44', 'Água 1'], ['55', 'Zulu']],
  movie: [['9', 'Filme Z'], ['8', 'Filme A'], ['', ''], ['9', 'Filme A']],
  series: [['6', 'Série 10'], ['5', 'Série 2']], radio: [['4', 'Rádio Z'], ['3', 'Rádio A']]
};
const nativeFormFile = path.join(__dirname, 'bouquet-sort-native-form.txt');
const nativeFunctionsFile = path.join(__dirname, 'bouquet-sort-native-functions.txt');
const jqueryFile = path.join(__dirname, '../../xui-original/player/js/jquery-3.5.1.min.js');
const hasCapturedNative = fs.existsSync(nativeFormFile) && fs.existsSync(nativeFunctionsFile) && fs.existsSync(jqueryFile);
const baseForm = fs.existsSync(nativeFormFile) ? fs.readFileSync(nativeFormFile, 'utf8') :
  '<form action="#" method="POST"><input type="hidden" id="stream_order_array" name="stream_order_array"><input type="hidden" name="reorder" value="42">' +
  '<nav>' + definitions.map(([type, panel]) => `<a href="#${panel}"><span>${type}</span></a>`).join('') + '</nav>' +
  definitions.map(([type, panel]) => `<div id="${panel}"><div class="row"><select id="sort_${type}_l" multiple></select><select id="sort_${type}_r" multiple></select></div><ul><li><button type="submit">Salvar</button></li></ul></div>`).join('') + '</form>';
const pause = (window, ms = 130) => new Promise(resolve => window.setTimeout(resolve, ms));

async function fixture({pathname = '/admin/bouquet_sort', nativeAfter = false, large = 0, late = false, empty = false} = {}) {
  const dom = new JSDOM('<!doctype html><html class="naxx-ready"><body>' + (late ? '' : baseForm) + '</body></html>', {
    url: 'https://offline.invalid' + pathname, runScripts: 'outside-only'
  });
  const {window} = dom, {document} = window;
  const calls = [], network = [];
  window.fetch = (...args) => {network.push(args); throw new Error('HTTP proibido no teste');};
  window.XMLHttpRequest = class { open() { network.push('xhr'); throw new Error('HTTP proibido no teste'); } };
  window.submitForm = (type, data) => calls.push({type, fields: Object.fromEntries(data.entries())});
  window.rCurrentPage = 'bouquet_sort'; window.initSearch = () => {};
  function populate() {
    const form = document.querySelector('form'); form.querySelector('[name=reorder]').value = '42';
    const token = document.createElement('input'); token.type = 'hidden'; token.name = 'fixture_token'; token.value = 'preservado'; form.append(token);
    definitions.forEach(([type]) => {
      const records = empty ? [] : samples[type];
      ['l', 'r'].forEach(side => {
        const select = document.getElementById(`sort_${type}_${side}`);
        select.replaceChildren(...records.map(([value, text]) => new window.Option(text, value)));
        // A light options collection models an already-loaded 100k catalogue.
        // Small fixtures below exercise actual Option node identity and sync.
        if (large && type === 'stream') Object.defineProperty(select, 'options', {value: Array.from({length: large}, (_, i) => ({value: String(i), text: 'Canal ' + (large - i)}))});
      });
    });
  }
  function bindNative() {
    if (hasCapturedNative) {
      window.eval(fs.readFileSync(jqueryFile, 'utf8'));
      window.eval(fs.readFileSync(nativeFunctionsFile, 'utf8'));
    } else {
      // Exact backend data contract; captured handler is used when available.
      document.querySelector('form').addEventListener('submit', event => {
        event.preventDefault();
        const order = {stream: [], movie: [], radio: [], series: []};
        Object.keys(order).forEach(type => {order[type] = Array.from(document.getElementById(`sort_${type}_l`).options, option => option.value);});
        document.getElementById('stream_order_array').value = JSON.stringify(order);
        document.querySelectorAll('button[type=submit]').forEach(button => {button.disabled = true;});
        window.submitForm('bouquet_sort', new window.FormData(document.querySelector('form')));
      });
    }
  }
  if (!late) populate();
  if (!nativeAfter && !late) bindNative();
  window.eval(source);
  await pause(window, 20);
  if (late) {document.body.innerHTML = baseForm; populate(); await pause(window, 80);}
  if (nativeAfter || late) {bindNative(); await pause(window, 20);}
  const panel = type => document.querySelector(`#${definitions.find(([key]) => key === type)[1]} .naxx-content-order`);
  const button = (type, action) => panel(type).querySelector(`[data-order-action="${action}"]`);
  const row = (type, key) => panel(type).querySelector(`[data-order-key="${key}"]`);
  const keys = type => Array.from(panel(type).querySelectorAll('[data-order-key]'), node => Number(node.dataset.orderKey));
  const check = (type, key, value = true) => {
    const input = row(type, key).querySelector('input'); input.checked = value; input.dispatchEvent(new window.Event('change', {bubbles: true}));
  };
  const search = async (type, value) => {
    const input = panel(type).querySelector('input[type=search]'); input.value = value; input.dispatchEvent(new window.Event('input', {bubbles: true})); await pause(window);
  };
  const values = (type, side = 'l') => Array.from(document.getElementById(`sort_${type}_${side}`).options, option => option.value);
  const save = () => document.querySelector('.naxx-order-save').click();
  return {dom, window, document, calls, network, panel, button, row, keys, check, search, values, save};
}

(async () => {
  assert(source.includes('new Intl.Collator(\'pt-BR\', {numeric: true, sensitivity: \'base\'})'));
  assert(css.includes('.naxx-order-form .naxx-order-native{display:none!important}'));
  assert(!/fetch\s*\(|XMLHttpRequest|\.ajax\s*\(/.test(source), 'editor must not send requests');
  for (const nativeAfter of [false, true]) {
    const f = await fixture({nativeAfter});
    try {
      assert(f.panel('stream')); assert.equal(f.document.querySelectorAll('.naxx-order-save').length, 1);
      assert.equal(f.document.querySelectorAll('form').length, 1);
      assert.equal(f.document.querySelectorAll('.naxx-order-native select').length, 8);
      assert(f.document.querySelector('.naxx-order-save').disabled);
      const enter = new f.window.KeyboardEvent('keydown', {key: 'Enter', bubbles: true, cancelable: true});
      f.panel('stream').querySelector('input[type=search]').dispatchEvent(enter);
      assert(enter.defaultPrevented, 'search Enter cannot implicitly submit Save');
      const originalNodes = Array.from(f.document.querySelector('#sort_stream_l').options);
      const originalOthers = Object.fromEntries(['movie', 'series', 'radio'].map(type => [type, f.values(type)]));
      await f.search('stream', 'AGUA'); assert.deepEqual(f.keys('stream'), [1, 3], 'accent-insensitive search');
      assert.deepEqual(Array.from(f.panel('stream').querySelectorAll('.naxx-order-position'), node => node.textContent), ['2', '4'], 'global positions survive filtering');
      f.button('stream', 'az').click(); assert.deepEqual(f.keys('stream'), [3, 1], 'sort only filtered occupied slots');
      assert.deepEqual(f.values('stream'), samples.stream.map(item => item[0]), 'draft edits leave native options untouched');
      assert.equal(f.document.querySelector('#stream_order_array').value, ''); assert.equal(f.calls.length, 0);
      f.button('stream', 'undo').click(); assert.deepEqual(f.keys('stream'), [1, 3]);
      f.button('stream', 'redo').click(); assert.deepEqual(f.keys('stream'), [3, 1]);
      f.button('stream', 'select').click();
      await f.search('stream', ''); f.button('stream', 'top').click();
      assert.deepEqual(f.keys('stream'), [3, 1, 0, 2, 4], 'selected matches move as a block in full catalogue');
      f.button('stream', 'clear').click(); f.check('stream', 0);
      const position = f.panel('stream').querySelector('[data-order-position]'); position.value = '5';
      const moveEnter = new f.window.KeyboardEvent('keydown', {key: 'Enter', bubbles: true, cancelable: true}); position.dispatchEvent(moveEnter);
      assert(moveEnter.defaultPrevented, 'position Enter moves a draft block without submitting');
      assert.equal(f.calls.length, 0);
      assert.deepEqual(f.keys('stream'), [3, 1, 2, 4, 0]);
      position.value = '0'; f.button('stream', 'move').click();
      assert(f.panel('stream').querySelector('[role=status]').textContent.includes('Informe uma posição'));
      assert.deepEqual(f.keys('stream'), [3, 1, 2, 4, 0]);
      f.save(); assert.equal(f.calls.length, 1);
      assert.equal(f.calls[0].type, 'bouquet_sort'); assert.equal(f.calls[0].fields.reorder, '42'); assert.equal(f.calls[0].fields.fixture_token, 'preservado');
      const payload = JSON.parse(f.calls[0].fields.stream_order_array);
      assert.deepEqual(Object.keys(payload).sort(), ['movie', 'radio', 'series', 'stream']);
      assert.deepEqual(payload.stream, ['44', '22', '33', '55', '11']);
      for (const type of ['movie', 'series', 'radio']) assert.deepEqual(payload[type], originalOthers[type]);
      assert.deepEqual(f.values('stream', 'r'), payload.stream);
      assert.deepEqual(Array.from(f.document.querySelector('#sort_stream_l').options), [originalNodes[3], originalNodes[1], originalNodes[2], originalNodes[4], originalNodes[0]], 'sync reuses original native nodes');
      assert.equal(f.calls[0].fields.reorder, f.document.querySelector('[name=reorder]').value);
      assert(f.document.querySelector('.naxx-order-save').disabled, 'native handler owns final submit disabling');
      assert.equal(f.network.length, 0);
    } finally { f.dom.window.close(); }
  }
  {
    const f = await fixture();
    try {
      // All four independent types, duplicate IDs, empty names and natural sorting.
      f.button('stream', 'az').click(); assert.deepEqual(f.keys('stream'), [3, 1, 2, 0, 4]);
      f.button('series', 'az').click(); assert.deepEqual(f.keys('series'), [1, 0]);
      f.button('radio', 'az').click(); assert.deepEqual(f.keys('radio'), [1, 0]);
      f.button('movie', 'az').click(); assert.deepEqual(f.keys('movie'), [1, 3, 0, 2]);
      assert(f.row('movie', 2).textContent.includes('Sem nome'));
      f.check('movie', 3); f.button('movie', 'top').click();
      assert.deepEqual(f.keys('movie'), [3, 1, 0, 2], 'same ID does not merge two different entries');
      f.button('movie', 'down').click(); assert.deepEqual(f.keys('movie'), [1, 3, 0, 2]);
      f.button('movie', 'bottom').click(); assert.deepEqual(f.keys('movie'), [1, 0, 2, 3]);
      f.button('movie', 'up').click(); assert.deepEqual(f.keys('movie'), [1, 0, 3, 2]);
      // Dragging a selected member moves the selected block, before full-order target.
      f.button('stream', 'restore').click(); f.check('stream', 1); f.check('stream', 3);
      const transfer = {effectAllowed: '', dropEffect: '', setData() {}};
      function drag(type, key, eventName, handle) {
        const event = new f.window.Event(eventName, {bubbles: true, cancelable: true}); Object.defineProperty(event, 'dataTransfer', {value: transfer});
        (handle ? f.row(type, key).querySelector('.naxx-order-handle') : f.row(type, key)).dispatchEvent(event);
      }
      drag('stream', 1, 'dragstart', true); drag('stream', 4, 'dragover'); drag('stream', 4, 'drop');
      assert.deepEqual(f.keys('stream'), [0, 2, 1, 3, 4]);
      drag('stream', 4, 'dragstart', true); drag('stream', 0, 'drop');
      assert.deepEqual(f.keys('stream'), [4, 0, 2, 1, 3], 'unselected drag moves only that row');
      const handle = f.row('stream', 4).querySelector('.naxx-order-handle');
      handle.dispatchEvent(new f.window.KeyboardEvent('keydown', {key: 'ArrowDown', altKey: true, bubbles: true, cancelable: true}));
      assert.deepEqual(f.keys('stream'), [0, 4, 2, 1, 3]);
      f.button('stream', 'restore').click(); assert.deepEqual(f.keys('stream'), [0, 1, 2, 3, 4]);
      f.save(); const payload = JSON.parse(f.calls[0].fields.stream_order_array);
      assert.deepEqual(payload.movie, ['8', '9', '9', '']);
      assert.deepEqual(payload.series, ['5', '6']); assert.deepEqual(payload.radio, ['3', '4']);
      assert.equal(f.document.querySelector('#sort_movie_l').options[3].text, '', 'fallback display never edits raw option text');
    } finally { f.dom.window.close(); }
  }
  {
    const f = await fixture();
    try {
      f.check('stream', 0);
      for (let i = 0; i < 14; i++) f.button('stream', i % 2 ? 'top' : 'bottom').click();
      for (let i = 0; i < 10; i++) {assert(!f.button('stream', 'undo').disabled); f.button('stream', 'undo').click();}
      assert(f.button('stream', 'undo').disabled, 'history is bounded to ten actual changes');
      f.button('stream', 'redo').click();
      f.button('stream', f.button('stream', 'up').disabled ? 'down' : 'up').click();
      assert(f.button('stream', 'redo').disabled, 'new edits clear redo');
      // External changes to native options block the entire Save before handler.
      f.document.querySelector('#sort_movie_l').options[0].remove(); f.save();
      assert.equal(f.calls.length, 0); assert.equal(f.document.querySelector('#stream_order_array').value, '');
      assert(f.document.querySelector('.naxx-order-savebar [role=alert]'));
    } finally { f.dom.window.close(); }
  }
  {
    const f = await fixture();
    try {
      f.check('stream', 0); f.button('stream', 'bottom').click();
      f.save(); assert.equal(f.calls.length, 1); assert(f.document.querySelector('.naxx-order-save').disabled);
      f.check('stream', 1); f.button('stream', 'clear').click();
      assert(f.document.querySelector('.naxx-order-save').disabled, 'draft controls cannot unlock pending native Save');
      f.save(); assert.equal(f.calls.length, 1, 'actual pending Save cannot send twice');
      f.document.querySelector('form').dispatchEvent(new f.window.Event('submit', {bubbles: true, cancelable: true}));
      assert.equal(f.calls.length, 1, 'programmatic duplicate submit is blocked too');
      // Simulate exactly the native callbackForm failure path's prop(disabled,false).
      f.document.querySelectorAll('button[type=submit]').forEach(control => {control.disabled = false;});
      f.save(); assert.equal(f.calls.length, 2, 'native failure unlock permits an immediate explicit retry');
      assert(f.document.querySelector('.naxx-order-save').disabled);
      f.document.querySelectorAll('button[type=submit]').forEach(control => {control.disabled = false;});
      await pause(f.window, 0);
      assert.equal(f.document.querySelector('form').getAttribute('aria-busy'), null);
      f.button('stream', 'clear').click(); assert(!f.document.querySelector('.naxx-order-save').disabled);
      assert.equal(f.calls.length, 2, 'native unlock never retries automatically');
    } finally {f.dom.window.close();}
  }
  {
    const f = await fixture();
    try {
      f.check('stream', 0); f.button('stream', 'bottom').click();
      f.check('movie', 0); f.panel('movie').querySelector('[data-order-position]').value = '0';
      assert.equal(f.panel('movie').querySelector('[data-order-position]').checkValidity(), true, 'draft positions use manual Move validation only');
      f.save(); assert.equal(f.calls.length, 1, 'invalid auxiliary position in another tab cannot block real Save');
    } finally {f.dom.window.close();}
  }
  for (const mutation of ['clone-left', 'detach-right', 'reparent-left', 'replace-hidden']) {
    const f = await fixture();
    try {
      f.check('stream', 0); f.button('stream', 'bottom').click();
      const left = f.document.querySelector('#sort_stream_l'), right = f.document.querySelector('#sort_stream_r');
      if (mutation === 'clone-left') left.replaceWith(left.cloneNode(true));
      else if (mutation === 'detach-right') right.remove();
      else if (mutation === 'reparent-left') f.document.body.append(left);
      else {const field = f.document.querySelector('#stream_order_array'); field.replaceWith(field.cloneNode(true));}
      f.save(); assert.equal(f.calls.length, 0, mutation + ' must block stale native references');
      assert(f.document.querySelector('.naxx-order-savebar [role=alert]'));
    } finally {f.dom.window.close();}
  }
  {
    const f = await fixture();
    try {
      const list = f.panel('stream').querySelector('.naxx-order-list'); list.scrollTop = 180;
      const checkbox = f.row('stream', 0).querySelector('input'); checkbox.focus();
      f.button('stream', 'select').click();
      assert.equal(f.document.activeElement, f.row('stream', 0).querySelector('input'), 'rerender restores focused row checkbox');
      assert.equal(list.scrollTop, 180, 'selection rerender preserves list scroll');
      f.button('stream', 'clear').click();
      const handle = f.row('stream', 0).querySelector('.naxx-order-handle'); handle.focus();
      handle.dispatchEvent(new f.window.KeyboardEvent('keydown', {key: 'ArrowDown', altKey: true, bubbles: true, cancelable: true}));
      assert.equal(f.document.activeElement, f.row('stream', 0).querySelector('.naxx-order-handle'));
      assert.equal(list.scrollTop, 180);
      f.document.activeElement.dispatchEvent(new f.window.KeyboardEvent('keydown', {key: 'ArrowDown', altKey: true, bubbles: true, cancelable: true}));
      assert.deepEqual(f.keys('stream'), [1, 2, 0, 3, 4], 'repeated Alt move retains row focus');
      await f.search('stream', 'agua'); assert.equal(list.scrollTop, 0, 'new search resets list scroll');
    } finally {f.dom.window.close();}
  }
  {
    const f = await fixture({large: 100000});
    try {
      assert.equal(f.keys('stream').length, 100, '100k records render at most 100 rows');
      f.panel('stream').querySelector('.naxx-order-list').scrollTop = 400;
      f.button('stream', 'next').click(); assert.equal(f.keys('stream')[0], 100);
      assert.equal(f.panel('stream').querySelector('.naxx-order-list').scrollTop, 0, 'page changes reset scroll');
      assert.equal(f.panel('stream').querySelector('.naxx-order-position').textContent, '101');
      f.button('stream', 'previous').click();
      const boundaryHandle = f.row('stream', 99).querySelector('.naxx-order-handle'); boundaryHandle.focus();
      boundaryHandle.dispatchEvent(new f.window.KeyboardEvent('keydown', {key: 'ArrowDown', altKey: true, bubbles: true, cancelable: true}));
      assert.equal(f.keys('stream')[0], 99, 'keyboard move follows the focused row across a page boundary');
      assert.equal(f.document.activeElement, f.row('stream', 99).querySelector('.naxx-order-handle'));
      f.button('stream', 'restore').click();
      await f.search('stream', 'canal 100000'); assert.deepEqual(f.keys('stream'), [0]);
      f.button('stream', 'select').click(); f.button('stream', 'bottom').click();
      assert.equal(f.panel('stream').querySelector('.naxx-order-position').textContent, '100.000');
      await f.search('stream', ''); assert.equal(f.keys('stream').length, 100);
      assert.equal(f.calls.length, 0); assert.equal(f.network.length, 0);
    } finally { f.dom.window.close(); }
  }
  {
    const f = await fixture();
    try {
      // A button pressed before the input debounce must use the latest search.
      const input = f.panel('stream').querySelector('input[type=search]'); input.value = 'agua';
      input.dispatchEvent(new f.window.Event('input', {bubbles: true})); f.button('stream', 'az').click();
      assert.deepEqual(f.keys('stream'), [3, 1]);
      assert.equal(f.calls.length, 0);
    } finally {f.dom.window.close();}
  }
  {
    const f = await fixture({empty: true});
    try {
      for (const [type] of definitions) {
        assert.equal(f.keys(type).length, 0); assert.equal(f.panel(type).querySelector('.naxx-order-empty').hidden, false);
        for (const action of ['select', 'clear', 'az', 'za', 'up', 'down', 'top', 'bottom', 'move', 'undo', 'redo', 'restore']) assert(f.button(type, action).disabled, 'empty-list ' + action);
      }
      assert(f.document.querySelector('.naxx-order-save').disabled); assert.equal(f.calls.length, 0);
    } finally {f.dom.window.close();}
  }
  {
    const f = await fixture({late: true});
    try {assert(f.panel('stream'), 'late native markup is enhanced'); assert(f.window.NaxxBouquetOrder.enhance()); assert.equal(f.document.querySelectorAll('.naxx-order-save').length, 1);} finally {f.dom.window.close();}
    const other = await fixture({pathname: '/admin/bouquet'});
    try {
      assert(other.window.NaxxBouquetOrder); assert.equal(other.window.NaxxBouquetOrder.enhance(), false);
      assert.equal(other.document.querySelector('.naxx-order-save'), null);
      other.window.history.pushState({}, '', '/admin/bouquet_sort');
      assert(other.window.NaxxBouquetOrder.enhance(), 'SPA route transition can initialize an already-exported module');
      assert(other.panel('stream')); assert.equal(other.document.querySelectorAll('.naxx-order-save').length, 1);
      const oldForm = other.document.querySelector('form');
      oldForm.remove(); other.document.body.innerHTML = baseForm;
      assert(other.window.NaxxBouquetOrder.enhance(), 'replacement form can be enhanced again');
      assert.equal(other.document.querySelectorAll('.naxx-order-save').length, 1);
      assert.notEqual(other.document.querySelector('form'), oldForm);
    } finally {other.dom.window.close();}
  }
  console.log(JSON.stringify({status: 'PASS', nativeHandler: hasCapturedNative ? 'captured native jQuery handler' : 'equivalent offline contract', types: 4, largeCatalogue: 100000, maximumRenderedRowsPerType: 100, httpRequests: 0, databaseWrites: 0}));
})().catch(error => {console.error(error); process.exitCode = 1;});
