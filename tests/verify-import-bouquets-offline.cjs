/* Bouquets do importador: DOM e formulários sintéticos, sem navegador, rede ou painel real. */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
let JSDOM, VirtualConsole;
try {({JSDOM, VirtualConsole} = require(process.env.NAXX_JSDOM || 'jsdom'));}
catch (error) {
  throw new Error('Instale jsdom ou defina NAXX_JSDOM para executar esta verificação offline.', {cause:error});
}
const parserSource = fs.readFileSync(path.join(__dirname, '../xui-naxx/src/importer.js'), 'utf8');
const nativeSource = fs.readFileSync(path.join(__dirname, '../xui-naxx/src/native-importer.js'), 'utf8');
const escapeHTML = value => String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const hostileName = '<img src=x onerror="window.__bouquetInjected=1"> Cinema & filmes';
const baseBouquets = [
  {id:'', name:'Escolher...'},
  {id:'11', name:'Família & crianças', selected:true},
  {id:'22', name:hostileName},
  {id:'33', name:'Esportes'},
  {id:'22', name:'Duplicado'},
  {id:'44', name:'Desativado', disabled:true, selected:true},
  {id:'0', name:'Zero', selected:true},
  {id:'-1', name:'Negativo', selected:true},
  {id:'novo-bouquet', name:'Nome sem ID', selected:true}
];
function bouquetOptions(options) {
  return options.map(option => '<option value="'+escapeHTML(option.id)+'"'+(option.selected?' selected':'')+(option.disabled?' disabled':'')+'>'+escapeHTML(option.name)+'</option>').join('');
}
function formHTML(action = 'stream', options = {}) {
  const bouquets = options.bouquets === undefined ? baseBouquets : options.bouquets;
  const tree = options.tree || JSON.stringify([{id:'source',parent:'#'},{id:'7',parent:'source',text:'Servidor avançado'}]);
  return '<form id="stream_form">'+
    '<input type="file" name="m3u_file">'+
    '<input type="hidden" name="csrf_token" value="csrf-'+action+'">'+
    '<input name="user_agent" value="'+escapeHTML(options.userAgent || 'Agente '+action)+'">'+
    '<input name="native_other" value="campo preservado '+action+'">'+
    '<input name="category_create_list" value="[]">'+
    '<input name="bouquet_create_list" value="'+escapeHTML(JSON.stringify(['Bouquet novo indevido']))+'">'+
    '<input name="server_tree_data" value="'+escapeHTML(tree)+'">'+
    '<input type="checkbox" name="direct_source" checked>'+
    '<input type="checkbox" name="disable_tmdb">'+
    '<input type="checkbox" name="restart_on_edit" checked>'+
    '<input type="checkbox" name="update_existing" checked>'+
    '<input name="import_folder" value="/nao-importar-pasta">'+
    '<input type="checkbox" name="scan_recursive" checked>'+
    '<select id="bouquets" name="bouquets[]" multiple>'+bouquetOptions(bouquets)+'</select>'+
    '<select name="category_id[]" multiple><option value="501">Canais</option><option value="502">Filmes</option><option value="503">Séries</option></select>'+
    '<select id="on_demand" name="on_demand[]" multiple><option value="1">Servidor 1</option><option value="2" selected>Servidor 2</option></select>'+
    '<button type="submit" name="'+({stream:'submit_stream',movie:'submit_movie',serie:'submit_series'}[action])+'">Importar</button>'+
    '</form>';
}
function deferred() {let resolve, reject;const promise = new Promise((yes, no) => {resolve = yes;reject = no;});return {promise, resolve, reject};}
function item(type, index = 0) {
  const category = {channel:'Canais',movie:'Filmes',series:'Séries'}[type];
  return {type, category, name:type==='series'?'Série de teste S01E'+String(index+1).padStart(2,'0'):'Conteúdo '+type+' '+index, url:'https://media.example.test/'+type+'/'+index+'.m3u8'};
}
function harness(options = {}) {
  const errors = [], requests = [], posts = [];
  const virtualConsole = new VirtualConsole();
  virtualConsole.on('jsdomError', error => errors.push(error.message));
  const dom = new JSDOM('<!doctype html><html><head></head><body><h1 class="page-title"></h1><div class="card"><div>'+formHTML('stream', {bouquets:options.initialBouquets})+'</div></div></body></html>', {
    url:'https://naxx.example.test/importer', runScripts:'outside-only', virtualConsole
  });
  const {window} = dom, document = window.document;
  Object.defineProperty(document, 'readyState', {value:'complete', configurable:true});
  const realTimeout = window.setTimeout.bind(window);
  window.setTimeout = (callback, milliseconds, ...args) => realTimeout(callback, Math.min(milliseconds, 1), ...args);
  window.fetch = async (input, init = {}) => {
    const url = new URL(String(input), window.location.href), method = init.method || 'GET';
    assert.equal(url.origin, window.location.origin, 'toda requisição deve permanecer na origem fictícia');
    requests.push({url, method, init});
    if (method === 'POST') {
      assert.equal(url.pathname, '/post.php');
      assert.equal(init.credentials, 'same-origin');
      assert.equal(init.headers['X-Requested-With'], 'XMLHttpRequest');
      assert.equal(init.headers.Accept, 'application/json');
      const post = {action:url.searchParams.get('action'), data:init.body, url};
      assert(post.data instanceof window.FormData, 'POST usa o FormData nativo do DOM');
      posts.push(post);
      const result = options.onPost ? await options.onPost(post, posts.length, api) : undefined;
      return {ok:result?.ok ?? true, status:result?.status ?? 200, url:result?.url || url.href, text:async () => result?.body ?? '{"status":1,"location":"streams"}'};
    }
    assert.equal(method, 'GET');
    assert.equal(init.credentials, 'same-origin');
    assert.equal(init.cache, 'no-store');
    const action = url.pathname.slice(1);
    assert(['stream','movie','serie'].includes(action), 'GET não simulado: '+url.href);
    const value = options.nativeForms?.[action];
    const html = typeof value === 'function' ? value(api) : value;
    return {ok:true, url:url.href, text:async () => html === undefined ? formHTML(action) : html};
  };
  window.eval(parserSource);
  let mount;
  window.NaxxImporterUI = {mount(root, settings) {assert.equal(root.id, 'importer-root');assert.equal(mount, undefined, 'montagem única');mount = settings;}};
  const api = {
    window, document, dom, posts, requests, errors,
    get fieldset() {return document.getElementById('naxx-bouquets');},
    get boxes() {return [...document.querySelectorAll('#naxx-bouquets [data-bouquet-options] input[type="checkbox"]')];},
    get selected() {return this.boxes.filter(box => box.checked).map(box => box.value);},
    get mode() {return document.getElementById('naxx-mode');},
    get details() {return document.querySelector('.naxx-native-options');},
    commit(items) {return mount.onImport(items);},
    select(ids) {for (const box of this.boxes) {box.checked = ids.includes(box.value);box.dispatchEvent(new window.Event('change', {bubbles:true}));}},
    search(value) {const search = document.getElementById('naxx-bouquet-search');search.value = value;search.dispatchEvent(new window.Event('input', {bubbles:true}));},
    click(selector) {const element = document.querySelector(selector);assert(element, 'controle disponível: '+selector);element.click();},
    advanced(type, html = formHTML({channel:'stream',movie:'movie',series:'serie'}[type], {userAgent:'Avançado '+type})) {
      const label = {channel:'Canais',movie:'Filmes',series:'Séries'}[type];
      const button = [...document.querySelectorAll('.naxx-import-tabs button')].find(element => element.textContent === label);
      assert(button, 'aba avançada '+type);button.click();
      const frame = [...document.querySelectorAll('.naxx-config-frame')].find(element => element.src.includes('/'+{channel:'stream',movie:'movie',series:'serie'}[type]+'?'));
      assert(frame, 'iframe avançado '+type);
      if (html !== null) {frame.contentDocument.open();frame.contentDocument.write(html);frame.contentDocument.close();}
      return frame;
    },
    close() {dom.window.close();assert.deepEqual(errors, [], 'zero erros de execução no DOM');}
  };
  window.eval(nativeSource);
  assert(mount && typeof mount.onImport === 'function', 'captura a integração real NaxxImporterUI.mount');
  assert(api.fieldset, 'o destino oferece o seletor principal de bouquets');
  return api;
}
function bouquets(post) {return post.data.getAll('bouquets[]');}
function assertUnlocked(h) {
  assert.equal(h.fieldset.disabled, false, 'seletor liberado após concluir ou falhar');
  assert.equal(h.mode.disabled, false, 'modo liberado após concluir ou falhar');
  assert.equal(h.details.hasAttribute('inert'), false, 'configurações avançadas liberadas');
  assert.equal(h.details.classList.contains('naxx-options-busy'), false);
}
async function fileText(window, file) {
  return new Promise((resolve, reject) => {const reader = new window.FileReader();reader.onload = () => resolve(reader.result);reader.onerror = () => reject(reader.error);reader.readAsText(file);});
}

(async () => {
  {
    const h = harness();
    try {
      assert.deepEqual(h.boxes.map(box => box.value), ['11','22','33'], 'IDs inválidos, desativados e duplicados não viram destinos');
      assert.deepEqual(h.selected, ['11'], 'preserva somente as seleções nativas válidas');
      assert.match(h.document.querySelector('[data-bouquet-count]').textContent, /^1 de 3\b/);
      assert(h.fieldset.textContent.includes(hostileName), 'nome potencialmente malicioso aparece como texto literal');
      assert.equal(h.fieldset.querySelector('img,script,svg'), null, 'nome nativo não injeta markup');
      assert.equal(h.window.__bouquetInjected, undefined);
      h.search('CRIANCAS');
      assert.deepEqual(h.boxes.filter(box => !box.closest('label').hidden).map(box => box.value), ['11'], 'filtro ignora maiúsculas e acentos');
      h.search('cinema');h.click('[data-bouquet-select-visible]');
      assert.deepEqual(h.selected, ['11','22'], 'selecionar filtrados preserva escolhas fora do filtro');
      h.click('[data-bouquet-select-all]');
      assert.deepEqual(h.selected, ['11','22','33'], 'selecionar todos abrange opções fora do filtro');
      h.click('[data-bouquet-clear]');assert.deepEqual(h.selected, [], 'limpar remove todas as escolhas');
      assert.match(h.document.querySelector('[data-bouquet-count]').textContent, /^0 de 3\b/);
      h.search('nenhum resultado');
      assert.equal(h.boxes.filter(box => !box.closest('label').hidden).length, 0);
      assert.equal(h.document.querySelector('[data-bouquet-empty]').hidden, false);
      h.search('');
      const manage = h.fieldset.querySelector('a[href]');
      assert(manage && /\/bouquets(?:[?#]|$)/.test(manage.href));
      assert.equal(manage.target, '_blank');assert(manage.rel.includes('noopener'));assert(manage.rel.includes('noreferrer'));
    } finally {h.close();}
    console.log('Bouquets: opções nativas seguras, defaults, filtro com acentos, multisseleção, todos/filtrados/limpar e link de gerenciamento.');
  }

  {
    const h = harness();
    try {
      h.select(['11','22']);
      await h.commit([item('channel'),item('movie'),item('series')]);
      assert.deepEqual(h.posts.map(post => post.action), ['stream','movie','serie']);
      const firstPost = h.requests.findIndex(request => request.method === 'POST');
      assert.deepEqual(h.requests.slice(0, firstPost).map(request => request.url.pathname).sort(), ['/movie','/serie','/stream'], 'todos os tipos são validados antes da primeira mutação');
      for (const post of h.posts) {
        assert.deepEqual(bouquets(post), ['11','22']);
        assert.equal(post.data.get('bouquet_create_list'), '[]', 'não cria bouquets a partir do campo nativo desatualizado');
        assert.equal(post.data.get('csrf_token'), 'csrf-'+post.action);
        assert.equal(post.data.get('native_other'), 'campo preservado '+post.action);
        assert.equal(post.data.get('user_agent'), 'Agente '+post.action);
        assert.equal(post.data.get('import_folder'), null);assert.equal(post.data.get('scan_recursive'), null);
        assert.deepEqual(post.data.getAll('category_id[]'), [{stream:'501',movie:'502',serie:'503'}[post.action]]);
        assert.equal(post.data.get('category_create_list'), '[]');
        const file = post.data.get('m3u_file');
        assert(file instanceof h.window.File);assert.equal((await fileText(h.window, file)).match(/#EXTINF:/g).length, 1);
      }
      assert.deepEqual(h.posts[0].data.getAll('on_demand[]'), ['1','2']);
      assert.deepEqual(JSON.parse(h.posts[0].data.get('server_tree_data')).filter(node => node.parent === 'source').map(node => node.id), ['1','2']);
      assert.equal(h.posts[0].data.get('direct_source'), null);
      assertUnlocked(h);assert.deepEqual(h.selected, ['11','22']);
    } finally {h.close();}
    console.log('Canais/filmes/séries: preflight sem POST parcial, bouquets[] explícitos, criação vazia, campos/categorias nativos e servidores sob demanda preservados.');
  }

  {
    for (const mode of ['ondemand','direct','offline']) {
      const h = harness();
      try {
        h.select(['22','33']);h.mode.value = mode;
        for (const type of ['channel','movie','series']) h.advanced(type);
        await h.commit([item('channel'),item('movie'),item('series')]);
        for (const [index,type] of ['channel','movie','series'].entries()) {
          const post = h.posts[index];
          assert.deepEqual(bouquets(post), ['22','33'], 'seletor principal prevalece sobre as escolhas avançadas');
          assert.equal(post.data.get('bouquet_create_list'), '[]');
          assert.equal(post.data.get('user_agent'), 'Avançado '+type);
          assert.equal(post.data.get('native_other'), 'campo preservado '+post.action);
          assert.equal(post.data.get('restart_on_edit'), 'on');assert.equal(post.data.get('update_existing'), 'on');
        }
        const channel = h.posts[0].data;
        assert.deepEqual(channel.getAll('direct_source'), mode==='direct'?['on']:[]);
        assert.deepEqual(channel.getAll('on_demand[]'), mode==='ondemand'?['7']:[]);
        if (mode!=='ondemand') assert.equal(channel.get('server_tree_data'), '[]');
        else assert(JSON.parse(channel.get('server_tree_data')).some(node => node.id==='7' && node.parent==='source'));
        assertUnlocked(h);
      } finally {h.close();}
    }
    console.log('Avançado: o seletor principal vence em todos os tipos; outros campos e os três modos de canais continuam válidos.');
  }

  {
    for (const emptyAvailable of [false,true]) {
      const h = harness({initialBouquets:emptyAvailable?[]:undefined,nativeForms:emptyAvailable?{stream:formHTML('stream',{bouquets:[]})}:undefined});
      try {
        h.select([]);h.advanced('channel');
        await h.commit([item('channel')]);
        assert.equal(h.posts.length, 1);
        assert.deepEqual(bouquets(h.posts[0]), [], 'sem seleção importa só o catálogo e limpa bouquets avançados');
        assert.equal(h.posts[0].data.get('bouquet_create_list'), '[]');assertUnlocked(h);
        if(emptyAvailable) assert.equal(h.document.getElementById('naxx-bouquet-search').disabled, true, 'mantém a indisponibilidade original da busca sem opções');
      } finally {h.close();}
    }
    console.log('Sem seleção ou sem bouquets disponíveis: catálogo permitido, sem destinos herdados nem criação implícita.');
  }

  {
    const h = harness({nativeForms:{movie:formHTML('movie',{bouquets:baseBouquets.filter(option => option.id!=='22')})}});
    try {
      h.select(['11','22']);
      await assert.rejects(h.commit([item('channel'),item('movie')]), /bouquet/i);
      assert.equal(h.posts.length, 0, 'bouquet ausente em um tipo impede também POST de outro tipo');
      assert.equal(h.fieldset.getAttribute('aria-invalid'), 'true');
      const error = h.document.querySelector('[data-bouquet-error]');
      assert.equal(error.hidden, false);assert(error.textContent.includes(hostileName));assert.equal(error.querySelector('img,script,svg'), null, 'erro com nome nativo também usa texto seguro');
      assert.deepEqual(h.selected, ['11','22']);assertUnlocked(h);
      h.select(['11']);assert.equal(error.hidden, true);assert.equal(h.fieldset.hasAttribute('aria-invalid'), false);
    } finally {h.close();}
    const loading = harness();
    try {
      loading.select(['22']);loading.advanced('movie', null);
      await assert.rejects(loading.commit([item('channel'),item('movie')]), /Aguarde o carregamento/i);
      assert.equal(loading.posts.length, 0);assert.deepEqual(loading.selected, ['22']);assertUnlocked(loading);
    } finally {loading.close();}
    const missingForm = harness({nativeForms:{serie:'<main>Formulário indisponível</main>'}});
    try {
      missingForm.select(['33']);
      await assert.rejects(missingForm.commit([item('channel'),item('series')]), /formulário nativo/i);
      assert.equal(missingForm.posts.length, 0);assert.deepEqual(missingForm.selected, ['33']);assertUnlocked(missingForm);
    } finally {missingForm.close();}
    console.log('Falhas de preflight e formulário avançado carregando: nenhum POST, seleção preservada e controles liberados.');
  }

  {
    const native = formHTML('stream');
    const invalidForms = [
      ['login', '<form action="login"><input name="username"><input type="password" name="password"></form>'],
      ['arbitrário', '<form><select name="bouquets[]" multiple><option value="11">Lista</option></select><input type="file" name="m3u_file"></form>'],
      ['bouquets ausentes', native.replace(/<select id="bouquets"[\s\S]*?<\/select>/, '')],
      ['bouquets desativados', native.replace('<select id="bouquets"', '<select disabled id="bouquets"')],
      ['bouquets em fieldset desativado', native.replace(/(<select id="bouquets"[\s\S]*?<\/select>)/, '<fieldset disabled>$1</fieldset>')],
      ['importação ausente', native.replace('<input type="file" name="m3u_file">', '')],
      ['tipo nativo errado', formHTML('movie')]
    ];
    for (const [name,html] of invalidForms) {
      const h = harness({nativeForms:{stream:html}});
      try {
        h.select([]);
        await assert.rejects(h.commit([item('channel')]), /formulário|bouquet|importa/i, 'rejeita '+name+' mesmo sem seleção');
        assert.equal(h.posts.length, 0, name+' não pode provocar POST de importação');assertUnlocked(h);
      } finally {h.close();}
    }
    const withUnrelatedForm = harness({nativeForms:{stream:'<form action="login"><input name="password"></form>'+native}});
    try {
      withUnrelatedForm.select(['11']);await withUnrelatedForm.commit([item('channel')]);
      assert.equal(withUnrelatedForm.posts.length, 1);assert.deepEqual(bouquets(withUnrelatedForm.posts[0]), ['11']);
      assert.equal(withUnrelatedForm.posts[0].data.get('csrf_token'), 'csrf-stream');
    } finally {withUnrelatedForm.close();}
    const invalidAdvanced = harness();
    try {
      invalidAdvanced.select([]);invalidAdvanced.advanced('channel', '<form action="login"><input name="password"></form>');
      await assert.rejects(invalidAdvanced.commit([item('channel')]), /carregamento|formulário|importa/i);
      assert.equal(invalidAdvanced.posts.length, 0);assertUnlocked(invalidAdvanced);
    } finally {invalidAdvanced.close();}
    console.log('Validação da estrutura nativa: login, formulário arbitrário, controles ausentes/desativados, tipo errado e avançado inválido nunca geram POST, mesmo sem seleção.');
  }

  {
    const entered = deferred(), release = deferred();
    const h = harness({onPost:async (_post, number) => {if(number===1){entered.resolve();await release.promise;}}});
    try {
      h.select(['11','22']);
      const importing = h.commit(Array.from({length:201}, (_, index) => item('channel',index)));
      await entered.promise;
      assert.equal(h.fieldset.disabled, true);assert.equal(h.mode.disabled, true);
      assert.equal(h.document.getElementById('naxx-bouquet-search').matches(':disabled'), true);
      for (const button of h.fieldset.querySelectorAll('button')) assert.equal(button.matches(':disabled'), true);
      assert.equal(h.details.hasAttribute('inert'), true);
      assert.equal(h.details.classList.contains('naxx-options-busy'), true);
      h.select(['33']);h.mode.value = 'direct';
      release.resolve();await importing;
      assert.equal(h.posts.length, 3);
      for (const post of h.posts) {assert.deepEqual(bouquets(post), ['11','22'], 'todos os lotes usam o snapshot inicial');assert.equal(post.data.get('direct_source'), null);}
      assert.deepEqual(await Promise.all(h.posts.map(async post => ((await fileText(h.window, post.data.get('m3u_file'))).match(/#EXTINF:/g)||[]).length)), [100,100,1]);
      assertUnlocked(h);
    } finally {release.resolve();h.close();}
    console.log('201 canais: três lotes usam o mesmo snapshot; controles ficam bloqueados até finalizar e são restaurados.');
  }

  {
    let fail = true;
    const h = harness({onPost:async (_post, number) => number===2 && fail?{ok:false,status:503}:undefined});
    try {
      const items = Array.from({length:101}, (_, index) => item('channel',index));
      h.select(['22','33']);
      await assert.rejects(h.commit(items), /Lotes anteriores enviados: 100.*503/s);
      assert.equal(h.posts.length, 2);assert.deepEqual(h.selected, ['22','33']);assertUnlocked(h);
      fail = false;await h.commit(items);
      assert.equal(h.posts.length, 3, 'retry envia somente o lote não confirmado');
      const retry = await fileText(h.window, h.posts[2].data.get('m3u_file'));
      assert.equal((retry.match(/#EXTINF:/g)||[]).length, 1);assert(retry.includes('/channel/100.m3u8'));
      for (const post of h.posts) assert.deepEqual(bouquets(post), ['22','33']);
      assert.deepEqual(h.selected, ['22','33']);assertUnlocked(h);
    } finally {h.close();}
    console.log('Erro/retry: mantém bouquets e revisão, restaura controles e ignora os 100 itens já confirmados.');
  }
  console.log('OK: verificações de bouquets concluídas offline; zero acessos reais e nenhuma publicação.');
})().catch(error => {console.error(error.stack);process.exitCode = 1;});
