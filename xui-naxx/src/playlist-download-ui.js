/* Melhoria da janela nativa. A conta, as opções e a geração do link continuam no XUI. */
(function () {
  'use strict';
  if (window.NaxxPlaylistDownloadUI) {
    window.NaxxPlaylistDownloadUI.refresh();
    return;
  }

  var states = new WeakMap();
  var sequence = 0;
  var scanTimer = null;
  var pollTimer = null;
  var jqueryBound = false;
  var contentLabels = {
    live: 'Canais ao vivo', movie: 'Filmes', created_live: 'Canais criados',
    radio_streams: 'Rádios', series: 'Séries'
  };

  function text(node, value) {
    if (node && node.textContent !== value) node.textContent = value;
  }

  function appendDescription(node, id) {
    var ids = (node.getAttribute('aria-describedby') || '').split(/\s+/).filter(Boolean);
    if (ids.indexOf(id) < 0) {
      ids.push(id);
      node.setAttribute('aria-describedby', ids.join(' '));
    }
  }

  function help(parent, className, message, id) {
    var node = document.createElement('p');
    node.className = className;
    if (id) node.id = id;
    node.textContent = message;
    parent.appendChild(node);
    return node;
  }

  function labelButton(button, label) {
    button.type = 'button';
    var node = button.querySelector('.naxx-playlist-action-label');
    if (!node) {
      node = document.createElement('span');
      node.className = 'naxx-playlist-action-label';
      button.appendChild(node);
    }
    text(node, label);
    button.setAttribute('aria-label', label);
    button.title = label;
    var icon = button.querySelector('i');
    if (icon && icon.getAttribute('aria-hidden') !== 'true') icon.setAttribute('aria-hidden', 'true');
  }

  function safeURL(value) {
    if (!value || value.trim() !== value || /[\u0000-\u001f\u007f\\]/.test(value)) return false;
    try {
      var absolute = /^https?:\/\//i.test(value);
      if (!absolute && !/^(?:\/(?!\/)|\.\.?\/|\?)/.test(value)) return false;
      var url = new URL(value, window.location.href);
      return /^(?:http:|https:)$/.test(url.protocol) &&
        (absolute || url.origin === window.location.origin);
    } catch (error) {
      return false;
    }
  }

  function payload(state) {
    var value = state.url.value;
    if (!value) return {kind: 'empty', text: ''};
    if (safeURL(value)) return {kind: 'url', text: value};
    // Alguns formatos nativos produzem um comando de instalação. Ele só pode
    // ser copiado; o endereço contido nele nunca é executado por esta melhoria.
    var option = state.format.options[state.format.selectedIndex];
    var template = option && option.getAttribute('data-text');
    if (template && template.split('{DEVICE_LINK}').length === 2) {
      var parts = template.split('{DEVICE_LINK}');
      if (value.indexOf(parts[0]) === 0 &&
          value.slice(value.length - parts[1].length) === parts[1]) {
        var quoted = value.slice(parts[0].length, parts[1].length ? -parts[1].length : undefined);
        var address = quoted.slice(1, -1);
        if (quoted.charAt(0) === '"' && quoted.charAt(quoted.length - 1) === '"' &&
            safeURL(address) && template.replace('{DEVICE_LINK}', '"' + address + '"') === value) {
          return {kind: 'command', text: value};
        }
      }
    }
    return {kind: 'invalid', text: ''};
  }

  function setFeedback(state, message, kind) {
    text(state.feedback, message);
    state.feedback.setAttribute('data-state', kind);
  }

  function selectedLabels(select) {
    return Array.prototype.filter.call(select.options, function (option) {
      return option.selected && option.value;
    }).map(function (option) { return option.textContent.trim(); });
  }

  function update(state) {
    if (!currentState(state)) return;
    var current = payload(state);
    var signature = state.url.value + '\n' + state.format.value + '\n' + selectedLabels(state.content).join('|');
    if (signature !== state.signature) {
      state.signature = signature;
      state.feedbackKind = '';
    }
    var command = current.kind === 'command';
    var copyDisabled = current.kind !== 'url' && !command;
    if (state.copy.disabled !== copyDisabled) state.copy.disabled = copyDisabled;
    // O gerador nativo é o único responsável por habilitar o download. Apenas
    // bloqueamos resultados vazios, comandos ou endereços não navegáveis.
    if (current.kind !== 'url' && !state.download.disabled) state.download.disabled = true;
    state.copy.setAttribute('aria-disabled', String(state.copy.disabled));
    state.download.setAttribute('aria-disabled', String(state.download.disabled));
    labelButton(state.copy, state.feedbackKind === 'copied' ? 'Copiado!' : command ? 'Copiar comando' : 'Copiar link');
    labelButton(state.download, 'Baixar playlist');
    text(state.linkLabel, command ? 'Comando do dispositivo' : 'Link da playlist');
    state.url.setAttribute('aria-label', command ? 'Comando do dispositivo' : 'Link da playlist');
    state.url.placeholder = 'Selecione o formato para gerar o link.';
    var rendered = state.modal.querySelector('#select2-download_type-container');
    if (rendered && !state.format.value) text(rendered, 'Selecione um formato');
    var search = state.content.parentElement.querySelector('.select2-search__field');
    if (search) search.placeholder = 'Todos os conteúdos';
    var selected = selectedLabels(state.content);
    text(state.summary, selected.length ? 'Conteúdo: ' + selected.join(', ') + '.' : 'Todos os conteúdos permitidos para esta conta.');
    if (!state.feedbackKind) {
      if (current.kind === 'url') setFeedback(state, 'Link pronto. Copie ou baixe a playlist.', 'ready');
      else if (command) setFeedback(state, 'Comando pronto. Copie para o dispositivo compatível.', 'ready');
      else if (current.kind === 'invalid') setFeedback(state, 'O link gerado não é válido. Selecione a conta novamente.', 'error');
      else setFeedback(state, 'Escolha um formato para gerar o link desta conta.', 'empty');
    }
  }

  function copyFallback(state, expected) {
    if (!currentState(state) || state.url.value !== expected) return false;
    var previousFocus = document.activeElement;
    var start = state.url.selectionStart;
    var end = state.url.selectionEnd;
    try {
      state.url.focus();
      state.url.select();
      state.url.setSelectionRange(0, state.url.value.length);
      return Boolean(document.execCommand && document.execCommand('copy'));
    } catch (error) {
      return false;
    } finally {
      if (start !== null && end !== null) {
        try { state.url.setSelectionRange(start, end); } catch (error) { /* Campo nativo sem seleção. */ }
      }
      if (previousFocus && previousFocus.isConnected && previousFocus.focus) previousFocus.focus();
    }
  }

  function copy(state, event) {
    event.preventDefault();
    event.stopImmediatePropagation();
    update(state);
    var current = payload(state);
    if (state.copy.disabled) return;
    var operation;
    try {
      operation = window.navigator.clipboard && window.navigator.clipboard.writeText ?
        Promise.resolve(window.navigator.clipboard.writeText(current.text)).then(function () { return true; }, function () {
          return copyFallback(state, current.text);
        }) : Promise.resolve(copyFallback(state, current.text));
    } catch (error) {
      operation = Promise.resolve(copyFallback(state, current.text));
    }
    operation.then(function (success) {
      if (!currentState(state) || state.url.value !== current.text) return;
      state.feedbackKind = success ? 'copied' : 'copy-error';
      setFeedback(state, success ? (current.kind === 'command' ? 'Comando copiado.' : 'Link copiado.') :
        'Não foi possível copiar. Selecione o campo e copie manualmente.', success ? 'success' : 'error');
      update(state);
    });
  }

  function currentState(state) {
    return state.modal.isConnected && states.get(state.modal) === state && state.modal.contains(state.url);
  }

  function release(state) {
    state.copy.removeEventListener('click', state.copyHandler, true);
    state.download.removeEventListener('click', state.downloadHandler, true);
    state.modal.removeEventListener('change', state.changeHandler);
    state.url.removeEventListener('input', state.changeHandler);
    states.delete(state.modal);
  }

  function enhance(modal) {
    var previous = states.get(modal);
    if (previous) {
      if (previous.url === modal.querySelector('#download_url') &&
          previous.copy === modal.querySelector('button[onclick*="copyDownload"]') &&
          previous.download === modal.querySelector('#download_button') &&
          previous.format === modal.querySelector('#download_type') &&
          previous.content === modal.querySelector('#output_type')) return previous;
      release(previous);
    }
    var format = modal.querySelector('#download_type');
    var content = modal.querySelector('#output_type');
    var url = modal.querySelector('#download_url');
    var download = modal.querySelector('#download_button');
    var copyButton = modal.querySelector('button[onclick*="copyDownload"]');
    var body = modal.querySelector('.modal-body');
    if (!format || !content || !url || !download || !copyButton || !body) return null;
    Array.prototype.forEach.call(modal.querySelectorAll('.naxx-playlist-intro,.naxx-playlist-help,.naxx-playlist-summary,.naxx-playlist-link-label,.naxx-playlist-feedback,.naxx-playlist-security'), function (node) { node.remove(); });
    [format, content, url].forEach(function (node) {
      var descriptions = (node.getAttribute('aria-describedby') || '').split(/\s+/).filter(function (item) {
        return item && !/^naxx-playlist-\d+-(?:format|content|feedback)$/.test(item);
      });
      if (descriptions.length) node.setAttribute('aria-describedby', descriptions.join(' '));
      else node.removeAttribute('aria-describedby');
    });
    // Não substituir controles: o XUI mantém os eventos e o Select2 existentes.
    var id = 'naxx-playlist-' + (++sequence);
    var state = {modal: modal, format: format, content: content, url: url,
      copy: copyButton, download: download, signature: null, feedbackKind: ''};
    states.set(modal, state);
    modal.classList.add('naxx-playlist-modal');
    var title = modal.querySelector('.modal-title');
    text(title, 'Baixar playlist');
    if (title && title.id) modal.setAttribute('aria-labelledby', title.id);
    var close = modal.querySelector('[data-dismiss="modal"]');
    if (close) close.setAttribute('aria-label', 'Fechar');
    var intro = document.createElement('p');
    intro.className = 'naxx-playlist-intro';
    intro.textContent = 'Escolha o formato compatível com o aplicativo ou dispositivo do cliente.';
    body.insertBefore(intro, body.firstChild);
    text(modal.querySelector('label[for="download_type"]'), 'Formato da playlist');
    text(modal.querySelector('label[for="output_type"]'), 'Conteúdo da lista');
    format.setAttribute('aria-label', 'Formato da playlist');
    format.setAttribute('data-placeholder', 'Selecione um formato');
    content.setAttribute('aria-label', 'Conteúdo da lista');
    content.setAttribute('data-placeholder', 'Todos os conteúdos');
    Array.prototype.forEach.call(content.options, function (option) {
      if (contentLabels[option.value]) text(option, contentLabels[option.value]);
    });
    var formatHelp = help(format.parentElement, 'naxx-playlist-help',
      'M3U e M3U Plus atendem à maioria dos aplicativos. HLS usa M3U8; MPEG-TS usa TS. Para receptores, escolha o modelo.', id + '-format');
    var contentHelp = help(content.parentElement, 'naxx-playlist-help',
      'Opcional. Selecione os tipos desejados ou deixe vazio para incluir todos.', id + '-content');
    appendDescription(format, formatHelp.id);
    appendDescription(content, contentHelp.id);
    state.summary = help(content.parentElement, 'naxx-playlist-summary', '');
    var group = url.closest('.input-group');
    if (group) group.classList.add('naxx-playlist-url-group');
    var actions = copyButton.parentElement;
    if (actions) actions.classList.add('naxx-playlist-actions');
    state.linkLabel = document.createElement('label');
    state.linkLabel.className = 'naxx-playlist-link-label';
    state.linkLabel.htmlFor = url.id;
    state.linkLabel.textContent = 'Link da playlist';
    (group || url).parentElement.insertBefore(state.linkLabel, group || url);
    url.readOnly = true;
    url.autocomplete = 'off';
    url.spellcheck = false;
    url.setAttribute('autocapitalize', 'off');
    state.feedback = help(body, 'naxx-playlist-feedback', '', id + '-feedback');
    state.feedback.setAttribute('role', 'status');
    state.feedback.setAttribute('aria-live', 'polite');
    state.feedback.setAttribute('aria-atomic', 'true');
    appendDescription(url, state.feedback.id);
    help(body, 'naxx-playlist-security', 'Este link contém os dados de acesso da conta. Compartilhe apenas com o cliente.');
    state.copyHandler = function (event) { copy(state, event); };
    state.downloadHandler = function (event) {
      update(state);
      if (payload(state).kind !== 'url' || download.disabled) {
        event.preventDefault();
        event.stopImmediatePropagation();
        return;
      }
      // O onclick do XUI continua fazendo o download, com seu endereço intacto.
      window.setTimeout(function () {
        if (!currentState(state)) return;
        state.feedbackKind = 'download';
        setFeedback(state, 'Download solicitado. Verifique os downloads do navegador.', 'success');
      }, 0);
    };
    state.changeHandler = function () { state.feedbackKind = ''; schedule(); };
    copyButton.addEventListener('click', state.copyHandler, true);
    download.addEventListener('click', state.downloadHandler, true);
    modal.addEventListener('change', state.changeHandler);
    url.addEventListener('input', state.changeHandler);
    if (visible(modal)) defaultFormat(state);
    return state;
  }

  function visible(modal) {
    return !modal.hidden && (modal.classList.contains('show') || modal.getAttribute('aria-hidden') === 'false' ||
      Boolean(modal.style.display && modal.style.display !== 'none'));
  }

  function defaultFormat(state) {
    var jq = window.jQuery;
    if (!state || state.format.value || !jq || typeof window.openDownload !== 'function' ||
        typeof window.doDownload !== 'function') return;
    var account = jq(state.modal);
    if (!account.data('username') || !account.data('password')) return;
    var option = Array.prototype.find.call(state.format.options, function (item) {
      return item.value === 'm3u_plus' && !item.disabled;
    });
    if (!option) return;
    // O evento shown ocorre depois de openDownload definir os dados da conta.
    // O próprio XUI gera o link, com o formato que ele já oferece no seletor.
    jq(state.format).val(option.value).trigger('change');
  }

  function bindJquery() {
    var jq = window.jQuery;
    if (jqueryBound || !jq || !jq.fn || !jq.fn.on) return;
    jq(document).on('shown.bs.modal.naxxPlaylistDownload', '.downloadModal', function () {
      defaultFormat(enhance(this));
      schedule();
    });
    jq(document).on('hidden.bs.modal.naxxPlaylistDownload', '.downloadModal', schedule);
    // Select2 notifica mudanças através do jQuery, sem evento DOM obrigatório.
    jq(document).on('change.naxxPlaylistDownload', '.downloadModal #download_type,.downloadModal #output_type', schedule);
    jqueryBound = true;
  }

  function refresh() {
    scanTimer = null;
    bindJquery();
    var hasVisibleModal = false;
    Array.prototype.forEach.call(document.querySelectorAll('.downloadModal'), function (modal) {
      var state = enhance(modal);
      if (!state) return;
      update(state);
      if (visible(modal)) hasVisibleModal = true;
    });
    if (hasVisibleModal && pollTimer === null) {
      // .val() nativo não emite input. Observar apenas a janela aberta também
      // contempla a geração assíncrona, sem interceptar funções do painel.
      pollTimer = window.setTimeout(function () { pollTimer = null; refresh(); }, 220);
    } else if (!hasVisibleModal && pollTimer !== null) {
      window.clearTimeout(pollTimer);
      pollTimer = null;
    }
  }

  function schedule() {
    if (scanTimer === null) scanTimer = window.setTimeout(refresh, 0);
  }

  window.NaxxPlaylistDownloadUI = {refresh: refresh};
  var observer = new MutationObserver(function (mutations) {
    if (mutations.some(function (mutation) {
      var node = mutation.target;
      if (node.nodeType === 1 && node.closest('.downloadModal')) return true;
      return Array.prototype.some.call(mutation.addedNodes, function (added) {
        return added.nodeType === 1 && (added.matches('.downloadModal') || added.querySelector('.downloadModal'));
      });
    })) schedule();
  });
  function start() {
    refresh();
    observer.observe(document.documentElement, {childList: true, subtree: true, attributes: true,
      attributeFilter: ['class', 'style', 'aria-hidden', 'disabled', 'value', 'data-username', 'data-password']});
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, {once: true});
  else start();
}());
