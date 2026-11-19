/* Traduções do painel: DOM sintético, valores e ações preservados; sem rede. */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
let JSDOM;
try { ({JSDOM} = require(process.env.NAXX_JSDOM || 'jsdom')); }
catch (error) { throw new Error('Instale jsdom ou defina NAXX_JSDOM para executar esta verificação offline.', {cause:error}); }

const source = fs.readFileSync(path.join(__dirname, '../xui-naxx/src/panel-translations-ui.js'), 'utf8');
const dom = new JSDOM(`<!doctype html><body>
  <div class="navigation-menu"><a id="tools" href="./server">Server Tools</a></div>
  <div class="nav-user"><a class="header-title">Provider Streams</a></div>
  <div class="bs-domains modal"><h4 id="modalLabel">Domain List</h4></div>
  <div class="creditsModal modal"><h4>Add / Remove Credits</h4><label>Credits</label><input name="credits" value="10"><button id="adjust" type="button">Adjust Credits</button></div>
  <div class="bs-picon-modal-center modal"><h4 id="epgPiconLabel">Use the EPG icon for this stream?</h4><button id="epg_picon_save" title="Use Icon" data-original-title="Use Icon" aria-label="Use Icon"><i class="icon"></i> Use Icon </button><button>Cancel</button></div>
  <button id="programmeRecord" data-id="42">Record</button>
  <label for="title">Series Name</label><input id="title" value="Series Name">
  <label for="cover">Poster URL</label><input id="cover" value="https://example.test/Poster%20URL">
  <label for="cast">Cast</label><label for="rating">Rating</label>
  <label for="timezone">Timezone</label><select id="timezone"><option value="America/Sao_Paulo">America/Sao_Paulo</option></select>
  <table><thead><tr><th>Credits</th><th>Server Name</th><th>Stream Info</th></tr></thead><tbody><tr><td><a>Server Tools</a></td><td>Credits</td><td><span>Stream Info</span></td></tr></tbody></table>
  <div class="downloadModal modal"><h4 id="downloadModal">Download Playlist</h4><label>Format</label><select id="download_type"><option value="m3u_plus">M3U With Options</option></select><label>Limit Output</label><select id="output_type"><option value="ts">MPEG-TS</option></select></div>
  <div class="jBox-Confirm jBox-Modal"><div class="jBox-title">Confirm</div><div class="jBox-content">Are you sure you want to kill all connections for this line?</div><div class="jBox-Confirm-button jBox-Confirm-button-cancel">Cancel</div><div class="jBox-Confirm-button jBox-Confirm-button-submit">Kill</div></div>
  <div class="jq-toast-single"><span class="close-jq-toast-single">×</span> Line has been disabled. </div>
  <div class="jBox-Tooltip"><div class="jBox-content">Line has been disabled.</div></div>
  <p id="data">Credits have been adjusted.</p><input name="username" value="Credits"><input name="password" value="Record"><textarea>Server Tools</textarea>
  <div contenteditable="true"><div class="jq-toast-single">Line has been disabled.</div></div>
</body>`, {url:'https://example.test/lines', runScripts:'outside-only'});
const {window} = dom, document = window.document;
let networkCalls = 0;
window.fetch = () => { networkCalls++; throw new Error('Esta verificação não permite rede.'); };
window.eval(source);
const enhance = window.NaxxPanelTranslations.enhance;
const icon = document.querySelector('#epg_picon_save i');
const piconButton = document.getElementById('epg_picon_save');
const confirmButton = document.querySelector('.jBox-Confirm-button-submit');
let nativeAction = 0;
piconButton.addEventListener('click', () => nativeAction++);
confirmButton.addEventListener('click', () => nativeAction++);
const inputs = Array.from(document.querySelectorAll('input,textarea,select')).map(el => ({el, value:el.value, html:el.innerHTML}));
const playlist = document.querySelector('.downloadModal').outerHTML;
const tableData = document.querySelector('tbody').outerHTML;
enhance(document);

assert.equal(document.getElementById('tools').textContent, 'Ferramentas do servidor');
assert.equal(document.getElementById('tools').getAttribute('href'), './server');
assert.equal(document.querySelector('.nav-user a').textContent, 'Provider Streams');
assert.equal(document.querySelector('.bs-domains h4').textContent, 'Lista de domínios');
assert.equal(document.querySelector('.creditsModal h4').textContent, 'Adicionar ou remover créditos');
assert.equal(document.querySelector('.creditsModal label').textContent, 'Créditos');
assert.equal(document.getElementById('adjust').textContent, 'Ajustar créditos');
assert.equal(document.querySelector('#epgPiconLabel').textContent, 'Usar o ícone da EPG neste canal?');
assert.equal(piconButton.textContent, ' Usar ícone ');
assert.equal(piconButton.querySelector('i'), icon, 'A tradução deve preservar o elemento e seus eventos.');
for (const attribute of ['title', 'data-original-title', 'aria-label']) assert.equal(piconButton.getAttribute(attribute), 'Usar ícone');
assert.equal(document.getElementById('programmeRecord').textContent, 'Gravar');
assert.equal(document.querySelector('label[for="title"]').textContent, 'Nome da série');
assert.equal(document.querySelector('label[for="cover"]').textContent, 'URL do pôster');
assert.equal(document.querySelector('label[for="cast"]').textContent, 'Elenco');
assert.equal(document.querySelector('label[for="rating"]').textContent, 'Classificação');
assert.equal(document.querySelector('label[for="timezone"]').textContent, 'Fuso horário');
assert.deepEqual(Array.from(document.querySelectorAll('thead th'), el => el.textContent), ['Créditos', 'Nome do servidor', 'Informações do canal']);
assert.equal(document.querySelector('.jBox-Confirm .jBox-content').textContent, 'Deseja encerrar todas as conexões desta conta?');
assert.equal(document.querySelector('.jBox-Confirm .jBox-title').textContent, 'Confirmar');
assert.equal(confirmButton.textContent, 'Encerrar');
assert.equal(document.querySelector('.jBox-Confirm-button-cancel').textContent, 'Cancelar');
assert.equal(document.querySelector('.jq-toast-single').textContent, '× A conta foi desativada. ');
assert.equal(document.querySelector('.jBox-Tooltip .jBox-content').textContent, 'Line has been disabled.');
assert.equal(document.querySelector('[contenteditable] .jq-toast-single').textContent, 'Line has been disabled.');
assert.equal(document.getElementById('data').textContent, 'Credits have been adjusted.');
assert.equal(document.querySelector('tbody').outerHTML, tableData, 'Nomes cadastrados não são textos da interface.');
assert.equal(document.querySelector('.downloadModal').outerHTML, playlist, 'A integração não interfere no módulo da lista.');
for (const item of inputs) {
  assert.equal(item.el.value, item.value);
  assert.equal(item.el.innerHTML, item.html);
}
piconButton.click(); confirmButton.click();
assert.equal(nativeAction, 2, 'Os botões mantêm as ações nativas.');
const translatedHTML = document.body.innerHTML;
enhance(document);
assert.equal(document.body.innerHTML, translatedHTML, 'Executar novamente não altera traduções prontas.');

// Estrutura verificada da tela de contas: "Ativo" indica a habilitação da
// conta; "Active" é outra coluna e indica o uso atual das conexões.
const accountDOM = new JSDOM(`<!doctype html><body>
  <div class="page-title-box"><button id="add-line" type="button">Add Line</button></div>
  <div id="collapse_filters"><label>Filter Results</label><label>Show</label>
    <select id="user_filter"><option value="0">No Filter</option></select>
    <span id="select2-user_filter-container">No Filter</span>
    <select id="user_reseller"><option value="">Search for an owner...</option><option value="42">Owner</option><option value="43">Search for an owner...</option></select>
    <span id="select2-user_reseller-container"><span class="select2-selection__placeholder">Search for an owner...</span></span>
  </div>
  <table id="datatable-users"><thead><tr>${['ID','USERNAME','PASSWORD','OWNER','Status','Ativo','TRIAL','Retransmissor','ACTIVE','Conexões','EXPIRATION','LAST CONNECTION','Ações'].map(text => '<th>' + text + '</th>').join('')}</tr></thead><tbody>
    <tr>${['1','Never','Password','Owner','Active','Ativo','Trial','Restreamer','Active','1','Never','Never','Add Line'].map(text => '<td class="dt-center">' + text + '</td>').join('')}</tr>
  </tbody></table><p>Never</p>
</body>`, {url:'https://example.test/lines', runScripts:'outside-only'});
const accountWindow = accountDOM.window, accountDocument = accountWindow.document;
Object.defineProperty(accountDocument, 'readyState', {value:'complete', configurable:true});
accountWindow.eval(source); // A carga tardia também traduz a tela inicial.
assert.equal(accountDocument.querySelector('#add-line').textContent, 'Adicionar conta');
assert.deepEqual(Array.from(accountDocument.querySelectorAll('#collapse_filters > label'), el => el.textContent), ['Filtrar resultados','Exibir']);
assert.deepEqual(Array.from(accountDocument.querySelectorAll('#datatable-users thead th'), el => el.textContent), ['ID','Usuário','Senha','Responsável','Status','Ativo','Teste','Retransmissor','Em uso','Conexões','Vencimento','Última conexão','Ações']);
assert.deepEqual(Array.from(accountDocument.querySelectorAll('#datatable-users tbody td'), el => el.textContent), ['1','Never','Password','Owner','Active','Ativo','Trial','Restreamer','Active','1','Never','Nunca','Add Line']);
assert.equal(accountDocument.querySelector('#user_filter').value, '0');
assert.equal(accountDocument.querySelector('#user_filter option').textContent, 'Sem filtro');
assert.equal(accountDocument.querySelector('#select2-user_filter-container').textContent, 'Sem filtro');
assert.equal(accountDocument.querySelector('#select2-user_reseller-container').textContent, 'Pesquisar responsável…');
assert.equal(accountDocument.querySelector('#user_reseller option[value="42"]').textContent, 'Owner');
assert.equal(accountDocument.querySelector('#user_reseller option[value="43"]').textContent, 'Search for an owner...');
const ownerSelect = accountDocument.querySelector('#user_reseller');
ownerSelect.value = '43';
const ownerCaption = accountDocument.querySelector('#select2-user_reseller-container');
ownerCaption.textContent = 'Search for an owner...';
accountWindow.NaxxPanelTranslations.enhance(ownerCaption);
assert.equal(ownerCaption.textContent, 'Search for an owner...', 'Um responsável selecionado é dado cadastrado, mesmo que tenha o texto da instrução.');
assert.equal(ownerSelect.value, '43');
const lastConnection = accountDocument.querySelectorAll('#datatable-users tbody td')[11];
lastConnection.textContent = 'Never';
accountWindow.NaxxPanelTranslations.enhance(lastConnection);
assert.equal(lastConnection.textContent, 'Nunca');
assert.equal(accountDocument.querySelector('p').textContent, 'Never');
accountDOM.window.close();

// Inicialização normal, antes de DOMContentLoaded.
const earlyDOM = new JSDOM('<!doctype html><body><h4 id="restartServicesLabel">Server Tools</h4></body>', {runScripts:'outside-only'});
earlyDOM.window.eval(source);
earlyDOM.window.document.dispatchEvent(new earlyDOM.window.Event('DOMContentLoaded'));
assert.equal(earlyDOM.window.document.querySelector('h4').textContent, 'Ferramentas do servidor');
earlyDOM.window.close();

// O painel reutiliza os elementos das notificações e das confirmações.
const toast = document.querySelector('.jq-toast-single');
toast.lastChild.nodeValue = ' Generating CSV report... ';
enhance(toast);
assert.equal(toast.lastChild.nodeValue, ' Gerando relatório CSV… ');
toast.lastChild.nodeValue = ' Credits have been adjusted. ';
enhance(toast.lastChild);
assert.equal(toast.lastChild.nodeValue, ' Os créditos foram ajustados. ');
const confirmation = document.querySelector('.jBox-Confirm .jBox-content');
confirmation.innerHTML = '<p>Are you sure you want to delete these streams?</p>';
enhance(confirmation);
assert.equal(confirmation.textContent, 'Deseja excluir estes canais?');
toast.lastChild.nodeValue = 'Line has been disabled. Customer A';
enhance(toast);
assert.equal(toast.lastChild.nodeValue, 'Line has been disabled. Customer A', 'Mensagens com dados adicionais não recebem substituições parciais.');

// Audita o dicionário-base sem confundir siglas e termos técnicos com lacunas.
const language = new Map();
for (const filename of ['pt-BR.tsv', 'settings-pt-BR.tsv', 'settings-help-pt-BR.tsv', 'permissions-pt-BR.tsv']) {
  const content = fs.readFileSync(path.join(__dirname, '../xui-naxx/src', filename), 'utf8');
  assert.ok(!content.includes('\uFFFD'), filename + ': UTF-8 inválido.');
  const keys = new Set();
  for (const line of content.replace(/^\uFEFF/, '').split(/\r?\n/).filter(Boolean)) {
    const [key, value, extra] = line.split('\t');
    assert.ok(key && value && extra === undefined, filename + ': linha TSV inválida.');
    assert.ok(!keys.has(key), filename + ': chave repetida ' + key);
    keys.add(key); language.set(key, value);
  }
}
const originalLanguage = path.join(__dirname, '../../xui-original/includes/langs/en.ini');
let baselineKeys = 0;
if (fs.existsSync(originalLanguage)) {
  const original = fs.readFileSync(originalLanguage, 'utf8');
  const technical = new Set(['aes', 'id', 'ip', 'm3u', 'pid', 'status', 'threads']);
  for (const [, key, value] of original.matchAll(/^(\w+)\s*=\s*"(.*)"\s*$/gm)) {
    baselineKeys++;
    assert.ok(language.has(key), 'Chave nativa sem tradução: ' + key);
    if (language.get(key) === value) assert.ok(technical.has(key), 'Inglês remanescente na chave: ' + key);
  }
}

// Quando as capturas locais estão disponíveis, valida todas as mensagens
// literais em inglês emitidas pelos scripts, sem exibir o conteúdo privado.
const nativeMessages = new Set();
const englishPrefix = /^(?:All |An |Are |Cache |Connection|Connections|Could |Credits |Enter |Episodes |Fingerprint |Generating |Handler |Individual |Item |Line |Movies |No new |Please |Quick |Redis |Regenerating |Required |Select |Series |Sorry|Stream|The |This |User |You |Your )/;
for (const filename of fs.readdirSync(__dirname).filter(name => name.endsWith('.html'))) {
  const markup = fs.readFileSync(path.join(__dirname, filename), 'utf8');
  const scripts = Array.from(markup.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi), match => match[1]).join('\n');
  const literals = [
    /(?:showError|showSuccess|\$\.toast)\(\s*("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')\s*[,)]/g,
    /content\s*:\s*("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')\s*[,}]/g
  ];
  for (const pattern of literals) for (const match of scripts.matchAll(pattern)) {
    const value = vm.runInNewContext(match[1]); // Apenas um literal, validado pela expressão acima.
    if (value.length < 250 && englishPrefix.test(value) && !/[<@]|https?:|(?:token|password|username)=/i.test(value)) nativeMessages.add(value);
  }
}
for (const value of nativeMessages) {
  toast.textContent = value; enhance(toast);
  assert.notEqual(toast.textContent, value, 'Uma mensagem nativa fixa permaneceu em inglês.');
}
assert.equal(networkCalls, 0);
dom.window.close();
console.log('PASS: diálogos, formulários, cabeçalhos e notificações em PT-BR; dados, lista, valores e ações preservados. Base auditada: ' + baselineKeys + ' chaves; mensagens nativas: ' + nativeMessages.size + '.');
