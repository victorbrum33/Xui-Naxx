/* Janela nativa e seus eventos com dados sintéticos; sem rede, login ou download real. */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
let JSDOM, VirtualConsole;
try {({JSDOM, VirtualConsole} = require(process.env.NAXX_JSDOM || 'jsdom'));}
catch (error) {throw new Error('Instale jsdom ou defina NAXX_JSDOM para executar esta verificação offline.', {cause:error});}
const source = fs.readFileSync(path.join(__dirname, '../xui-naxx/src/playlist-download-ui.js'), 'utf8');
const tick = () => new Promise(resolve => setImmediate(resolve));
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
async function settle() {await tick(); await delay(8); await tick();}

function markup() {
  return '<div class="modal fade downloadModal" role="dialog" aria-labelledby="downloadLabel" aria-hidden="true" style="display:none"><div class="modal-dialog modal-dialog-centered modal-md"><div class="modal-content">' +
    '<div class="modal-header"><h4 class="modal-title" id="downloadModal">Download Playlist</h4><button type="button" data-dismiss="modal">×</button></div><div class="modal-body">' +
    '<div class="form-group row"><label for="download_type">Format</label><div class="col-8"><select id="download_type"><optgroup label="M3U Standard"><option value="m3u?output=hls">M3U Standard - HLS</option><option value="m3u">M3U Standard - MPEGTS</option><option value="m3u?output=rtmp">M3U Standard - RTMP</option></optgroup><optgroup label="M3U Plus"><option value="m3u_plus?output=hls">M3U Plus - HLS</option><option value="m3u_plus">M3U Plus - MPEGTS</option><option value="m3u_plus?output=rtmp">M3U Plus - RTMP</option></optgroup><optgroup label="DreamBox"><option value="dreambox">DreamBox OE 2.0 - MPEGTS</option></optgroup><option value="enigma22_script" data-text="wget -O /etc/enigma2/iptv.sh {DEVICE_LINK} &amp;&amp; chmod 777 /etc/enigma2/iptv.sh &amp;&amp; /etc/enigma2/iptv.sh">Enigma 2 OE 2.0 Auto Script - MPEGTS</option><option value="octagon_script?output=hls" data-text="wget -qO /var/bin/iptv {DEVICE_LINK}">Octagon Auto Script - HLS</option></select><span class="select2"><span id="select2-download_type-container"></span></span></div></div>' +
    '<div class="form-group row"><label for="output_type">Limit Output</label><div class="col-8"><select id="output_type" multiple data-placeholder="Choose..."><option value="live">Live</option><option value="movie">Movies</option><option value="created_live">Created Channels</option><option value="radio_streams">Radio Stations</option><option value="series">TV Series</option></select><span class="select2"><textarea class="select2-search__field" placeholder="Choose..."></textarea></span></div></div>' +
    '<div class="form-group row"><div class="col-12"><div class="input-group"><input type="text" id="download_url" value=""><div class="input-group-append"><button type="button" onclick="copyDownload();"><i></i></button><button type="button" id="download_button" onclick="doDownload();" disabled><i></i></button></div></div></div></div></div></div></div></div>';
}

// Mesma sequência e os mesmos eventos da página lines do XUI 1.5.14, auditados
// em 19/11/2026. Apenas o endereço do servidor e a conta são exemplos fictícios.
const nativeFunctions = `
function openDownload(username, password) {
  $('#download_type').val('').trigger('change');
  $('#output_type').val('').trigger('change');
  $('#download_button').attr('disabled', true);
  $('.downloadModal').data('username', username);
  $('.downloadModal').data('password', password);
  $('.downloadModal').modal('show');
}
function doDownload() { if ($('#download_url').val()) window.open($('#download_url').val()); }
function copyDownload() { $('#download_url').select(); document.execCommand('copy'); }
$('#output_type').change(function () { $('#download_type').trigger('change'); });
$('#download_type').change(function () {
  if ($('#download_type').val()) {
    rText = 'https://stream.example.test:8443/playlist/' + $('.downloadModal').data('username') + '/' + $('.downloadModal').data('password') + '/' + decodeURIComponent($('.downloadModal select').val());
    if ($('#output_type').val().length > 0) {
      if (rText.indexOf('?output=') != -1) rText = rText + '&key=' + $('#output_type').val().join(',');
      else rText = rText + '?key=' + $('#output_type').val().join(',');
    }
    if ($('#download_type').find(':selected').data('text')) {
      rText = $('#download_type').find(':selected').data('text').replace('{DEVICE_LINK}', '"' + rText + '"');
      $('#download_button').attr('disabled', true);
    } else $('#download_button').attr('disabled', false);
    $('#download_url').val(rText);
  } else $('#download_url').val('');
});`;

function fixture(options = {}) {
  const virtualConsole = new VirtualConsole();
  const errors = [], network = [], opened = [], clipboard = [], fallback = [], handlers = [];
  virtualConsole.on('jsdomError', error => errors.push(error.message));
  const dom = new JSDOM('<!doctype html><html><body><form>' + (options.empty ? '' : markup()) + '</form></body></html>', {
    url: 'https://panel.example.test/private/lines', runScripts:'dangerously', virtualConsole
  });
  const {window} = dom, document = window.document;
  Object.defineProperty(document, 'readyState', {value:'complete', configurable:true});
  const data = new WeakMap();
  let submitCount = 0, fallbackSuccess = true;
  document.querySelector('form').addEventListener('submit', event => {submitCount++; event.preventDefault();});
  window.fetch = (...args) => {network.push(args); throw new Error('Esta melhoria não pode fazer requisições.');};
  window.XMLHttpRequest = function () {network.push('xhr'); throw new Error('XHR não permitido.');};
  window.open = value => {opened.push(value);};
  document.execCommand = command => {assert.equal(command, 'copy'); fallback.push(document.activeElement.value); return fallbackSuccess;};
  function jq(selector) {
    const nodes = typeof selector === 'string' ? Array.from(document.querySelectorAll(selector)) : [selector];
    const api = {
      val(value) {
        if (!arguments.length) {
          const node = nodes[0];
          if (!node) return undefined;
          if (node.multiple) return Array.from(node.options).filter(option => option.selected).map(option => option.value);
          return node.tagName === 'SELECT' && node.selectedIndex < 0 ? null : node.value;
        }
        for (const node of nodes) {
          if (node.multiple) for (const option of node.options) option.selected = Array.isArray(value) ? value.includes(option.value) : option.value === value;
          else node.value = value;
        }
        return api;
      },
      attr(name, value) {for (const node of nodes) {if (value === false) node.removeAttribute(name); else node.setAttribute(name, String(value));} return api;},
      data(name, value) {
        if (arguments.length === 1) return data.get(nodes[0])?.[name] ?? nodes[0]?.getAttribute('data-' + name);
        for (const node of nodes) {if (!data.has(node)) data.set(node, {}); data.get(node)[name] = value;} return api;
      },
      find(selector) {return jq(nodes[0].querySelector(selector === ':selected' ? 'option:checked' : selector));},
      select() {nodes[0].select(); return api;},
      trigger(name) {for (const node of nodes) node.dispatchEvent(new window.Event(name.split('.')[0], {bubbles:true})); return api;},
      change(callback) {for (const node of nodes) node.addEventListener('change', callback); return api;},
      on(events, selector, callback) {
        for (const name of events.split(' ')) for (const node of nodes) {
          handlers.push({name, selector});
          node.addEventListener(name.split('.')[0], event => {
            const target = event.target.closest(selector);
            if (target) callback.call(target, event);
          });
        }
        return api;
      },
      modal(action) {
        for (const node of nodes) {
          node.style.display = action === 'show' ? 'block' : 'none';
          node.classList.toggle('show', action === 'show');
          node.setAttribute('aria-hidden', String(action !== 'show'));
          node.dispatchEvent(new window.Event(action === 'show' ? 'shown' : 'hidden', {bubbles:true}));
        }
        return api;
      }
    };
    return api;
  }
  jq.fn = {on() {}};
  window.$ = window.jQuery = jq;
  const nativeInstall = () => window.eval(nativeFunctions);
  if (!options.empty && options.native !== false) nativeInstall();
  window.eval(source);
  return {dom, window, document, jq, errors, network, opened, clipboard, fallback, handlers, nativeInstall,
    get modal() {return document.querySelector('.downloadModal');},
    get format() {return document.querySelector('#download_type');},
    get content() {return document.querySelector('#output_type');},
    get url() {return document.querySelector('#download_url');},
    get copy() {return document.querySelector('button[onclick*="copyDownload"]');},
    get download() {return document.querySelector('#download_button');},
    get feedback() {return document.querySelector('.naxx-playlist-feedback');},
    get submits() {return submitCount;},
    clipboardAPI(behavior) {Object.defineProperty(window.navigator, 'clipboard', {value:{writeText(value) {clipboard.push(value); return behavior ? behavior(value) : Promise.resolve();}}, configurable:true});},
    fallbackSuccess(value) {fallbackSuccess = value;},
    choose(value) {jq('#download_type').val(value).trigger('change');},
    limit(values) {jq('#output_type').val(values).trigger('change');},
    refresh() {window.NaxxPlaylistDownloadUI.refresh();},
    close() {dom.window.close();}
  };
}

(async () => {
  const f = fixture();
  try {
    const valuesBefore = Array.from(f.format.options, option => option.value);
    assert.equal(f.document.querySelector('.modal-title').textContent, 'Baixar playlist');
    assert.equal(f.modal.getAttribute('aria-labelledby'), 'downloadModal');
    assert(f.url.readOnly);
    assert(f.copy.disabled && f.download.disabled);
    f.window.openDownload('synthetic_user', 'synthetic_password');
    await settle();
    assert.equal(f.format.value, 'm3u_plus', 'O padrão usa o evento do gerador nativo após a conta ser definida.');
    assert.equal(f.url.value, 'https://stream.example.test:8443/playlist/synthetic_user/synthetic_password/m3u_plus');
    assert(!f.copy.disabled && !f.download.disabled);
    assert.equal(f.content.selectedOptions.length, 0);
    assert.match(f.document.querySelector('.naxx-playlist-summary').textContent, /Todos os conteúdos/);
    const nativeOpen = f.window.openDownload, nativeDownload = f.window.doDownload, nativeCopy = f.window.copyDownload;
    for (const type of ['m3u', 'm3u?output=hls', 'm3u?output=rtmp', 'm3u_plus', 'm3u_plus?output=hls', 'm3u_plus?output=rtmp', 'dreambox']) {
      f.choose(type); await settle();
      assert.equal(f.url.value, 'https://stream.example.test:8443/playlist/synthetic_user/synthetic_password/' + type);
      assert(!f.download.disabled);
    }
    f.limit(['live', 'movie']); await settle();
    assert(f.url.value.endsWith('/dreambox?key=live,movie'));
    f.choose('m3u_plus?output=hls'); await settle();
    assert(f.url.value.endsWith('/m3u_plus?output=hls&key=live,movie'));
    f.limit(['created_live', 'radio_streams', 'series']); await settle();
    assert(f.url.value.endsWith('&key=created_live,radio_streams,series'));
    f.limit([]); await settle(); assert(!f.url.value.includes('key='));
    f.clipboardAPI();
    f.copy.click(); await settle();
    assert.deepEqual(f.clipboard, [f.url.value]);
    assert.equal(f.fallback.length, 0);
    assert.equal(f.feedback.textContent, 'Link copiado.');
    f.download.click(); await settle();
    assert.deepEqual(f.opened, [f.url.value], 'O onclick original recebe o endereço exato, inclusive servidor externo.');
    assert.match(f.feedback.textContent, /Download solicitado/);
    f.clipboardAPI(() => Promise.reject(new Error('Clipboard indisponível')));
    f.copy.focus(); f.copy.click(); await settle();
    assert.equal(f.fallback.at(-1), f.url.value);
    assert.equal(f.document.activeElement, f.copy);
    assert.equal(f.feedback.textContent, 'Link copiado.');
    f.fallbackSuccess(false); f.copy.click(); await settle();
    assert.match(f.feedback.textContent, /copie manualmente/);
    f.fallbackSuccess(true);
    for (const type of ['enigma22_script', 'octagon_script?output=hls']) {
      f.choose(type); await settle();
      assert.match(f.url.value, /"https:\/\/stream\.example\.test:8443\/playlist\//);
      assert(!f.copy.disabled && f.download.disabled, 'Comandos de receptores continuam copiáveis, sem navegação.');
      assert.equal(f.copy.getAttribute('aria-label'), 'Copiar comando');
      f.copy.click(); await settle();
      assert.equal(f.fallback.at(-1), f.url.value);
      assert.equal(f.feedback.textContent, 'Comando copiado.');
    }
    assert.deepEqual(Array.from(f.format.options, option => option.value), valuesBefore);
    f.choose('m3u'); await settle();
    f.jq(f.modal).modal('show'); await settle();
    assert.equal(f.format.value, 'm3u', 'Seleção explícita existente é preservada no evento shown.');
    f.window.openDownload('second_user', 'second_password'); await settle();
    assert.equal(f.format.value, 'm3u_plus');
    assert(f.url.value.endsWith('/second_user/second_password/m3u_plus'), 'Reabrir a janela usa a nova conta e o gerador nativo.');
    for (const unsafe of ['javascript:alert(1)', 'data:text/html,<script>alert(1)</script>', 'file:///tmp/list.m3u', '//foreign.example.test/list', 'https://stream.example.test/\u0001attack']) {
      f.url.value = unsafe; f.download.disabled = false; f.refresh();
      assert(f.copy.disabled && f.download.disabled, 'Resultado não navegável deve ficar bloqueado.');
      const count = f.opened.length;
      f.download.dispatchEvent(new f.window.MouseEvent('click', {bubbles:true, cancelable:true}));
      assert.equal(f.opened.length, count);
    }
    f.url.value = '/playlist/synthetic_user/synthetic_password/m3u?key=live'; f.download.disabled = false; f.refresh();
    f.download.click(); assert.equal(f.opened.at(-1), f.url.value);
    f.url.value = 'https://other-stream.example.test:8080/playlist/conta de teste/senha%2F%23%26/m3u?preserve=%2f&extra=a+b';
    f.download.disabled = false; f.refresh(); f.download.click();
    assert.equal(f.opened.at(-1), f.url.value, 'Espaços no caminho e escapes válidos continuam byte a byte no fluxo nativo.');
    const counts = [f.document.querySelectorAll('.naxx-playlist-intro').length, f.handlers.length];
    f.window.eval(source); f.refresh(); f.refresh(); await settle();
    assert.deepEqual([f.document.querySelectorAll('.naxx-playlist-intro').length, f.handlers.length], counts);
    assert.equal(f.window.openDownload, nativeOpen); assert.equal(f.window.doDownload, nativeDownload); assert.equal(f.window.copyDownload, nativeCopy);
    assert.equal(f.submits, 0); assert.deepEqual(f.network, []); assert.deepEqual(f.errors, []);
    assert(!f.document.body.textContent.includes('synthetic_password'), 'Credenciais não devem ser duplicadas em texto, mensagens ou ajuda.');
    assert.equal(f.document.querySelectorAll('a[href]').length, 0);
  } finally {f.close();}

  const late = fixture({empty:true});
  try {
    late.document.querySelector('form').innerHTML = markup(); late.nativeInstall(); await settle();
    assert.equal(late.document.querySelectorAll('.naxx-playlist-intro').length, 1);
    late.window.openDownload('later_user', 'later_password'); await settle();
    assert.equal(late.format.value, 'm3u_plus');
    late.document.querySelector('form').innerHTML = markup(); late.nativeInstall(); await settle();
    late.window.openDownload('next_user', 'next_password'); await settle();
    assert.equal(late.document.querySelectorAll('.naxx-playlist-intro').length, 1);
    assert(late.url.value.includes('/next_user/next_password/'));
    const originalCopy = late.copy;
    late.url.outerHTML = '<input type="text" id="download_url">'; await settle();
    late.choose('m3u'); await settle();
    late.clipboardAPI(); late.copy.click(); await settle();
    assert.equal(late.copy, originalCopy);
    assert.deepEqual(late.clipboard, [late.url.value], 'Trocar só o campo remove o listener antigo e copia a conta atual uma única vez.');
    assert.equal(late.document.querySelectorAll('.naxx-playlist-intro').length, 1);
    late.modal.style.display = 'none'; late.modal.classList.remove('show'); late.modal.setAttribute('aria-hidden', 'true');
    await settle(); assert.deepEqual(late.errors, []); assert.deepEqual(late.network, []);
  } finally {late.close();}

  const unbound = fixture({native:false});
  try {
    unbound.format.value = ''; unbound.jq(unbound.modal).modal('show'); await settle();
    assert.equal(unbound.format.value, '', 'Sem gerador e conta nativos, nenhum padrão nem URL é inventado.');
    assert(unbound.copy.disabled && unbound.download.disabled);
    assert.equal(unbound.document.querySelector('#select2-download_type-container').textContent, 'Selecione um formato');
    assert.deepEqual(unbound.network, []); assert.deepEqual(unbound.errors, []);
  } finally {unbound.close();}
  console.log('OK: gerador nativo, formatos, conteúdo, comandos, cópia, download, segurança e navegação tardia.');
})().catch(error => {console.error(error); process.exitCode = 1;});
