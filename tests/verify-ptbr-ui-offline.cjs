/* Textos estáticos em PT-BR sem traduzir nomes, valores ou identificadores. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../xui-naxx/src/naxx.js'), 'utf8');
const start = source.indexOf('  var translations =');
const end = source.indexOf('  var streamHelpTranslations =');
assert.ok(start > 0 && end > start);
const queued = [];
const context = {location: {pathname: '/streams'}, enqueue: element => queued.push(element)};
vm.createContext(context);
vm.runInContext(source.slice(start, end), context);
const observerStart = source.indexOf('    function textChanged(node)');
const observerEnd = source.indexOf('    var bodyObserver=', observerStart);
assert.ok(observerStart > 0 && observerEnd > observerStart);
vm.runInContext(source.slice(observerStart, observerEnd), context);

function element(tag, value, options = {}) {
  const classes = new Set(options.classes || []);
  const node = {nodeType: 3, textContent: value, nodeValue: value};
  const el = {
    tagName: tag.toUpperCase(), id: options.id || '', type: options.type || '',
    value: options.value || '', placeholder: options.placeholder || '',
    childNodes: [node],
    closest(selector) { return selector === 'select' ? options.select || null : selector === '.nav-user,.pro-user-name' && options.identity ? this : null; },
    matches(selector) {
      return selector.split(',').some(part => {
        part = part.trim();
        if (part === tag.toLowerCase()) return true;
        if (part === '.card ' + tag.toLowerCase()) return Boolean(options.card);
        if (part === 'input[type="submit"]') return tag === 'input' && this.type === 'submit';
        if (part === 'input[type="button"]') return tag === 'input' && this.type === 'button';
        if (part[0] === '.' && classes.has(part.slice(1))) return true;
        if (part === '#datatable-streampage tbody td:last-child > div') return Boolean(options.infoCell);
        if (part.startsWith('[id^="') && part.endsWith('"]')) return this.id.startsWith(part.slice(6, -2));
        return false;
      });
    }
  };
  node.parentElement = el;
  return el;
}
function translated(tag, value, options) {
  const el = element(tag, value, options);
  context.translate(el);
  return el.childNodes[0].textContent;
}

assert.equal(translated('button', '  Manage   Bouquets  '), '  Gerenciar listas de canais  ');
assert.equal(translated('button', 'Add Bouquet'), 'Adicionar lista de canais');
assert.equal(translated('h4', 'Close', {card: true}), 'Close');
assert.equal(translated('button', 'Close', {identity: true}), 'Close');
assert.equal(translated('button', 'Manage Bouquets', {identity: true}), 'Manage Bouquets');
assert.equal(translated('th', 'NAME'), 'Nome');
assert.equal(translated('th', 'Clients'), 'Clientes');
assert.equal(translated('th', 'UPTIME'), 'Tempo ativo');
assert.equal(translated('th', 'Icon'), 'Ícone');
assert.equal(translated('th', 'Player'), 'Reprodutor');
assert.equal(translated('th', 'Last Updated'), 'Última atualização');

for (const page of ['stream', 'movies', 'episodes']) {
  assert.equal(translated('option', 'No Filter', {select: {id: page + '_filter'}}), 'Sem filtro');
  assert.equal(translated('span', 'No Filter', {id: 'select2-' + page + '_filter-container'}), 'Sem filtro');
  assert.equal(translated('li', 'Stopped', {id: 'select2-' + page + '_filter-result-12-3'}), 'Parados');
  assert.equal(translated('option', 'Audio', {select: {id: page + '_audio'}}), 'Áudio');
  assert.equal(translated('option', 'Video', {select: {id: page + '_video'}}), 'Vídeo');
}

// Os mesmos textos em dados cadastrados não passam pelo dicionário de interface.
for (const value of ['Name', 'Clients', 'Uptime', 'Audio', 'No Filter', 'Manage Bouquets']) {
  assert.equal(translated('small', value), value);
  assert.equal(translated('a', value), value);
  assert.equal(translated('option', value, {select: {id: 'category_id'}}), value);
  assert.equal(translated('span', value, {id: 'select2-category_id-container'}), value);
}
assert.equal(translated('button', 'ON DEMAND'), 'ON DEMAND');
assert.equal(translated('button', 'DIRECT SOURCE'), 'DIRECT SOURCE');
assert.equal(translated('option', 'aac', {select: {id: 'stream_audio'}}), 'aac');
assert.equal(translated('option', 'h264', {select: {id: 'stream_video'}}), 'h264');

const message = element('div', 'No information available', {infoCell: true});
context.translate(message);
assert.equal(message.childNodes[0].textContent, 'Nenhuma informação disponível');
for (const value of ['Default', 'Name', 'Audio', 'Main Server']) {
  assert.equal(translated('div', value, {infoCell: true}), value);
}
const heading = element('th', 'Name');
assert.equal(context.attributeTranslation(heading, 'aria-label', 'Name: ordenar em ordem crescente'), 'Nome: ordenar em ordem crescente');
assert.equal(context.attributeTranslation(heading, 'aria-label', 'NAME: activate to sort column descending'), 'Nome: ordenar em ordem decrescente');
assert.equal(context.attributeTranslation(heading, 'aria-label', 'Nome: ordenar em ordem crescente'), 'Nome: ordenar em ordem crescente');
assert.equal(context.attributeTranslation(heading, 'aria-label', 'ID: activate to sort column ascending'), 'ID: ordenar em ordem crescente');

// Um refresh que troca só o nó de texto também precisa agendar a tradução.
const updatedButton = element('button', 'Manage Bouquets');
context.textChanged(updatedButton.childNodes[0]);
const updatedHeader = element('th', 'NAME');
context.textChanged(updatedHeader.childNodes[0]);
const updatedFilter = element('span', 'No Filter', {id: 'select2-stream_filter-container', classes: ['select2-selection__rendered']});
context.textChanged(updatedFilter.childNodes[0]);
const updatedInfo = element('div', 'No information available', {infoCell: true});
context.textChanged(updatedInfo.childNodes[0]);
assert.deepEqual(queued, [updatedButton, updatedHeader, updatedFilter, updatedInfo]);
context.textChanged(element('small', 'Name').childNodes[0]);
assert.equal(queued.length, 4);

const name = element('input', '', {type: 'text', value: 'Default', placeholder: 'Search...'});
context.translateInput(name);
assert.equal(name.value, 'Default');
assert.equal(name.placeholder, 'Pesquisar…');
const submit = element('input', '', {type: 'submit', value: 'Add Bouquet'});
context.translateInput(submit);
assert.equal(submit.value, 'Adicionar lista de canais');
console.log('PASS: textos de interface, filtros e mensagens dinâmicas em PT-BR; dados e modos preservados.');
