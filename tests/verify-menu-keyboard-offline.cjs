/* Menu flutuante: simula o contrato do Bootstrap 4.3, sem browser ou HTTP. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const handlers = new Map(), listeners = new Map(), frames = [];
const doc = {documentElement: {clientWidth: 393}, activeElement: null};
function element(name) {
  const attributes = new Map(), classes = new Set(), styles = new Map();
  return {
    name, parentNode: null, children: [], scrollHeight: 220,
    get isConnected() { return this === doc.body || Boolean(this.parentNode && this.parentNode.isConnected); },
    classList: {add: (...items) => items.forEach(item => classes.add(item)), remove: (...items) => items.forEach(item => classes.delete(item)), contains: item => classes.has(item)},
    style: {setProperty: (key, value) => styles.set(key, value)},
    getAttribute: key => attributes.has(key) ? attributes.get(key) : null,
    setAttribute: (key, value) => attributes.set(key, value),
    removeAttribute: key => attributes.delete(key),
    appendChild(child) { child.remove(); child.parentNode = this; this.children.push(child); return child; },
    before(child) { const parent = this.parentNode; child.remove(); child.parentNode = parent; parent.children.splice(parent.children.indexOf(this), 0, child); },
    replaceWith(child) { const parent = this.parentNode; child.remove(); parent.children.splice(parent.children.indexOf(this), 1, child); child.parentNode = parent; this.parentNode = null; },
    remove() { if (this.parentNode) { const parent = this.parentNode; parent.children.splice(parent.children.indexOf(this), 1); this.parentNode = null; } },
    contains(child) { return child === this || this.children.some(node => node.contains(child)); },
    focus() { doc.activeElement = this; },
    getBoundingClientRect() { return this.rect || {width: 220, height: 44, left: 250, right: 294, top: 120, bottom: 164}; },
    querySelectorAll: () => []
  };
}
doc.body = element('body');
doc.createComment = () => element('marker');
doc.querySelectorAll = () => [];
doc.addEventListener = (type, listener) => listeners.set(type, listener);
const parent = element('dropdown'), toggle = element('toggle'), menu = element('menu');
doc.body.appendChild(parent); parent.appendChild(toggle); parent.appendChild(menu);
parent.closest = () => parent;
parent.querySelector = selector => selector.includes('.dropdown-menu') ? menu : toggle;
let hidden = 0;
function jq(target) {
  return {
    on(type, handler) { handlers.set(type, handler); },
    dropdown(action) {
      assert.equal(target, toggle); assert.equal(action, 'hide'); hidden++;
      // Bootstrap 4.3 hide() removes classes and emits hidden, but does not
      // update aria-expanded; _clearMenus() is the separate path that does.
      menu.classList.remove('show'); parent.classList.remove('show');
      handlers.get('hidden.bs.dropdown.naxxFloating')({target: parent});
    }
  };
}
jq.fn = {dropdown() {}};
const context = {document: doc, location: {pathname: '/streams'}, innerHeight: 852, requestAnimationFrame: callback => {frames.push(callback); return frames.length;}};
context.window = {jQuery: jq, addEventListener() {}};
vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../xui-naxx/src/menu-tools.js'), 'utf8'), context);
context.window.NaxxMenus.enhance();
function open() {
  toggle.setAttribute('aria-expanded', 'true');
  menu.classList.add('show'); parent.classList.add('show');
  handlers.get('shown.bs.dropdown.naxxFloating')({target: parent});
  assert.equal(menu.parentNode, doc.body);
}
open();
let prevented = false, stopped = false;
listeners.get('keydown')({key: 'Escape', target: toggle, preventDefault() {prevented = true;}, stopImmediatePropagation() {stopped = true;}});
assert(prevented && stopped);
assert.equal(toggle.getAttribute('aria-expanded'), 'false', 'Escape deve anunciar que o menu foi fechado.');
assert.equal(menu.parentNode, parent, 'O menu deve voltar ao contêiner nativo.');
assert.equal(menu.classList.contains('naxx-floating-dropdown'), false);
assert.equal(doc.activeElement, toggle, 'Escape devolve o foco ao botão que abriu o menu.');
assert.equal(hidden, 1);

open();
toggle.rect = {width: 44, height: 44, left: 250, right: 294, top: -100, bottom: -56};
context.window.NaxxMenus.enhance();
while (frames.length) frames.shift()();
assert.equal(toggle.getAttribute('aria-expanded'), 'false', 'Rolagem para fora da tela também fecha o estado acessível.');
assert.equal(menu.parentNode, parent);
assert.equal(hidden, 2);
console.log('PASS: Escape e fechamento fora da tela sincronizam aria-expanded, restauração e foco; zero browser/HTTP.');
