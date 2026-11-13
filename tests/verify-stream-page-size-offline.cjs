/* Confere a extensão dos controles nativos de Canais, sem navegador ou HTTP. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const nativeSizes = ['10', '25', '50', '250', '500', '1000'];
function select(initial, select2 = false) {
  let value = initial;
  return {
    options: nativeSizes.map(size => ({value: size, textContent: size})),
    classList: {contains: name => select2 && name === 'select2-hidden-accessible'},
    appendChild(option) {this.options.push(option);},
    get value() {return value;},
    set value(next) {value = this.options.some(option => option.value === next) ? next : '';}
  };
}
function page(mainValue, length, ready = true) {
  const data = {table: {}, main: select(mainValue, true), generated: ready ? select('') : null, length, ready};
  data.api = {page: {len(...args) {
    assert.equal(args.length, 0, 'A extensão deve ler o tamanho sem alterar ou redesenhar a tabela.');
    return data.length;
  }}};
  return data;
}

let active = page('10', 5000, false);
const handlers = new Map(), select2Changes = [], urlWrites = [];
const document = {
  readyState: 'complete',
  getElementById(id) {
    if (id === 'datatable-streampage' || id === 'datatable-mass') return active.table;
    if (id === 'stream_show_entries' || id === 'show_entries') return active.main;
    return null;
  },
  querySelector: () => active.generated,
  createElement(tag) {assert.equal(tag, 'option'); return {};}
};
function jq(node) {
  if (node === document) {
    return {on(type, selector, callback) {
      assert.equal(selector, '#datatable-streampage, #datatable-mass');
      assert.equal(handlers.has(type), false, 'A troca de página não deve duplicar eventos delegados.');
      handlers.set(type, callback);
    }};
  }
  if (node === active.table) return {DataTable: () => active.api};
  assert.equal(node, active.main);
  return {trigger(type) {
    assert.equal(type, 'change.select2', 'Só o Select2 deve receber a mudança programática.');
    select2Changes.push(node.value);
  }};
}
jq.fn = {dataTable: {isDataTable: node => node === active.table && active.ready}};
const location = {pathname: '/admin/streams.php', search: '?entries=5000&category=7&page=2&search=Not%C3%ADcias'};
const window = {
  jQuery: jq, location,
  setParam(key, value) {
    urlWrites.push([key, value]);
    const params = new URLSearchParams(location.search);
    params.set(key, value);
    location.search = '?' + params.toString();
  }
};
vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../xui-naxx/src/stream-page-size.js'), 'utf8'), {window, document, URLSearchParams});
const enhance = window.NaxxStreamPageSize.enhance;
const init = 'init.dt.naxxStreamPageSize', length = 'length.dt.naxxStreamPageSize';
function emit(type, table = active.table, value = active.length) {
  handlers.get(type).call(table, {target: table}, {nTable: table}, value);
}
function addedOptions(control) {
  return control.options.slice(nativeSizes.length).map(({value, textContent}) => [value, textContent]);
}
const added = [['2000', '2.000'], ['5000', '5.000']];

// A URL já fornece 5.000 e página 2 à inicialização nativa.
assert.deepEqual(addedOptions(active.main), added,
  'O módulo deve iniciar sozinho com o DOM completo, sem uma chamada do boot global.');
enhance();
assert.deepEqual(addedOptions(active.main), added);
active.ready = true;
active.generated = select('');
emit(init);
enhance();
assert.deepEqual(addedOptions(active.main), added);
assert.deepEqual(addedOptions(active.generated), added);
assert.equal(active.main.value, '5000');
assert.equal(active.generated.value, '5000');
assert.deepEqual(select2Changes, ['5000']);
assert.deepEqual(urlWrites, []);

// O seletor gerado pelo DataTables atualiza o Select2 e persiste apenas entries.
active.length = 2000;
active.generated.value = '2000';
emit(length);
assert.equal(active.main.value, '2000');
assert.deepEqual(urlWrites, [['entries', '2000']]);
const params = new URLSearchParams(location.search);
assert.equal(params.get('category'), '7');
assert.equal(params.get('page'), '2');
assert.equal(params.get('search'), 'Notícias');

// O Select2 nativo já salva entries. A extensão não grava nem dispara outro change.
active.main.value = '5000';
window.setParam('entries', '5000');
active.length = 5000;
emit(length);
assert.equal(active.generated.value, '5000');
assert.deepEqual(urlWrites, [['entries', '2000'], ['entries', '5000']]);
assert.deepEqual(select2Changes, ['5000', '2000']);

// Limpar filtros usa o tamanho padrão da própria tela e apaga a preferência da URL.
location.search = '';
active.main.value = '50';
active.length = 50;
emit(length);
assert.equal(active.generated.value, '50');
assert.equal(location.search, '');

const previousTable = active.table;
location.pathname = '/admin/movies';
active = page('50', 50);
enhance();
emit(init);
assert.deepEqual(addedOptions(active.main), []);
assert.deepEqual(addedOptions(active.generated), []);

location.pathname = '/admin/streams';
active = page('50', 50);
emit(init);
emit(length, previousTable, 5000);
assert.deepEqual(addedOptions(active.main), added);
assert.deepEqual(addedOptions(active.generated), added);
assert.equal(active.main.value, '50');
assert.equal(handlers.size, 2);
assert.equal(urlWrites.length, 2);

// Edição em massa usa IDs próprios e mantém rSelected e a URL nativa intactos.
location.pathname = '/admin/stream_mass';
active = page('50', 50);
window.rSelected = ['8', '21'];
emit(init);
assert.deepEqual(addedOptions(active.main), added);
assert.deepEqual(addedOptions(active.generated), added);
active.length = 5000;
active.generated.value = '5000';
emit(length);
assert.equal(active.main.value, '5000');
assert.deepEqual(window.rSelected, ['8', '21']);
assert.equal(urlWrites.length, 2, 'A edição em massa não usa a preferência entries da lista de canais.');
console.log('PASS: 2.000/5.000 nos selects de Canais e edição em massa, deep link, filtros, seleção preservada, Select2, limpeza e troca SPA.');
