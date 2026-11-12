const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../xui-naxx/src/naxx.js'), 'utf8');
const start = source.indexOf('  function enhanceTopbarTheme() {');
const end = source.indexOf('  function translate(element)', start);
assert(start > 0 && end > start);
function fixture(pathname = '/edit_profile') {
  const make = (classes, theme) => {
    const names = new Set(classes.split(' '));
    const attributes = {'data-theme': theme || null};
    return {
      classList: { [Symbol.iterator]: () => names.values(), add: x => names.add(x), remove: x => names.delete(x) },
      getAttribute: x => attributes[x] || null,
      setAttribute: (x, v) => { attributes[x] = v; },
      has: x => names.has(x)
    };
  };
  const overlay = make('navbar-overlay bg-animate-primary');
  const counter = make('btn btn-dark bg-animate-primary');
  const search = make('app-search', 'bg-animate-primary');
  const targets = [overlay, counter, search];
  const help = [];
  const handlers = {};
  const select = {value: 'primary', parentElement: {appendChild: el => help.push(el)},
    addEventListener: (name, callback) => { handlers[name] = callback; }};
  const nativeData = new Map();
  const jqHandlers = [];
  const window = {jQuery: el => ({
    data: (key, value) => nativeData.set(el, {[key]: value}),
    on: (name, callback) => jqHandlers.push({name, callback})
  })};
  const document = {getElementById: id => id === 'hue' ? select : id === 'topnav' ?
    {querySelectorAll: () => targets} : null, createElement: () => ({})};
  const context = vm.createContext({document, window, location: {pathname}});
  vm.runInContext(source.slice(start, end), context);
  return {select, help, handlers, overlay, counter, search, nativeData, jqHandlers,
    enhance: () => context.enhanceTopbarTheme()};
}
const f = fixture();
f.enhance(); f.enhance();
assert.equal(f.help.length, 1);
assert.equal(f.jqHandlers.length, 1);
assert.equal(f.overlay.has('bg-animate-primary'), true);
for (const hue of ['info', 'success', 'danger', 'warning', 'purple', 'pink', 'dark', 'secondary', 'primary', '']) {
  f.select.value = hue;
  // Select2 emits a jQuery change; a normal select emits a DOM change.
  f.jqHandlers[0].callback(); f.handlers.change();
  const theme = 'bg-animate' + (hue ? '-' + hue : '');
  assert.equal(f.overlay.has(theme), true);
  assert.equal(f.overlay.has('navbar-overlay'), true);
  assert.equal(f.counter.has(theme), true);
  assert.equal(f.counter.has('btn-dark'), true);
  assert.equal(f.search.getAttribute('data-theme'), theme);
  assert.equal(f.nativeData.get(f.search).theme, theme);
  assert.equal(f.select.value, hue, 'The persisted option value is never rewritten.');
}
f.select.value = 'not-a-theme'; f.handlers.change();
assert.equal(f.overlay.has('bg-animate'), true, 'Unknown values cannot inject theme classes.');
const other = fixture('/settings'); other.enhance();
assert.equal(other.help.length, 0);
assert.equal(other.jqHandlers.length, 0);
console.log('PASS: native and Select2 preview, nine themes/default, persisted values, one binding, page scope; no request or submit.');
