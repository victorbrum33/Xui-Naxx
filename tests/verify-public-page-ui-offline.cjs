/* Página inicial: integração com as sete abas nativas em DOM sintético; nenhum HTTP ou salvamento real. */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
let JSDOM, VirtualConsole;
try {({JSDOM, VirtualConsole} = require(process.env.NAXX_JSDOM || 'jsdom'));}
catch (error) {throw new Error('Instale jsdom ou defina NAXX_JSDOM para executar esta verificação offline.', {cause:error});}
const source = fs.readFileSync(path.join(__dirname, '../xui-naxx/src/public-page-ui.js'), 'utf8');
const themeRoot = path.join(__dirname, '../xui-naxx/src/public-themes');
const catalog = JSON.parse(fs.readFileSync(path.join(themeRoot, 'catalog.json'), 'utf8'));
const themeIds = ['naxx', 'aurora', 'claro', 'cinema'];
const csrf = 'a'.repeat(64);
const nativeTabs = ['interface', 'security', 'api', 'streaming', 'mag', 'webplayer', 'logs'];
const tick = () => new Promise(resolve => setImmediate(resolve));
async function until(check, message) {for (let count = 0; count < 100; count++) {if (check()) return; await tick();} assert.fail(message);}
function deferred() {let resolve, reject; const promise = new Promise((yes, no) => {resolve = yes; reject = no;}); return {promise, resolve, reject};}
function status(selected = 'original', overrides = {}) {return {ok:true, csrf, state:{available:themeIds.slice(), selected, can_publish:true, can_restore:selected !== 'original', ...overrides}};}
function preview(id) {return {ok:true, preview:{theme:id, html:fs.readFileSync(path.join(themeRoot, id + '.html'), 'utf8')}};}
function markup() {
  // Topologia nativa: form POST action="#", sete abas e sete panes; valores abaixo são sintéticos.
  return '<!doctype html><html lang="pt-BR"><body><main><form method="POST" action="#"><button type="submit" name="submit_settings" value="1">Salvar configurações</button><input name="server_name" value="Servidor de teste"><input type="password" name="private_example" value="NAO-ENVIAR"><div id="basicwizard"><ul class="nav nav-pills bg-light nav-justified form-wizard-header mb-4">' +
    nativeTabs.map((id, index) => '<li class="nav-item"><a class="nav-link rounded-0 pt-2 pb-2' + (index ? '' : ' active') + '" data-toggle="tab" href="#' + id + '">' + id + '</a></li>').join('') +
    '</ul><div class="tab-content">' + nativeTabs.map((id, index) => '<div id="' + id + '" class="tab-pane' + (index ? '' : ' active') + '"><input name="' + id + '_native" value="preservado-' + id + '"></div>').join('') +
    '</div></div></form></main></body></html>';
}
function fixture(options = {}) {
  const errors = [], requests = [], saved = [], virtualConsole = new VirtualConsole();
  virtualConsole.on('jsdomError', error => errors.push(error.message));
  const dom = new JSDOM(markup(), {url:'https://naxx.example.test' + (options.pathname || '/settings'), runScripts:'outside-only', virtualConsole});
  const {window} = dom, document = window.document;
  Object.defineProperty(document, 'readyState', {value:'complete', configurable:true});
  // Bootstrap impede a navegação nativa das âncoras de aba; a fixture conserva esse contrato.
  document.addEventListener('click', event => {if (event.target.closest('a[data-toggle="tab"]')) event.preventDefault();});
  const form = document.querySelector('form');
  form.addEventListener('submit', event => {event.preventDefault(); saved.push(Array.from(new window.FormData(form).entries()));});
  const originalData = Array.from(new window.FormData(form).entries());
  const originalPanes = nativeTabs.map(id => document.getElementById(id));
  const originalLinks = nativeTabs.map(id => document.querySelector('a[href="#' + id + '"]'));
  window.fetch = (address, init) => {
    const url = new URL(address), pending = deferred(), request = {url, init, pending};
    assert.equal(url.origin, 'https://naxx.example.test', 'todas as consultas ficam na mesma origem');
    assert.equal(url.pathname, '/naxx-update.php');
    assert.equal(url.searchParams.get('feature'), 'public-page');
    assert.equal(init.credentials, 'same-origin'); assert.equal(init.cache, 'no-store');
    assert.equal(init.headers.Accept, 'application/json'); assert.equal(init.headers['X-Requested-With'], 'XMLHttpRequest');
    assert(init.signal instanceof window.AbortSignal, 'cada consulta tem cancelamento');
    request.answer = (value, response = {}) => pending.resolve({ok:true, redirected:false, url:url.href, text:async () => JSON.stringify(value), ...response});
    request.fail = error => pending.reject(error);
    requests.push(request); return pending.promise;
  };
  window.eval(source);
  const h = {dom, window, document, form, originalData, originalPanes, originalLinks, requests, saved, errors,
    node(selector) {const result = document.querySelector(selector); assert(result, 'controle ' + selector); return result;},
    click(selector) {this.node(selector).click();},
    card(id) {return this.node('[data-public-theme="' + id + '"]');},
    enhance() {window.NaxxPublicPage.enhance();},
    async open(result = status()) {
      this.click('#naxx-public-page-tab');
      await until(() => requests.length === 1, 'abrir a aba deve iniciar consulta de estado');
      requests[0].answer(result);
      await until(() => requests.length === 2, 'estado válido deve carregar a prévia inicial');
      return requests[1];
    },
    async ready(result = status()) {const request = await this.open(result); request.answer(preview(request.url.searchParams.get('preview'))); await until(() => !this.node('iframe').hidden, 'prévia inicial deve aparecer');},
    intact() {
      assert.deepEqual(Array.from(new window.FormData(form).entries()), originalData, 'não altera ou serializa campos nativos');
      nativeTabs.forEach((id, index) => {assert.equal(document.getElementById(id), originalPanes[index]); assert.equal(document.querySelector('a[href="#' + id + '"]'), originalLinks[index]);});
      assert.equal(saved.length, 0, 'a ferramenta não submete o formulário nativo');
    },
    close() {dom.window.close(); assert.deepEqual(errors, [], 'zero erros no DOM sintético');}
  };
  assert(window.NaxxPublicPage && typeof window.NaxxPublicPage.enhance === 'function');
  return h;
}

(async () => {
  assert.deepEqual(catalog.map(theme => theme.id), themeIds, 'catálogo contém exatamente os quatro temas autorizados');
  for (const theme of catalog) {
    assert.equal(theme.file, theme.id + '.html'); assert.equal(theme.swatches.length, 3);
    const html = fs.readFileSync(path.join(themeRoot, theme.file), 'utf8');
    const dom = new JSDOM(html), doc = dom.window.document;
    try {
      assert(/^<!doctype html>/i.test(html)); assert.equal(doc.documentElement.lang, 'pt-BR');
      assert.equal(doc.querySelectorAll('h1').length, 1); assert(doc.querySelector('meta[name="viewport"]'));
      assert.equal(doc.querySelectorAll('script,iframe,form,input,button,a,link,img,object,embed,base,audio,video').length, 0, 'tema público é informativo e autocontido');
      assert(!Array.from(doc.querySelectorAll('*')).some(node => Array.from(node.attributes).some(attr => /^on/i.test(attr.name) || /^(?:href|src|action|srcset|poster)$/i.test(attr.name))));
      assert(!/@import|url\(\s*['"]?https?:|nginx|xui|password|senha|access_code|localhost|127\.0\.0\.1/i.test(html));
      assert(/@media\s*\(max-width:\s*600px\)/.test(html), 'cada tema define composição móvel');
      assert(Buffer.byteLength(html) < 131072); assert.match(doc.body.textContent, /Sua próxima experiência/);
    } finally {dom.window.close();}
  }
  console.log('Temas: quatro HTML autocontidos, sem conteúdo ativo, navegação, recursos externos ou dados internos; CSS móvel presente.');

  {
    const h = fixture();
    try {
      assert.equal(h.requests.length, 0, 'não consulta antes de abrir a aba');
      const links = Array.from(h.document.querySelectorAll('.form-wizard-header a[data-toggle="tab"]'));
      assert.deepEqual(links.map(link => link.hash), nativeTabs.map(id => '#' + id).concat('#naxx-public-page'));
      assert.equal(h.node('a[href="#logs"]').closest('li').nextElementSibling.firstElementChild, h.node('#naxx-public-page-tab'), 'insere imediatamente após Logs');
      assert.equal(h.node('#naxx-public-page').parentElement, h.node('#logs').parentElement);
      assert.equal(h.document.querySelectorAll('[data-public-theme]').length, 4);
      assert.deepEqual(Array.from(h.document.querySelectorAll('[data-public-theme]'), node => node.dataset.publicTheme), themeIds);
      assert.equal(h.node('[role="radiogroup"]').getAttribute('aria-label'), 'Tema da página inicial');
      for (const button of h.node('#naxx-public-page').querySelectorAll('button')) assert.equal(button.type, 'button', 'controle auxiliar não submete formulário');
      h.enhance(); h.enhance();
      assert.equal(h.document.querySelectorAll('#naxx-public-page-tab').length, 1); assert.equal(h.document.querySelectorAll('#naxx-public-page').length, 1);
      assert.equal(h.requests.length, 0); h.intact();
      const initialPreview = await h.open();
      assert.equal(h.requests[0].init.method, undefined); assert.equal(h.requests[0].init.body, undefined);
      assert.equal(initialPreview.url.searchParams.get('preview'), 'naxx');
      initialPreview.answer(preview('naxx')); await until(() => !h.node('iframe').hidden, 'prévia deve aparecer');
      const frame = h.node('iframe'); assert.equal(frame.getAttribute('sandbox'), ''); assert.equal(frame.getAttribute('referrerpolicy'), 'no-referrer');
      assert.equal(frame.getAttribute('src'), null); assert.equal(frame.srcdoc, preview('naxx').preview.html);
      assert.equal(h.node('[data-public-open]').href, 'https://naxx.example.test/'); assert.equal(h.node('[data-public-open]').target, '_blank');
      assert(h.node('[data-public-open]').rel.includes('noopener'));
      h.click('[data-public-device="mobile"]');
      assert.equal(h.node('[data-public-preview-stage]').dataset.device, 'mobile'); assert.equal(h.node('[data-public-device="mobile"]').getAttribute('aria-pressed'), 'true');
      assert.equal(h.node('[data-public-device="desktop"]').getAttribute('aria-pressed'), 'false');
      h.click('[data-public-device="desktop"]'); assert.equal(h.node('[data-public-preview-stage]').dataset.device, 'desktop');
      assert.equal(h.requests.length, 2, 'trocar tamanho da prévia não consulta ou publica');
      h.click('#naxx-public-page-tab'); assert.equal(h.requests.length, 2, 'reabrir aba carregada não duplica consultas'); h.intact();
    } finally {h.close();}
    console.log('Configurações: oitava aba após Logs, sete abas/formulário preservados, montagem idempotente, GET preguiçoso e prévia isolada com modos computador/celular.');
  }

  {
    const h = fixture();
    try {
      await h.ready(); h.card('claro').click(); const old = h.requests[2];
      h.card('cinema').click(); const latest = h.requests[3];
      assert.equal(old.init.signal.aborted, true, 'nova escolha cancela prévia anterior');
      latest.answer(preview('cinema')); await until(() => !h.node('iframe').hidden, 'última prévia deve aparecer');
      old.answer(preview('claro')); await tick(); await tick();
      assert.equal(h.node('iframe').srcdoc, preview('cinema').preview.html, 'resposta antiga não substitui tema atual');
      assert.equal(h.card('cinema').getAttribute('aria-checked'), 'true'); assert.equal(h.card('cinema').tabIndex, 0);
      const count = h.requests.length; h.card('cinema').click(); assert.equal(h.requests.length, count, 'tema já exibido não recarrega');
      assert.equal(h.requests.filter(request => request.init.method === 'POST').length, 0, 'selecionar e visualizar nunca publica');
      h.click('[data-public-apply]'); const publish = h.requests.at(-1);
      assert.equal(publish.init.method, 'POST'); assert.equal(publish.init.headers['Content-Type'], 'application/json');
      assert.deepEqual(JSON.parse(publish.init.body), {action:'publish', theme:'cinema', csrf}, 'publicação contém apenas ação/tema/CSRF');
      assert.equal(h.node('[data-public-apply]').disabled, true); assert.equal(h.card('naxx').disabled, true);
      h.click('[data-public-apply]'); assert.equal(h.requests.at(-1), publish, 'duplo clique não publica duas vezes');
      publish.answer(status('cinema')); await until(() => !h.node('.naxx-public-page').getAttribute('aria-busy').includes('true'), 'publicação deve terminar');
      assert.equal(h.node('[data-public-apply]').disabled, true, 'tema atual não pode ser reaplicado'); assert.equal(h.node('[data-public-restore]').disabled, false);
      assert.equal(h.card('cinema').querySelector('.naxx-public-in-use').hidden, false);
      assert.match(h.node('[data-public-notice]').textContent, /Tema aplicado/); h.intact();
      h.click('[data-public-restore]'); const restore = h.requests.at(-1);
      assert.deepEqual(JSON.parse(restore.init.body), {action:'restore', csrf}, 'restauração não envia tema/campos nativos');
      restore.answer(status()); await until(() => h.node('[data-public-restore]').disabled && !h.node('[data-public-apply]').disabled, 'restauração deve atualizar o estado');
      assert.match(h.node('[data-public-current]').textContent, /página original/); assert.match(h.node('[data-public-notice]').textContent, /original foi restaurada/); h.intact();
      const requests = h.requests.length;
      h.form.dispatchEvent(new h.window.Event('submit', {bubbles:true, cancelable:true}));
      assert.deepEqual(h.saved, [h.originalData], 'submit nativo continua disponível e contém apenas valores originais'); assert.equal(h.requests.length, requests);
    } finally {h.close();}
    console.log('Publicação/restauração: apenas cliques explícitos enviam POST com CSRF e tema fixo; sem envio de campos ou submit nativo, respostas antigas descartadas.');
  }

  {
    const h = fixture();
    try {
      await h.ready(status('aurora'));
      assert.equal(h.card('aurora').getAttribute('aria-checked'), 'true', 'tema já em uso inicia selecionado'); assert.equal(h.node('[data-public-apply]').disabled, true);
      h.card('aurora').dispatchEvent(new h.window.KeyboardEvent('keydown', {key:'End', bubbles:true, cancelable:true}));
      assert.equal(h.document.activeElement, h.card('cinema')); assert.equal(h.card('cinema').getAttribute('aria-checked'), 'true');
      h.requests.at(-1).answer(preview('cinema')); await until(() => !h.node('iframe').hidden, 'teclado deve carregar prévia');
      h.card('cinema').dispatchEvent(new h.window.KeyboardEvent('keydown', {key:'ArrowRight', bubbles:true, cancelable:true}));
      assert.equal(h.document.activeElement, h.card('naxx')); assert.equal(h.card('naxx').getAttribute('aria-checked'), 'true');
      h.requests.at(-1).answer(preview('naxx')); await until(() => !h.node('iframe').hidden, 'teclado deve circular entre temas'); h.intact();
    } finally {h.close();}
    const blocked = fixture();
    try {
      await blocked.ready(status('custom', {can_publish:false, can_restore:false, reason:'Página personalizada: aplicação indisponível neste estado.'}));
      assert.match(blocked.node('[data-public-current]').textContent, /página personalizada/);
      assert.equal(blocked.node('[data-public-apply]').disabled, true); assert.equal(blocked.node('[data-public-restore]').disabled, true);
      assert.equal(blocked.node('[data-public-notice]').getAttribute('role'), 'alert');
      blocked.card('claro').click(); blocked.requests.at(-1).answer(preview('claro')); await until(() => !blocked.node('iframe').hidden, 'estado bloqueado ainda permite prévia');
      blocked.click('[data-public-apply]'); blocked.click('[data-public-restore]');
      assert.equal(blocked.requests.filter(request => request.init.method === 'POST').length, 0); blocked.intact();
    } finally {blocked.close();}
    console.log('Acessibilidade/estado: escolha por teclado, tema ativo reconhecido e página personalizada bloqueada sem publicação, mantendo prévia disponível.');
  }

  {
    const failures = [
      {name:'JSON inválido', response:{text:async () => '<html>sessão</html>'}, value:null, message:/Não foi possível consultar/},
      {name:'erro JSON', value:{ok:false, message:'Falha <img src=x onerror=alert(1)>'}, message:/Falha <img/},
      {name:'estado incompleto', value:{ok:true, csrf, state:{selected:'original'}}, message:/informações incompletas/},
      {name:'redirecionamento', value:status(), response:{redirected:true, url:'https://naxx.example.test/login'}, message:/sessão expirou/},
      {name:'página de licença', value:status(), response:{url:'https://naxx.example.test/license.php'}, message:/sessão expirou/}
    ];
    for (const failure of failures) {
      const h = fixture();
      try {
        h.click('#naxx-public-page-tab'); h.requests[0].answer(failure.value, failure.response);
        await until(() => !h.node('[data-public-notice]').hidden, failure.name + ' deve exibir erro');
        assert.match(h.node('[data-public-notice]').textContent, failure.message); assert.equal(h.node('[data-public-notice]').querySelector('img'), null, 'erro é tratado como texto');
        assert.equal(h.node('[data-public-apply]').disabled, true); assert.equal(h.requests.length, 1); h.intact();
      } finally {h.close();}
    }
    const h = fixture();
    try {
      await h.ready(); h.card('claro').click(); h.requests.at(-1).answer({ok:false, message:'Prévia <b>indisponível</b>'});
      await until(() => h.node('[data-public-preview-message]').textContent.includes('indisponível'), 'erro JSON de prévia deve aparecer');
      assert.equal(h.node('[data-public-preview-message]').querySelector('b'), null); assert.equal(h.node('iframe').hidden, true);
      h.card('claro').click(); h.requests.at(-1).answer({ok:true, preview:{theme:'naxx', html:preview('naxx').preview.html}});
      await until(() => h.node('[data-public-preview-message]').textContent.includes('não está disponível'), 'prévia de outro tema deve ser recusada');
      h.card('claro').click(); h.requests.at(-1).answer({ok:true, preview:{theme:'claro', html:'<p>incompleto</p>'}});
      await until(() => h.node('[data-public-preview-message]').textContent.includes('não está disponível'), 'HTML sem documento deve ser recusado');
      h.card('claro').click(); h.requests.at(-1).answer(preview('claro')); await until(() => !h.node('iframe').hidden, 'prévia permite nova tentativa');
      h.click('[data-public-apply]'); h.requests.at(-1).answer({ok:false, message:'Acesso negado.'}, {ok:false});
      await until(() => h.node('[data-public-notice]').textContent.includes('Acesso negado'), 'POST recusado deve mostrar erro');
      assert.equal(h.node('[data-public-apply]').disabled, true); assert.equal(h.node('[data-public-restore]').disabled, true); h.intact();
    } finally {h.close();}
    console.log('Falhas: JSON inválido/incompleto, erro do serviço e sessão expirada bloqueiam aplicação; mensagens são texto e prévia inválida admite nova tentativa.');
  }

  {
    for (const phase of ['status', 'preview']) {
      const h = fixture();
      try {
        h.click('#naxx-public-page-tab');
        if (phase === 'preview') {h.requests[0].answer(status()); await until(() => h.requests.length === 2, 'prévia deve iniciar antes de navegar');}
        const pending = h.requests.at(-1), oldPane = h.node('#naxx-public-page');
        h.window.history.replaceState({}, '', '/streams'); h.document.body.innerHTML = '<main id="other-page">Outra página</main>'; h.enhance();
        assert.equal(pending.init.signal.aborted, true, 'navegação cancela consulta de ' + phase); assert.equal(h.document.querySelector('#naxx-public-page'), null);
        pending.answer(phase === 'status' ? status('cinema') : preview('naxx')); await tick(); await tick();
        assert.equal(h.document.querySelector('#naxx-public-page'), null); assert.equal(h.document.querySelector('iframe'), null); assert.equal(oldPane.isConnected, false);
        h.window.history.replaceState({}, '', '/settings'); h.document.body.innerHTML = new h.window.DOMParser().parseFromString(markup(), 'text/html').body.innerHTML; h.enhance(); h.enhance();
        assert.equal(h.document.querySelectorAll('#naxx-public-page').length, 1); assert.equal(h.document.querySelectorAll('#naxx-public-page-tab').length, 1);
        const count = h.requests.length; assert.equal(count, phase === 'status' ? 1 : 2, 'remontagem continua preguiçosa');
        h.click('#naxx-public-page-tab'); assert.equal(h.requests.length, count + 1, 'nova aba permite consulta independente');
        h.requests.at(-1).answer(status()); await until(() => h.requests.length === count + 2, 'remontagem carrega nova prévia');
        h.requests.at(-1).answer(preview('naxx')); await until(() => !h.node('iframe').hidden, 'remontagem conclui normalmente');
      } finally {h.close();}
    }
    const other = fixture({pathname:'/streams'});
    try {assert.equal(other.document.querySelector('#naxx-public-page'), null); assert.equal(other.requests.length, 0); other.intact();} finally {other.close();}
    console.log('SPA: desmontagem cancela estado/prévia pendentes, ignora respostas tardias, remonta uma única aba e não interfere em outras páginas.');
  }
  {
    for (const replacement of ['native-nav', 'anchor']) for (const phase of ['status', 'preview']) {
      const h = fixture();
      try {
        h.click('#naxx-public-page-tab');
        if (phase === 'preview') {h.requests[0].answer(status()); await until(() => h.requests.length === 2, 'prévia deve iniciar antes de substituir navegação');}
        const pending = h.requests.at(-1), oldPane = h.node('#naxx-public-page'), oldLink = h.node('#naxx-public-page-tab');
        if (replacement === 'native-nav') {
          const oldNav = h.node('ul.form-wizard-header'), nextNav = h.document.createElement('ul'); nextNav.className = oldNav.className;
          // SPA pode substituir apenas a navegação nativa, mantendo o formulário e os panes conectados.
          for (const id of nativeTabs) nextNav.appendChild(oldNav.querySelector('a[href="#' + id + '"]').closest('li').cloneNode(true));
          oldNav.replaceWith(nextNav);
        } else {
          oldLink.remove(); assert.equal(oldLink.closest('li'), null, 'âncora removida não conserva acesso ao li original');
        }
        assert.equal(oldPane.isConnected, true, 'pane anterior permanece anexado durante alteração parcial');
        assert.doesNotThrow(() => h.enhance(), 'desmontagem tolera aba desconectada sem ancestral li'); h.enhance();
        assert.equal(pending.init.signal.aborted, true, 'troca parcial cancela consulta de ' + phase);
        assert.equal(oldPane.isConnected, false); assert.equal(oldLink.isConnected, false);
        assert.equal(h.document.querySelectorAll('#naxx-public-page-tab').length, 1); assert.equal(h.document.querySelectorAll('#naxx-public-page').length, 1);
        const nextLink = h.node('#naxx-public-page-tab'), nextPane = h.node('#naxx-public-page');
        assert.equal(h.node('a[href="#logs"]').closest('li').nextElementSibling.firstElementChild, nextLink, 'nova aba fica imediatamente após Logs');
        assert.equal(nextPane.parentElement, h.node('#logs').parentElement); assert.notEqual(nextPane, oldPane); assert.notEqual(nextLink, oldLink);
        assert.equal(h.document.querySelector('form'), h.form); assert.deepEqual(Array.from(new h.window.FormData(h.form).entries()), h.originalData);
        nativeTabs.forEach((id, index) => {assert.equal(h.document.getElementById(id), h.originalPanes[index]); assert.equal(h.document.querySelectorAll('a[href="#' + id + '"]').length, 1);});
        assert.equal(h.saved.length, 0);
        const count = h.requests.length; pending.answer(phase === 'status' ? status('cinema') : preview('naxx')); await tick(); await tick();
        assert.equal(h.requests.length, count, 'resposta cancelada não inicia nova consulta'); assert.equal(nextPane.querySelector('iframe').getAttribute('srcdoc'), null, 'resposta antiga não preenche a nova prévia');
        h.click('#naxx-public-page-tab'); assert.equal(h.requests.length, count + 1, 'aba substituída consulta apenas ao abrir');
        h.requests.at(-1).answer(status()); await until(() => h.requests.length === count + 2, 'nova aba carrega a sua prévia');
        h.requests.at(-1).answer(preview('naxx')); await until(() => !h.node('iframe').hidden, 'nova aba permanece funcional após substituição parcial');
        assert.deepEqual(Array.from(new h.window.FormData(h.form).entries()), h.originalData); assert.equal(h.saved.length, 0);
      } finally {h.close();}
    }
    console.log('SPA parcial: substituir somente a navegação ou remover a âncora cancela estado/prévia, remonta uma aba após Logs sem duplicação e preserva formulário/panes nativos.');
  }
  console.log('OK: página inicial verificada offline em JSDOM; sem HTTP, publicação real ou verificação visual de navegador.');
})().catch(error => {console.error(error.stack); process.exitCode = 1;});
