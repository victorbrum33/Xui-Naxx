/* Escolha automática NAXX sobre os modos de transmissão reconhecidos pelo núcleo. */
(function () {
  'use strict';
  if (window.NaxxOnDemand) { window.NaxxOnDemand.enhance(); return; }
  var AUTO = 'naxx_auto', controllers = [], scheduled = 0, submitMarker = {};
  var labels = {'0': 'modo padrão', '1': 'LLOD v2 — FFMPEG', '2': 'LLOD v3 — PHP'};

  function mode(value) { return /^[012]$/.test(String(value)) ? String(value) : null; }
  function number(value) { var n = Number(value); return Number.isFinite(n) ? n : 0; }
  function field(data, key) { var value = data.get(key); return typeof value === 'string' ? value : ''; }
  function checked(data, key) { return data.has(key) && !/^(?:0|false|off|)$/i.test(field(data, key)); }
  function snapshot(data) {
    var servers = data.getAll('on_demand[]').map(number).filter(function (id) { return Number.isInteger(id) && id > 0; });
    servers = Array.from(new Set(servers)).sort(function (a, b) { return a - b; });
    return {
      sources: data.getAll('stream_source[]').filter(function (value) { return typeof value === 'string' && value.trim(); }).map(function (value) { return value.trim(); }),
      flags: {transcode: checked(data, 'enable_transcode') || number(field(data, 'transcode_profile_id')) > 0,
        custom_ffmpeg: field(data, 'custom_ffmpeg'), direct_source: checked(data, 'direct_source'), delay: number(field(data, 'delay_minutes')),
        fetch: {user_agent: field(data, 'user_agent'), proxy: field(data, 'http_proxy'), cookie: field(data, 'cookie'), headers: field(data, 'headers')}},
      on_demand_servers: servers
    };
  }
  function signature(data) {
    return JSON.stringify({draft: snapshot(data), fetch: ['user_agent', 'http_proxy', 'cookie', 'headers'].map(function (key) { return field(data, key); })});
  }
  function connected(controller) { return controller.form.isConnected && !controller.destroyed; }
  function text(controller, message, error) {
    if (!connected(controller)) return;
    controller.status.textContent = message;
    controller.status.setAttribute('role', error ? 'alert' : 'status');
    controller.status.dataset.state = error ? 'error' : 'info';
  }
  function syncSelect(controller) {
    var jq = window.jQuery;
    if (jq) { try { jq(controller.select).trigger('change.select2'); } catch (error) {} }
  }
  function restoreNativeForm(controller) {
    if (!connected(controller)) return;
    Array.from(controller.form.querySelectorAll('input[type="submit"],button[type="submit"]')).forEach(function (button) { button.disabled = false; });
    var jq = window.jQuery;
    if (jq) { try { jq('.wrapper').show(); jq('#status').hide(); } catch (error) {} }
  }
  function direct(controller) {
    var control = controller.form.querySelector('[name="direct_source"]');
    return !!(control && control.checked);
  }
  function busy(controller, enabled) {
    controller.busy = enabled;
    if (!connected(controller)) return;
    controller.analyze.disabled = enabled || direct(controller) || !controller.ready || controller.select.value !== AUTO;
    controller.restore.disabled = enabled || !controller.profile || !controller.profile.active;
    controller.select.disabled = enabled || direct(controller);
    controller.box.setAttribute('aria-busy', enabled ? 'true' : 'false');
  }
  function fail(controller, message) {
    busy(controller, false); restoreNativeForm(controller); text(controller, message, true);
  }
  function sourceStillCurrent(controller, expected) {
    return connected(controller) && signature(new FormData(controller.form)) === expected;
  }
  function endpoint(controller) {
    return new URL('naxx-update.php?feature=ondemand&id=' + controller.id, window.location.href).href;
  }
  function jsonRequest(controller, url, options, milliseconds) {
    var abort = new AbortController(), timeout = 0;
    controller.requests.add(abort);
    options = Object.assign({credentials: 'same-origin', cache: 'no-store'}, options);
    options.headers = Object.assign({'X-Requested-With': 'XMLHttpRequest', 'Accept': 'application/json'}, options.headers || {});
    options.signal = abort.signal;
    var expired = new Promise(function (resolve, reject) {
      timeout = window.setTimeout(function () { abort.abort(); reject(new Error('request_timeout')); }, Math.max(1, milliseconds));
    });
    var request;
    try {
      request = window.fetch(url, options).then(function (response) {
        if (response.status === 401 || response.status === 403 || /\/(?:login|license)(?:\.php)?\/?$/i.test(new URL(response.url || url, window.location.href).pathname)) throw new Error('session_expired');
        if (!response.ok) throw new Error('request_failed');
        return response.json();
      });
    } catch (error) { request = Promise.reject(error); }
    return Promise.race([request, expired]).finally(function () {
      window.clearTimeout(timeout); controller.requests.delete(abort);
    });
  }
  function api(controller, action, values) {
    return jsonRequest(controller, endpoint(controller), {method: 'POST', headers: {'Content-Type': 'application/json'},
      body: JSON.stringify(Object.assign({action: action, id: controller.id, csrf: controller.csrf}, values || {}))}, 10000).then(function (result) {
      if (!result || result.ok !== true) throw new Error('profile_failed');
      if (typeof result.csrf === 'string') controller.csrf = result.csrf;
      return result;
    });
  }
  function observation(raw) {
    if (!raw || typeof raw !== 'object' || !raw.format || typeof raw.format.format_name !== 'string' || !Array.isArray(raw.streams)) return {error: 'probe_failed'};
    return {format: {format_name: raw.format.format_name.slice(0, 120)}, streams: raw.streams.slice(0, 32).map(function (stream) {
      return {codec_type: typeof stream.codec_type === 'string' ? stream.codec_type.slice(0, 16) : '',
        codec_name: typeof stream.codec_name === 'string' ? stream.codec_name.slice(0, 64) : ''};
    })};
  }
  async function plan(controller, data) {
    var draft = snapshot(data), expected = signature(data);
    if (draft.flags.direct_source) throw new Error('direct_source');
    if (!draft.on_demand_servers.length) throw new Error('servers_required');
    if (!draft.sources.length) throw new Error('sources_required');
    if (controller.cached && controller.cached.signature === expected && controller.cached.expires > Date.now()) return controller.cached;
    var observations = [], deadline = Date.now() + 20000;
    var incompatible = draft.flags.transcode || draft.flags.custom_ffmpeg.trim() !== '' || draft.flags.delay > 0;
    if (!incompatible && draft.sources.length <= 3) {
      for (var source of draft.sources) {
        if (!sourceStillCurrent(controller, expected)) throw new Error('source_changed');
        var remaining = deadline - Date.now();
        if (remaining <= 0) { observations.push({error: 'probe_failed'}); continue; }
        var url = new URL('api', window.location.href);
        url.searchParams.set('action', 'probe_stream'); url.searchParams.set('map', '1'); url.searchParams.set('url', source);
        url.searchParams.set('user_agent', field(data, 'user_agent')); url.searchParams.set('proxy', field(data, 'http_proxy'));
        url.searchParams.set('cookies', field(data, 'cookie')); url.searchParams.set('headers', field(data, 'headers'));
        url.searchParams.set('server', String(draft.on_demand_servers[0]));
        try { observations.push(observation(await jsonRequest(controller, url.href, {}, Math.min(8000, remaining)))); }
        catch (error) {
          if (error && error.message === 'session_expired') throw error;
          observations.push({error: 'probe_failed'});
        }
      }
    }
    if (!sourceStillCurrent(controller, expected)) throw new Error('source_changed');
    var result = await api(controller, 'plan', {draft: draft, observations: observations});
    if (!sourceStillCurrent(controller, expected)) throw new Error('source_changed');
    var chosen = result.plan;
    if (!chosen || mode(chosen.mode) === null || typeof chosen.nonce !== 'string' || !/^[a-f0-9]{32,128}$/i.test(chosen.nonce)) throw new Error('invalid_plan');
    controller.cached = {plan: chosen, signature: expected, expires: Date.now() + 240000};
    text(controller, 'Escolha automática: ' + labels[String(chosen.mode)] + '. ' + (typeof chosen.reason === 'string' ? chosen.reason : '') + ' Salve o canal para aplicar.');
    return controller.cached;
  }
  function errorMessage(error) {
    return {direct_source: 'A escolha automática exige retransmissão pelo servidor. Desative Fonte direta para usar este perfil.',
      servers_required: 'Escolha pelo menos um servidor sob demanda antes de analisar ou salvar o perfil automático.',
      sources_required: 'Informe a fonte do canal antes de analisar.', source_changed: 'A fonte ou as opções mudaram durante a análise. Analise novamente antes de salvar.',
      session_expired: 'Sua sessão expirou ou você não tem permissão para editar este canal. Entre novamente no painel e reabra o canal.',
      native_unavailable: 'Não foi possível acompanhar o formulário nativo. Reabra o canal e confira o cadastro antes de tentar novamente.'}[error && error.message] || 'Não foi possível confirmar a escolha automática. Tente analisar novamente; o canal não foi enviado para gravação.';
  }
  function updateProfile(controller, profile) {
    controller.profile = profile && typeof profile === 'object' ? profile : {active: false};
    controller.restore.hidden = !controller.profile.active || mode(controller.profile.previous_mode) === null;
  }
  function finishMetadata(controller, pending, result, nativeCallback, callbackThis, callbackArguments) {
    if (!result || typeof result.location !== 'string' || !result.location.trim() || /(?:^|\/)(?:login|license)(?:[?.#]|$)/i.test(result.location)) {
      controller.cached = null; busy(controller, false);
      if (connected(controller)) return nativeCallback.apply(callbackThis, callbackArguments);
      return;
    }
    var change = pending.automatic ? api(controller, 'commit', {nonce: pending.plan.nonce}) : api(controller, 'deactivate');
    return change.then(function (response) {
      if (pending.automatic && (!response.profile || response.profile.active !== true || mode(response.profile.mode) !== pending.mode)) throw new Error('profile_failed');
      updateProfile(controller, response.profile || {active: false});
      controller.cached = null; busy(controller, false);
      if (connected(controller)) return nativeCallback.apply(callbackThis, callbackArguments);
    }).catch(function () {
      controller.cached = null;
      if (pending.automatic) { controller.select.value = String(pending.plan.mode); syncSelect(controller); }
      updateProfile(controller, {active: false});
      fail(controller, 'O canal foi salvo, mas o perfil NAXX Automático não foi confirmado. Foi solicitado ' + labels[pending.mode] + '. Reabra o canal e confira antes de tentar novamente.');
    });
  }
  function nativeSubmit(controller, receiver, native, args, pending) {
    var jq = window.jQuery, originalAjax = jq && jq.ajax, captured = false;
    if (typeof originalAjax !== 'function' || typeof window.callbackForm !== 'function') throw new Error('native_unavailable');
    var data = args[1];
    // Só este FormData recebe o callback adicional; outros formulários preservam o fluxo nativo.
    function intercept(options) {
      if (options && options.data === data && typeof options.success === 'function' && /(?:[?&])action=stream(?:&|$)/.test(options.url || '')) {
        captured = true;
        var success = options.success, failure = options.error, complete = options.complete;
        options = Object.assign({}, options);
        options.success = function () {
          var oldCallback = window.callbackForm, responseThis = this, responseArgs = arguments;
          window.callbackForm = function (result) {
            return finishMetadata(controller, pending, result, oldCallback, this, arguments);
          };
          try { return success.apply(responseThis, responseArgs); }
          finally { window.callbackForm = oldCallback; }
        };
        options.error = function () {
          controller.cached = null;
          fail(controller, 'A gravação do canal não foi confirmada. Confira o cadastro antes de tentar novamente.');
          if (connected(controller) && typeof failure === 'function') return failure.apply(this, arguments);
        };
        if (typeof complete === 'function') options.complete = complete;
        return originalAjax.call(this, options);
      }
      return originalAjax.apply(this, arguments);
    }
    jq.ajax = intercept;
    try {
      var result = native.apply(receiver, args);
      if (!captured) throw new Error('native_unavailable');
      return result;
    } finally { if (jq.ajax === intercept) jq.ajax = originalAjax; }
  }
  function findController(data) {
    if (!data || typeof data.get !== 'function') return null;
    var id = field(data, 'edit');
    return controllers.find(function (controller) { return connected(controller) && String(controller.id) === id; }) || null;
  }
  function ensureHook() {
    var original = window.submitForm;
    if (typeof original !== 'function' || original.naxxOnDemand === submitMarker) return;
    function submitForm() {
      var args = Array.prototype.slice.call(arguments), controller = args[0] === 'stream' ? findController(args[1]) : null;
      if (!controller && args[0] === 'stream' && args[1] && typeof args[1].get === 'function' && field(args[1], 'llod') === AUTO) {
        // Uma navegação pode remover o formulário entre a serialização e o envio.
        if (typeof window.showError === 'function') window.showError('Reabra o canal para confirmar a escolha automática antes de salvar.');
        return;
      }
      if (!controller) return original.apply(this, args);
      var selected = controller.select.value, automatic = selected === AUTO;
      if (!automatic && !(controller.ready && controller.profile && controller.profile.active)) return original.apply(this, args);
      if (controller.busy) return;
      if (!controller.ready || (automatic && direct(controller))) { fail(controller, errorMessage(new Error(direct(controller) ? 'direct_source' : 'native_unavailable'))); return; }
      // Mesmo em erro de integração o valor virtual nunca chega ao núcleo.
      if (!automatic && mode(selected) === null) { fail(controller, 'Escolha um modo de transmissão válido.'); return; }
      var receiver = this, expected = signature(args[1]);
      busy(controller, true);
      if (!automatic) {
        args[1].set('llod', selected);
        try { return nativeSubmit(controller, receiver, original, args, {automatic: false, mode: selected}); }
        catch (error) { fail(controller, errorMessage(error)); return; }
      }
      text(controller, 'Analisando a fonte para escolher o modo de abertura…');
      return plan(controller, args[1]).then(function (choice) {
        if (!sourceStillCurrent(controller, expected) || controller.select.value !== AUTO) throw new Error('source_changed');
        args[1].set('llod', String(choice.plan.mode));
        return nativeSubmit(controller, receiver, original, args, {automatic: true, mode: String(choice.plan.mode), plan: choice.plan});
      }).catch(function (error) { fail(controller, errorMessage(error)); });
    }
    submitForm.naxxOnDemand = submitMarker;
    window.submitForm = submitForm;
  }
  function mount(form) {
    var idControl = form.querySelector('input[name="edit"]'), select = form.querySelector('select#llod');
    var id = idControl && number(idControl.value);
    if (!select || !Number.isInteger(id) || id <= 0 || form.querySelector('input[name="m3u_file"]')) return;
    if (controllers.some(function (controller) { return controller.form === form; })) return;
    var option = document.createElement('option'); option.value = AUTO; option.textContent = 'NAXX Automático'; option.disabled = true;
    select.appendChild(option);
    var box = document.createElement('div'); box.className = 'naxx-ondemand-profile mt-2';
    var status = document.createElement('p'); status.className = 'small text-muted mb-2'; status.setAttribute('aria-live', 'polite');
    var analyze = document.createElement('button'); analyze.type = 'button'; analyze.className = 'btn btn-sm btn-light mr-2'; analyze.textContent = 'Analisar agora'; analyze.disabled = true;
    var restore = document.createElement('button'); restore.type = 'button'; restore.className = 'btn btn-sm btn-light'; restore.textContent = 'Usar modo anterior'; restore.hidden = true;
    box.appendChild(status); box.appendChild(analyze); box.appendChild(restore);
    var parent = select.parentNode; parent.appendChild(box);
    var controller = {id: id, form: form, select: select, option: option, box: box, status: status, analyze: analyze, restore: restore,
      ready: false, busy: false, profile: null, csrf: '', requests: new Set(), cached: null, touched: false, destroyed: false};
    controllers.push(controller);
    text(controller, 'Verificando a disponibilidade da escolha automática…');
    function changed(selectionChanged) {
      if (selectionChanged) controller.touched = true;
      controller.cached = null;
      if (direct(controller)) {
        option.disabled = true;
        if (select.value === AUTO) { select.value = mode(controller.profile && controller.profile.mode) || '0'; syncSelect(controller); }
        text(controller, 'NAXX Automático fica disponível para canais retransmitidos pelo servidor.');
      } else {
        option.disabled = !controller.ready;
        if (select.value === AUTO) text(controller, 'Analisa as fontes ao salvar e escolhe um modo compatível. Selecione ao menos um servidor sob demanda.');
        else if (selectionChanged && mode(select.value) !== null) text(controller, 'Modo manual selecionado: ' + labels[select.value] + '. Salve o canal para aplicar.');
      }
      busy(controller, controller.busy);
    }
    function selectChanged() { changed(true); }
    function formChanged(event) { if (event.target !== select) changed(event.target && event.target.name === 'direct_source'); }
    select.addEventListener('change', selectChanged);
    form.addEventListener('change', formChanged);
    // Select2 dispara change pelo jQuery, sem dispatchEvent nativo. Ambos os caminhos
    // atualizam apenas o estado local; a análise continua explícita e não se duplica.
    var jq = window.jQuery;
    if (jq) {
      var jqSelect = jq(select), jqForm = jq(form);
      if (jqSelect && jqForm && typeof jqSelect.on === 'function' && typeof jqForm.on === 'function') {
        jqSelect.on('change.naxxOnDemand', selectChanged);
        jqForm.on('change.naxxOnDemand', formChanged);
        controller.jqueryCleanup = function () {
          if (typeof jqSelect.off === 'function') jqSelect.off('change.naxxOnDemand');
          if (typeof jqForm.off === 'function') jqForm.off('change.naxxOnDemand');
        };
      }
    }
    form.addEventListener('input', function () { controller.cached = null; });
    analyze.addEventListener('click', function () {
      if (controller.busy || !controller.ready || select.value !== AUTO) return;
      busy(controller, true); text(controller, 'Analisando a fonte para escolher o modo de abertura…');
      plan(controller, new FormData(form)).catch(function (error) { text(controller, errorMessage(error), true); }).finally(function () { busy(controller, false); restoreNativeForm(controller); });
    });
    restore.addEventListener('click', function () {
      var previous = mode(controller.profile && controller.profile.previous_mode);
      if (controller.busy || previous === null) return;
      select.value = previous; syncSelect(controller); controller.cached = null; controller.touched = true;
      busy(controller, false); text(controller, 'Modo anterior selecionado: ' + labels[previous] + '. Salve o canal para aplicar.');
    });
    jsonRequest(controller, endpoint(controller), {}, 10000).then(function (result) {
      if (!connected(controller)) return;
      if (!result || result.ok !== true || result.feature !== 'ondemand' || typeof result.csrf !== 'string' || typeof window.submitForm !== 'function' || !window.jQuery || typeof window.jQuery.ajax !== 'function') throw new Error('unavailable');
      controller.csrf = result.csrf; controller.ready = true;
      updateProfile(controller, result.profile);
      option.disabled = direct(controller);
      if (!controller.touched && controller.profile.active && mode(controller.profile.mode) !== null && !direct(controller)) {
        select.value = AUTO; syncSelect(controller);
        text(controller, 'NAXX Automático ativo: ' + labels[String(controller.profile.mode)] + '. ' + (typeof controller.profile.reason === 'string' ? controller.profile.reason : ''));
      } else text(controller, 'Escolha NAXX Automático para analisar as fontes ao salvar. Os modos manuais continuam disponíveis.');
      busy(controller, false); ensureHook();
    }).catch(function (error) {
      if (!connected(controller)) return;
      option.disabled = true; analyze.disabled = true;
      if (error && error.message === 'session_expired') text(controller, errorMessage(error), true);
      else text(controller, 'A escolha automática ainda não está disponível neste servidor. Os modos manuais continuam disponíveis.');
    });
  }
  function enhance() {
    scheduled = 0;
    controllers.forEach(function (controller) {
      if (!controller.form.isConnected && !controller.destroyed) {
        controller.destroyed = true; controller.requests.forEach(function (request) { request.abort(); }); controller.requests.clear();
        if (controller.jqueryCleanup) controller.jqueryCleanup();
      }
    });
    controllers = controllers.filter(function (controller) { return !controller.destroyed; });
    ensureHook();
    Array.from(document.querySelectorAll('form#stream_form')).forEach(mount);
  }
  function queue() { if (!scheduled) scheduled = window.setTimeout(enhance, 0); }
  window.NaxxOnDemand = {enhance: enhance};
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () {
    enhance(); new MutationObserver(queue).observe(document.body, {childList: true, subtree: true});
  }, {once: true});
  else { enhance(); new MutationObserver(queue).observe(document.body, {childList: true, subtree: true}); }
}());
