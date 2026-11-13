/* Marcadores de tema acompanham a rota em navegação parcial, sem alterar conteúdo. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../xui-naxx/src/naxx.js'), 'utf8');
const start = source.indexOf('  function enhanceModernImages(root)');
const end = source.indexOf('  function removeKnowledgebaseLinks(root)', start);
assert(start > 0 && end > start);
const classes = new Set();
const context = {location: {pathname: '/streams'}, window: {}, within: () => [],
  document: {body: {classList: {toggle(name, enabled) {enabled ? classes.add(name) : classes.delete(name);}}}}};
vm.createContext(context);
vm.runInContext(source.slice(start, end), context);
for (const [route, channel, content] of [
  ['/streams', true, true], ['/stream_mass', true, true], ['/stream_mass.php', true, true],
  ['/movies', false, true], ['/series.php', false, true], ['/bouquet', false, false],
  ['/stream_mass_other', false, false], ['/admin/stream_mass', true, true], ['/login', false, false]
]) {
  context.location.pathname = route;
  context.enhanceModernImages({});
  assert.equal(classes.has('naxx-streams-page'), channel, route);
  assert.equal(classes.has('naxx-content-list'), content, route);
}
console.log('PASS: cores e imagens nas listas e edição em massa; marcadores removidos ao trocar de rota.');
