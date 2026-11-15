/* Regressão de DOM/CSS da edição em massa. JSDOM verifica estilos, não geometria
 * renderizada; sem HTTP. Dependência: jsdom ou a variável NAXX_JSDOM. */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
let JSDOM, VirtualConsole;
try {({JSDOM, VirtualConsole} = require(process.env.NAXX_JSDOM || 'jsdom'));}
catch (error) {throw new Error('Instale jsdom ou defina NAXX_JSDOM para executar esta verificação offline.', {cause:error});}
const read = name => fs.readFileSync(path.join(__dirname, '../xui-naxx/src/', name), 'utf8');
const css = read('naxx.css'), overlay = read('naxx.js');
const sourceModule = read('stream-source-ui.js'), massModule = read('stream-mass-ui.js');
const wrapperStart = overlay.indexOf("    within(root,'table.table').forEach(function (table) {");
const wrapperEnd = overlay.indexOf("    within(root,'.navbar-toggle')", wrapperStart);
assert(wrapperStart >= 0 && wrapperEnd > wrapperStart, 'localiza o código real de rolagem de tabelas');
const scrollingCode = overlay.slice(wrapperStart, wrapperEnd);
const spanSelector = '#stream-selection>.row.naxx-stream-source-filters>.xui-table-scroll';
assert(css.includes(',' + spanSelector + '{grid-column:1/-1;'), 'o seletor corrigido existe na regra de largura completa');
const previousCSS = css.replace(',' + spanSelector + '{grid-column:1/-1;', '{grid-column:1/-1;');
assert.notEqual(previousCSS, css);

// A topologia reproduz o HTML nativo: seis controles e tabela na MESMA .row.
const html = `<!doctype html><html class="naxx-ready"><head></head><body>
  <small id="selected_count"></small><div id="stream-selection" class="tab-pane">
    <div class="row">
      <div class="col-md-2 col-6"><input id="stream_search"></div>
      <div class="col-md-3 col-6"><select id="stream_server_id"><option value="">Todos</option></select></div>
      <div class="col-md-3 col-6"><select id="category_search"><option value="">Todas</option></select></div>
      <div class="col-md-2 col-6"><select id="stream_filter"><option value="">Todos</option></select></div>
      <div class="col-md-1 col-6"><select id="show_entries"><option value="50">50</option></select></div>
      <div class="col-md-1 col-6"><button type="button" onclick="toggleStreams()">Selecionar</button></div>
      <table id="datatable-mass" class="table table-borderless mb-0"><thead><tr>
        <th>ID</th><th>Ícone</th><th>Nome</th><th>Categoria</th><th>Servidor</th><th>Status</th>
      </tr></thead><tbody><tr><td>123</td><td>Logo</td><td>Canal</td><td>Categoria</td><td>Servidor</td><td>Ativo</td></tr></tbody></table>
    </div>
  </div><div id="movie-selection"><div class="row naxx-stream-source-filters"><div class="xui-table-scroll"><table class="table"><tbody><tr><td>Outro conteúdo</td></tr></tbody></table></div></div></div>
</body></html>`;

async function fixture(order) {
  const errors = [], console = new VirtualConsole();
  console.on('jsdomError', error => errors.push(error.message));
  const dom = new JSDOM(html, {url:'https://naxx.example.test/admin/stream_mass', runScripts:'outside-only', virtualConsole:console});
  const {window} = dom, document = window.document;
  Object.defineProperty(document, 'readyState', {value:'complete', configurable:true});
  const filters = document.querySelector('#stream-selection>.row'), table = document.getElementById('datatable-mass');
  const originalTable = table, originalControls = Array.from(filters.children).filter(node => node !== table);
  const originalHeader = table.tHead, originalBody = table.tBodies[0], originalRow = originalBody.rows[0];
  assert.equal(originalControls.length, 6);
  function genericScroll() {
    // Execute o bloco do produto, sem reimplementar suas decisões de wrapping.
    window.eval('(function(){var root=document;function within(root, selector){return Array.from(root.querySelectorAll(selector));}\n' + scrollingCode + '\n}());');
  }
  function dataTablesWrap() {
    // Contêineres estruturais do DataTables Bootstrap 4, sem simular seu layout.
    const wrapper = document.createElement('div');
    wrapper.id = 'datatable-mass_wrapper'; wrapper.className = 'dataTables_wrapper dt-bootstrap4';
    const row = document.createElement('div'), column = document.createElement('div');
    row.className = 'row'; column.className = 'col-sm-12';
    table.before(wrapper); wrapper.appendChild(row); row.appendChild(column); column.appendChild(table);
  }
  if (order === 'scroll-before-datatables') {genericScroll(); dataTablesWrap();}
  else if (order === 'datatables-before-scroll') {dataTablesWrap(); genericScroll();}
  else if (order === 'datatables') dataTablesWrap();

  const settings = {_bInitComplete:true, ajax:{url:'./table', data(params){params.id = 'stream_list';}}};
  const api = {settings:() => [settings], page:{len:() => 50}, rows:() => ({count:() => 1, every(callback){callback.call({node:() => originalRow, data:() => ['123']});}})};
  function jq() {return {on(){return this;}, off(){return this;}, DataTable:() => api};}
  jq.fn = {dataTable:{isDataTable:node => node === table}};
  window.jQuery = jq; window.rSelected = ['123']; window.toggleStreams = function() {};
  window.fetch = async url => {
    assert.equal(new URL(url).pathname, '/admin/naxx-update.php', 'somente catálogo local de fontes');
    return {ok:true, json:async () => ({ok:true, hosts:['fonte.example.test']})};
  };
  window.eval(sourceModule);
  await new Promise(resolve => setImmediate(resolve));
  assert(filters.classList.contains('naxx-stream-source-filters'), 'o módulo real monta o filtro de fonte');
  window.eval(massModule);
  assert.equal(document.querySelectorAll('.naxx-stream-mass-selection').length, 1, 'a barra real de seleção permanece montada');
  assert.equal(table.previousElementSibling.className, 'naxx-stream-mass-selection', 'a barra permanece imediatamente antes da tabela');
  let owner = table;
  while (owner.parentElement !== filters) owner = owner.parentElement;
  const sourceControl = document.querySelector('.naxx-stream-source-control');
  const controls = originalControls.concat(sourceControl);
  assert.equal(controls.length, 7);
  assert.equal(sourceControl.previousElementSibling, document.getElementById('category_search').parentElement);
  const structure = filters.innerHTML;
  return {window, document, filters, table, owner, controls,
    assertStructure() {
      assert.equal(filters.innerHTML, structure, 'aplicar CSS não move nem recria nós');
      assert.equal(document.getElementById('datatable-mass'), originalTable);
      assert.equal(table.tHead, originalHeader); assert.equal(table.tBodies[0], originalBody);
      assert.equal(table.tBodies[0].rows[0], originalRow);
      assert.equal(table.tHead.rows[0].cells.length, 6); assert.equal(originalRow.cells.length, 6);
      for (const control of controls) assert.equal(control.parentElement, filters, 'controle permanece na grade de filtros');
    },
    close() {dom.window.close(); assert.deepEqual(errors, [], 'zero erros no DOM/CSS');}
  };
}

function applyCSS(h, stylesheet, width) {
  h.document.querySelectorAll('style').forEach(node => node.remove());
  const style = h.document.createElement('style'); style.textContent = stylesheet; h.document.head.appendChild(style);
  // JSDOM não avalia media queries. Ative apenas as regras reais da grade para
  // a largura do cenário; a regra de span deve continuar fora dessas queries.
  const active = [];
  for (const rule of Array.from(style.sheet.cssRules)) {
    if (rule.type !== h.window.CSSRule.MEDIA_RULE || !rule.cssText.includes('#stream-selection>.row.naxx-stream-source-filters')) continue;
    const max = /max-width:\s*([\d.]+)px/.exec(rule.conditionText);
    assert(max, 'media query da grade usa max-width conhecido');
    if (width <= Number(max[1])) active.push(...Array.from(rule.cssRules, child => child.cssText));
  }
  const responsive = h.document.createElement('style'); responsive.textContent = active.join('\n'); h.document.head.appendChild(responsive);
}

function assertFullWidth(h, label) {
  const style = h.window.getComputedStyle(h.owner);
  assert.equal(style.gridColumn.replace(/\s/g, ''), '1/-1', label + ': contêiner direto ocupa todas as colunas');
  assert.equal(style.width, '100%', label + ': contêiner conserva largura completa');
  assert.equal(Number.parseFloat(style.minWidth), 0, label + ': contêiner pode encolher sem alargar a página');
}

(async () => {
  for (const order of ['table', 'datatables', 'scroll-before-datatables', 'datatables-before-scroll']) {
    const h = await fixture(order);
    try {
      if (order === 'scroll-before-datatables') assert(h.owner.classList.contains('xui-table-scroll'));
      if (order === 'datatables' || order === 'datatables-before-scroll') assert(h.owner.classList.contains('dataTables_wrapper'));
      for (const [width, columns] of [[1400,4], [1000,3], [700,2], [500,1]]) {
        applyCSS(h, css, width);
        assert.equal(h.window.getComputedStyle(h.filters).gridTemplateColumns, columns === 1 ? 'minmax(0,1fr)' : 'repeat(' + columns + ',minmax(0,1fr))');
        assertFullWidth(h, order + '/' + columns + ' colunas');
        for (const control of h.controls) assert.notEqual(h.window.getComputedStyle(control).gridColumn.replace(/\s/g, ''), '1/-1', 'filtro não recebe span de tabela');
        for (const scroller of h.filters.querySelectorAll('.xui-table-scroll')) assert.equal(h.window.getComputedStyle(scroller).overflowX, 'auto', 'rolagem horizontal preservada');
        const unrelated = h.document.querySelector('#movie-selection .xui-table-scroll');
        assert.notEqual(h.window.getComputedStyle(unrelated).gridColumn.replace(/\s/g, ''), '1/-1', 'correção isolada da edição em massa de canais');
        h.assertStructure();
      }
      applyCSS(h, previousCSS, 1400);
      if (order === 'scroll-before-datatables') {
        assert.throws(() => assertFullWidth(h, 'CSS anterior'), assert.AssertionError, 'a regra antiga reproduz a falha do contêiner de rolagem');
        assert.notEqual(h.window.getComputedStyle(h.owner).gridColumn.replace(/\s/g, ''), '1/-1');
      } else assertFullWidth(h, 'CSS anterior: topologia já atendida');
      console.log('DOM/CSS: ' + order + ' — 4/3/2/1 colunas; tabela, filtros e barra preservados.');
    } finally {h.close();}
  }
  console.log('Regressão comprovada: retirar apenas o novo seletor perde o span no wrapper externo .xui-table-scroll. Sem afirmar geometria de navegador.');
})().catch(error => {console.error(error); process.exitCode = 1;});
