/* Página inicial pública: temas fixos e aplicação autenticada na aba Configurações. */
(function () {
  'use strict';
  var current = null;
  var themes = [
    {id:'naxx',name:'Naxx Azul',description:'Azul intenso, traços de luz e identidade NAXX.',colors:['#080f20','#4788ff','#dceaff']},
    {id:'aurora',name:'Aurora',description:'Verde e turquesa em um visual fluido e envolvente.',colors:['#062821','#9fe4b0','#e2f2dc']},
    {id:'claro',name:'Claro',description:'Tons claros, bastante espaço e acabamento minimalista.',colors:['#f5f3ec','#184ee8','#161c2b']},
    {id:'cinema',name:'Cinema',description:'Vinho, dourado e uma composição inspirada no cinema.',colors:['#241013','#e5b16f','#faeee0']}
  ];
  function known(id) { return themes.some(function (theme) { return theme.id === id; }); }
  function mount(link, pane) {
    var state = null, csrf = '', draft = 'naxx', loaded = false, pending = false, destroyed = false;
    var requestController = null, previewController = null, revision = 0, selectedPreview = '';
    pane.innerHTML = '<section class="naxx-public-page"><header class="naxx-public-heading"><div><span class="naxx-public-eyebrow">IDENTIDADE NAXX</span><h2>Página inicial do servidor</h2><p>A página exibida ao abrir o endereço principal do servidor.</p></div><a class="btn btn-light" data-public-open target="_blank" rel="noopener noreferrer">Abrir página inicial <span aria-hidden="true">↗</span></a></header>' +
      '<div class="naxx-public-notice" data-public-notice role="status" aria-live="polite" hidden></div>' +
      '<div class="naxx-public-layout"><section class="naxx-public-picker"><div class="naxx-public-section-heading"><h3>Escolha um tema</h3><button type="button" class="btn btn-light" data-public-refresh>Atualizar</button></div><p class="text-muted">Quatro estilos prontos. Visualize e aplique o que combina com sua NAXX.</p><div class="naxx-public-themes" role="radiogroup" aria-label="Tema da página inicial"></div>' +
      '<div class="naxx-public-apply"><p data-public-current>Consultando a página atual…</p><button type="button" class="btn btn-primary" data-public-apply disabled>Aplicar tema</button><button type="button" class="btn btn-light" data-public-restore disabled>Restaurar página original</button><small class="text-muted">A escolha só entra no ar ao clicar em Aplicar tema.</small></div></section>' +
      '<section class="naxx-public-preview"><div class="naxx-public-section-heading"><h3>Prévia <span data-public-preview-name>Naxx Azul</span></h3><div class="naxx-public-devices" aria-label="Tamanho da prévia"><button type="button" aria-pressed="true" data-public-device="desktop">Computador</button><button type="button" aria-pressed="false" data-public-device="mobile">Celular</button></div></div><div class="naxx-public-preview-stage" data-public-preview-stage><p data-public-preview-message role="status">Escolha um tema para visualizar.</p><iframe title="Prévia da página inicial" sandbox="" referrerpolicy="no-referrer" hidden></iframe></div><p class="text-muted naxx-public-preview-caption">A prévia permite conferir o visual antes de publicar.</p></section></div></section>';
    var root = pane.querySelector('.naxx-public-page');
    function query(selector) { return root.querySelector(selector); }
    query('[data-public-open]').href = new URL('/', window.location.href).href;
    var cards = [], frame = query('iframe'), previewMessage = query('[data-public-preview-message]');
    themes.forEach(function (theme, index) {
      var card = document.createElement('button'); card.type = 'button'; card.className = 'naxx-public-theme';
      card.dataset.publicTheme = theme.id; card.setAttribute('role', 'radio'); card.setAttribute('aria-checked', String(theme.id === draft)); card.tabIndex = index ? -1 : 0;
      var sample = document.createElement('span'); sample.className = 'naxx-public-sample'; sample.setAttribute('aria-hidden', 'true');
      sample.style.setProperty('--sample-bg', theme.colors[0]); sample.style.setProperty('--sample-accent', theme.colors[1]); sample.style.setProperty('--sample-ink', theme.colors[2]);
      sample.innerHTML = '<span class="naxx-public-sample-mark">N</span><span class="naxx-public-sample-lines"><i></i><i></i></span><span class="naxx-public-sample-orbit"></span>';
      var name = document.createElement('strong'); name.textContent = theme.name;
      var description = document.createElement('span'); description.className = 'naxx-public-theme-description'; description.textContent = theme.description;
      var badge = document.createElement('span'); badge.className = 'naxx-public-in-use'; badge.textContent = 'Em uso'; badge.hidden = true;
      card.append(sample, name, description, badge); query('.naxx-public-themes').appendChild(card); cards.push(card);
      card.addEventListener('click', function () { choose(theme.id); });
      card.addEventListener('keydown', function (event) {
        if (!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home','End'].includes(event.key) || pending) return;
        event.preventDefault(); var next = event.key === 'Home' ? 0 : event.key === 'End' ? themes.length - 1 : (index + (/Right|Down/.test(event.key) ? 1 : -1) + themes.length) % themes.length;
        choose(themes[next].id); cards[next].focus();
      });
    });
    function notice(message, error) {
      var node = query('[data-public-notice]'); node.hidden = !message; node.textContent = message || ''; node.dataset.tone = error ? 'error' : 'success'; node.setAttribute('role', error ? 'alert' : 'status');
    }
    function connected() { return !destroyed && pane.isConnected; }
    function controls() {
      var ready = !!state && !!csrf && Array.isArray(state.available) && state.available.includes(draft);
      cards.forEach(function (card) {
        var id = card.dataset.publicTheme; card.disabled = pending; card.setAttribute('aria-checked', String(id === draft)); card.tabIndex = id === draft ? 0 : -1;
        card.querySelector('.naxx-public-in-use').hidden = !state || state.selected !== id;
      });
      query('[data-public-refresh]').disabled = pending;
      query('[data-public-apply]').disabled = pending || !ready || state.can_publish !== true || state.selected === draft;
      query('[data-public-restore]').disabled = pending || !state || !csrf || state.can_restore !== true;
      query('[data-public-apply]').textContent = pending ? 'Aguarde…' : 'Aplicar tema'; root.setAttribute('aria-busy', String(pending));
      query('[data-public-current]').textContent = !state ? 'Consultando a página atual…' : state.selected === 'original' ? 'Em uso: página original do servidor.' : known(state.selected) ? 'Em uso: ' + themes.find(function (theme) { return theme.id === state.selected; }).name + '.' : 'Em uso: página personalizada.';
    }
    async function request(action, theme, signal) {
      var url = new URL('naxx-update.php', window.location.href); url.searchParams.set('feature', 'public-page');
      if (action === 'preview') url.searchParams.set('preview', theme);
      var init = {credentials:'same-origin',cache:'no-store',signal:signal,headers:{Accept:'application/json','X-Requested-With':'XMLHttpRequest'}};
      if (action === 'publish' || action === 'restore') { init.method = 'POST'; init.headers['Content-Type'] = 'application/json'; init.body = JSON.stringify({action:action,theme:action === 'publish' ? theme : undefined,csrf:csrf}); }
      var response = await window.fetch(url.href, init);
      if (response.redirected || /\/(?:login|license)(?:[/?#.]|$)/i.test(response.url)) throw new Error('Sua sessão expirou. Entre novamente no painel.');
      var result;
      try { result = JSON.parse(await response.text()); } catch (_) { throw new Error('Não foi possível consultar a página inicial. Atualize esta aba e tente novamente.'); }
      if (!result || typeof result !== 'object' || Array.isArray(result) || !response.ok || result.ok !== true) throw new Error(result && typeof result.message === 'string' ? result.message : 'O serviço da página inicial está indisponível. Atualize esta aba e tente novamente.');
      return result;
    }
    function accept(result) {
      var next = result.state;
      if (!next || !Array.isArray(next.available) || !['original','custom'].concat(themes.map(function (theme) { return theme.id; })).includes(next.selected) || typeof next.can_publish !== 'boolean' || typeof next.can_restore !== 'boolean' || typeof result.csrf !== 'string' || !/^[a-f0-9]{64}$/.test(result.csrf)) throw new Error('O serviço retornou informações incompletas. Atualize esta aba.');
      state = next; csrf = result.csrf;
    }
    async function preview(id) {
      if (previewController) previewController.abort(); var controller = new AbortController(); previewController = controller; var ticket = ++revision;
      selectedPreview = ''; frame.hidden = true; previewMessage.hidden = false; previewMessage.textContent = 'Preparando prévia…';
      query('[data-public-preview-name]').textContent = themes.find(function (theme) { return theme.id === id; }).name;
      var timeout = window.setTimeout(function () { controller.abort(); }, 15000);
      try {
        var result = await request('preview', id, controller.signal);
        if (!connected() || ticket !== revision || controller.signal.aborted) return;
        if (!result.preview || result.preview.theme !== id || typeof result.preview.html !== 'string' || result.preview.html.length > 131072 || !/<!doctype html>/i.test(result.preview.html)) throw new Error('A prévia deste tema não está disponível. Tente selecioná-lo novamente.');
        frame.srcdoc = result.preview.html; frame.title = 'Prévia: ' + themes.find(function (theme) { return theme.id === id; }).name;
        frame.hidden = false; previewMessage.hidden = true; selectedPreview = id;
      } catch (error) {
        if (connected() && ticket === revision) { previewMessage.textContent = error.name === 'AbortError' ? 'A prévia demorou para responder. Selecione o tema novamente.' : error.message; }
      } finally { window.clearTimeout(timeout); if (previewController === controller) previewController = null; }
    }
    function choose(id) {
      if (pending || !known(id) || !connected()) return;
      draft = id; controls(); if (selectedPreview !== id) preview(id);
    }
    async function load() {
      if (pending || !connected()) return; pending = true; controls(); notice('');
      var controller = new AbortController(); requestController = controller;
      var timeout = window.setTimeout(function () { controller.abort(); }, 15000);
      try {
        var result = await request('status', null, controller.signal); if (!connected()) return;
        accept(result); if (!loaded && known(state.selected)) draft = state.selected; loaded = true;
        if (state.reason) notice(String(state.reason), !state.can_publish);
        preview(draft);
      } catch (error) { if (connected()) { state = null; csrf = ''; notice(error.name === 'AbortError' ? 'A consulta demorou para responder. Clique em Atualizar.' : error.message, true); } }
      finally { window.clearTimeout(timeout); if (requestController === controller) requestController = null; pending = false; if (connected()) controls(); }
    }
    async function apply(action) {
      if (pending || !state || !csrf || (action === 'publish' ? !state.can_publish || !state.available.includes(draft) || state.selected === draft : !state.can_restore)) return;
      pending = true; controls(); notice(''); var controller = new AbortController(); requestController = controller;
      var timeout = window.setTimeout(function () { controller.abort(); }, 15000);
      try {
        var result = await request(action, draft, controller.signal); if (!connected()) return;
        accept(result); notice(action === 'publish' ? 'Tema aplicado. A nova página inicial já está disponível.' : 'A página original foi restaurada.');
      } catch (error) { if (connected()) { state = null; csrf = ''; notice(error.name === 'AbortError' ? 'Não foi possível confirmar a alteração. Clique em Atualizar para conferir o tema em uso.' : error.message, true); } }
      finally { window.clearTimeout(timeout); if (requestController === controller) requestController = null; pending = false; if (connected()) controls(); }
    }
    query('[data-public-refresh]').addEventListener('click', load);
    query('[data-public-apply]').addEventListener('click', function () { apply('publish'); });
    query('[data-public-restore]').addEventListener('click', function () { apply('restore'); });
    root.querySelectorAll('[data-public-device]').forEach(function (button) { button.addEventListener('click', function () {
      query('[data-public-preview-stage]').dataset.device = button.dataset.publicDevice;
      root.querySelectorAll('[data-public-device]').forEach(function (other) { other.setAttribute('aria-pressed', String(other === button)); });
    }); });
    function open() {
      if (!window.jQuery || !window.jQuery.fn || !window.jQuery.fn.tab) {
        var nav = link.closest('ul'); nav.querySelectorAll('.nav-link').forEach(function (other) { other.classList.toggle('active', other === link); other.setAttribute('aria-selected', String(other === link)); });
        Array.from(pane.parentElement.children).forEach(function (other) { if (other.classList.contains('tab-pane')) { other.classList.toggle('active', other === pane); other.classList.toggle('show', other === pane); } });
      }
      if (!loaded && !pending) load();
    }
    link.addEventListener('click', open);
    return {pane:pane,link:link,open:open,destroy:function () { destroyed = true; revision++; if (requestController) requestController.abort(); if (previewController) previewController.abort(); link.removeEventListener('click', open); var item = link.closest('li'); if (item) item.remove(); else link.remove(); pane.remove(); }};
  }
  function enhance() {
    var logs = /\/settings(?:\.php)?$/.test(window.location.pathname) ? document.querySelector('a[data-toggle="tab"][href="#logs"]') : null;
    var content = logs && document.getElementById('logs'), nav = logs && logs.closest('ul');
    if (current && (!logs || !nav || !content || !current.link.isConnected || current.link.closest('ul') !== nav || !current.pane.isConnected || current.pane.parentElement !== content.parentElement)) { current.destroy(); current = null; }
    if (!logs || !content || !nav || current) return;
    var item = document.createElement('li'); item.className = 'nav-item';
    var link = document.createElement('a'); link.id = 'naxx-public-page-tab'; link.className = 'nav-link rounded-0 pt-2 pb-2'; link.href = '#naxx-public-page'; link.dataset.toggle = 'tab'; link.setAttribute('role','tab'); link.setAttribute('aria-controls','naxx-public-page'); link.setAttribute('aria-selected','false');
    link.innerHTML = '<i class="fas fa-palette mr-1" aria-hidden="true"></i><span>Página inicial</span>'; item.appendChild(link); logs.closest('li').after(item);
    var pane = document.createElement('div'); pane.id = 'naxx-public-page'; pane.className = 'tab-pane'; pane.setAttribute('role','tabpanel'); pane.setAttribute('aria-labelledby',link.id); content.parentElement.appendChild(pane);
    current = mount(link, pane);
  }
  window.NaxxPublicPage = {enhance:enhance}; enhance();
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', enhance, {once:true});
}());
