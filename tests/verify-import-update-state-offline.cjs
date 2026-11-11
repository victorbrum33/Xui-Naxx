/* Regressões de envio/estado: executa os módulos reais com DOM e rede simulados. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const project = path.resolve(__dirname, '../xui-naxx');
const nativeSource = fs.readFileSync(path.join(project, 'src/native-importer.js'), 'utf8');
const updateSource = fs.readFileSync(path.join(project, 'src/update-ui.js'), 'utf8');

class Element {
  constructor() {
    this.children = []; this.listeners = {}; this.attributes = {}; this.dataset = {};
    this.style = {}; this.textContent = ''; this.isConnected = true;
    this.classList = {add() {}, remove() {}};
  }
  querySelector(selector) {
    this.selectors ||= new Map();
    if (!this.selectors.has(selector)) this.selectors.set(selector, new Element());
    return this.selectors.get(selector);
  }
  appendChild(child) {this.children.push(child); return child;}
  append(...children) {this.children.push(...children);}
  replaceChildren(...children) {this.children = children;}
  addEventListener(type, listener) {(this.listeners[type] ||= []).push(listener);}
  dispatch(type) {for (const listener of this.listeners[type] || []) listener({target:this});}
  setAttribute(name, value) {this.attributes[name] = String(value);}
  removeAttribute(name) {delete this.attributes[name];}
  before() {}
}
class MockFormData {
  constructor(form) {this.values = (form?.fields || []).map(entry => entry.slice());}
  append(key, value) {this.values.push([key, value]);}
  delete(key) {this.values = this.values.filter(entry => entry[0] !== key);}
  set(key, value) {this.delete(key); this.append(key, value);}
  get(key) {return this.getAll(key)[0] ?? null;}
  getAll(key) {return this.values.filter(entry => entry[0] === key).map(entry => entry[1]);}
  forEach(callback) {for (const [key, value] of this.values) callback(value, key);}
}

async function importChannels(mode, advanced) {
  const nativeForm = new Element();
  nativeForm.fields = [['server_tree_data','[]'], ['category_create_list','']];
  nativeForm.closest = () => new Element();
  nativeForm.parentNode = {insertBefore() {}};
  const configuredForm = new Element();
  configuredForm.fields = [
    ['server_tree_data', JSON.stringify([{id:'source',parent:'#'}, {id:'7',parent:'source'}])],
    ['direct_source','on'], ['on_demand[]','9'], ['user_agent','Custom player'],
    ['category_create_list',''], ['import_folder','/unused'], ['scan_recursive','on']
  ];
  const nativeDoc = {
    querySelector: () => nativeForm,
    querySelectorAll(selector) {
      if (selector === '#on_demand option') return [{value:'2',textContent:'Servidor 2'}];
      if (selector === 'select[name="category_id[]"] option') return [{value:'501',textContent:'Canais'}];
      throw new Error('Seletor inesperado: '+selector);
    }
  };
  const modeControl = new Element(); modeControl.value = mode;
  let details, options;
  const posts = [];
  const document = {
    readyState:'complete', addEventListener() {}, querySelector: () => new Element(),
    getElementById: id => id === 'stream_form' ? nativeForm : modeControl,
    createElement(tag) {
      const element = new Element();
      if (tag === 'details') details = element;
      if (tag === 'iframe') {
        element.contentDocument = {querySelector: () => configuredForm};
        element.contentWindow = {};
      }
      return element;
    }
  };
  vm.runInNewContext(nativeSource, {
    document, window:{addEventListener() {}}, FormData:MockFormData,
    DOMParser:class {parseFromString() {return nativeDoc;}},
    File:class {constructor(parts, name) {this.parts = parts; this.name = name;}},
    NaxxImporter:{toM3U:() => '#EXTM3U'}, NaxxImporterUI:{mount(_root, settings) {options = settings;}},
    async fetch(_url, init) {
      if (init.method === 'POST') posts.push(init.body);
      return {ok:true,url:'http://naxx.test/stream',text:async () => init.method === 'POST' ? '{"status":1,"location":"streams"}' : '<form></form>'};
    }, setTimeout
  });
  if (advanced) details.querySelector('.naxx-import-tabs').children[0].dispatch('click');
  await options.onImport([{type:'channel',category:'Canais',name:'Canal de teste',url:'https://media.example.test/live.m3u8'}]);
  assert.equal(posts.length, 1);
  assert.equal(modeControl.disabled, false);
  return posts[0];
}

async function updaterState(state) {
  const root = new Element();
  const posts = [];
  const window = {addEventListener() {}, setTimeout:() => 1, clearTimeout() {}, confirm:() => true};
  const document = {readyState:'loading',hidden:false,createElement:() => new Element(),addEventListener() {},removeEventListener() {}};
  vm.runInNewContext(updateSource, {
    document, window, AbortController, URLSearchParams, location:{pathname:'/other',search:''},
    async fetch(_url, init) {
      if (init.method === 'POST') posts.push(JSON.parse(init.body));
      return {ok:true,url:'http://naxx.test/naxx-update.php',text:async () => JSON.stringify({ok:true,csrf:'test-token',state})};
    }
  });
  window.NaxxUpdateUI.mount(root);
  await new Promise(setImmediate);
  return {root, posts};
}

(async () => {
  for (const advanced of [false, true]) {
    for (const mode of ['direct', 'offline', 'ondemand']) {
      const data = await importChannels(mode, advanced);
      assert.deepEqual(data.getAll('direct_source'), mode === 'direct' ? ['on'] : [], mode+' deve prevalecer sobre a configuração avançada');
      if (mode === 'ondemand') {
        const server = advanced ? '7' : '2';
        assert.deepEqual(data.getAll('on_demand[]'), [server]);
        assert(JSON.parse(data.get('server_tree_data')).some(node => node.id === server && node.parent === 'source'));
      } else {
        assert.deepEqual(data.getAll('on_demand[]'), [], mode+' não deve iniciar retransmissão sob demanda');
        assert.equal(data.get('server_tree_data'), '[]', mode+' não deve deixar servidores online');
      }
      if (advanced) assert.equal(data.get('user_agent'), 'Custom player', 'preserva as demais escolhas avançadas');
      assert.equal(data.get('import_folder'), null);
      assert.deepEqual(data.getAll('category_id[]'), ['501']);
    }
  }
  console.log('Importador: os três modos prevalecem com e sem configurações avançadas; destinos, categoria e campos adicionais validados.');

  const base = {busy:false,automatic:false,status:'idle',installed:'1.5.14.1'};
  let ui = await updaterState({...base,canRollback:false,history:[{version:'1.5.14',operation:'rollback'}]});
  assert.equal(ui.root.querySelector('[data-update-rollback]').disabled, true, 'histórico após restauração não significa backup disponível');
  ui.root.querySelector('[data-update-rollback]').dispatch('click');
  await new Promise(setImmediate);
  assert.equal(ui.posts.length, 0, 'não envia restauração sem backup');
  ui = await updaterState({...base,canRollback:true,history:[]});
  assert.equal(ui.root.querySelector('[data-update-rollback]').disabled, false, 'backup disponível independe do histórico exibido');
  ui.root.querySelector('[data-update-rollback]').dispatch('click');
  await new Promise(setImmediate);
  assert.equal(ui.posts[0]?.action, 'rollback');
  console.log('Atualizador: restauração segue a disponibilidade de backup declarada pelo serviço, inclusive após rollback.');
})().catch(error => {console.error(error);process.exitCode = 1;});
