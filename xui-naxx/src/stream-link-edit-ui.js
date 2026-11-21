/* Links e logos na edição em massa. Toda escrita exige uma prévia do servidor. */
(function () {
  'use strict';
  var active = null, observer = null, scheduled = false, parserPromise = null;
  var maxSelected = 50000, maxBytes = 256 * 1024 * 1024, maxRecords = 1000000;

  function element(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }
  function field(parent, key, label, type) {
    var wrap = element('label', 'naxx-stream-link-edit__field');
    var control = element('input', 'form-control');
    control.type = type || 'text'; control.dataset.naxxLink = key;
    control.autocomplete = 'off'; control.spellcheck = false;
    wrap.appendChild(element('span', '', label)); wrap.appendChild(control); parent.appendChild(wrap);
    return control;
  }
  function checkbox(parent, key, text, checked) {
    var label = element('label', 'naxx-stream-link-edit__check'), input = element('input');
    input.type = 'checkbox'; input.checked = checked; input.dataset.naxxLink = key;
    label.appendChild(input); label.appendChild(document.createTextNode(' ' + text)); parent.appendChild(label);
    return input;
  }
  function button(parent, key, text, primary) {
    var node = element('button', 'btn ' + (primary ? 'btn-primary' : 'btn-light'), text);
    node.type = 'button'; node.dataset.naxxLink = key; parent.appendChild(node); return node;
  }
  function option(select, value, text) { var node = element('option', '', text); node.value = value; select.appendChild(node); }
  function ids() {
    if (!Array.isArray(window.rSelected)) throw new Error('selection_unavailable');
    var selected = Array.from(new Set(window.rSelected.map(String)));
    if (!selected.length) throw new Error('selection_empty');
    if (selected.length > maxSelected) throw new Error('selection_limit');
    if (selected.some(function (id) {return !/^[1-9]\d*$/.test(id) || !Number.isSafeInteger(Number(id));})) throw new Error('selection_invalid');
    return selected.sort(function (a, b) {return Number(a) - Number(b);});
  }
  function selectionKey() {try {return JSON.stringify(ids());} catch (_) {return '';}}
  function nameKey(name) {return String(name || '').replace(/[\u0009-\u000d\u0020\u0085\u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000\ufeff]+/g, ' ').replace(/^ +| +$/g, '').replace(/[A-Z]/g, function (letter) {return letter.toLowerCase();});}
  function loadParser() {
    if (window.NaxxImporter && typeof window.NaxxImporter.createM3UReader === 'function') return Promise.resolve();
    if (!parserPromise) parserPromise = new Promise(function (resolve, reject) {
      var script = document.createElement('script'); script.src = url('assets/js/naxx-importer.js'); script.async = true;
      script.onload = function () {if (window.NaxxImporter && typeof window.NaxxImporter.createM3UReader === 'function') resolve(); else {parserPromise = null; script.remove(); reject(new Error('importer_unavailable'));}};
      script.onerror = function () {parserPromise = null; script.remove(); reject(new Error('importer_unavailable'));};
      document.head.appendChild(script);
    });
    return parserPromise;
  }
  function current(state) {return active === state && state.box.isConnected && /\/stream_mass(?:\.php)?$/.test(window.location.pathname);}
  function status(state, message, error) {
    state.status.textContent = message; state.status.classList.toggle('text-danger', Boolean(error));
  }
  function errorText(error) {
    if (error && error.userMessage) return error.userMessage;
    var messages = {
      selection_unavailable: 'Aguarde a seleção de canais carregar.', selection_empty: 'Selecione os canais na primeira aba antes de gerar a prévia.',
      selection_limit: 'Selecione até 50.000 canais por operação.', selection_invalid: 'A seleção está inválida. Selecione os canais novamente.',
      operation_empty: 'Ative a alteração dos links, dos logos ou de ambos.', source_find: 'Preencha o texto a localizar nos links.',
      logo_find: 'Preencha o texto a localizar nos logos.', logo_url: 'Informe uma URL HTTP ou HTTPS válida para o logo.',
      file_missing: 'Escolha um arquivo M3U ou M3U8.', url_invalid: 'Informe uma URL HTTP ou HTTPS para a lista, sem usuário e senha antes do domínio.',
      importer_unavailable: 'O leitor M3U ainda não está disponível. Atualize a página e tente novamente.',
      list_empty: 'A lista não contém entradas M3U com nome e fonte.', list_limit: 'A lista ultrapassa o limite de 256 MB ou 1 milhão de entradas.',
      line_limit: 'Uma linha da lista é muito longa. Verifique o arquivo M3U.', list_incomplete: 'Não foi possível confirmar a lista completa. Carregue-a novamente.',
      invalid_response: 'O painel retornou uma resposta inválida. Atualize a página e gere outra prévia.',
      request_failed: 'Não foi possível concluir a solicitação. Verifique sua conexão e gere outra prévia.',
      request_limit: 'Os dados da atualização ultrapassam 8 MB. Selecione menos canais e gere outra prévia.',
      preview_changed: 'A seleção ou os campos mudaram. Gere uma nova prévia antes de aplicar.',
      preview_expired: 'A prévia expirou. Gere outra prévia antes de aplicar.',
      permission: 'A sessão expirou ou não tem permissão para esta operação. Entre novamente no painel.',
      conflict: 'Alguns canais mudaram desde a prévia. Gere outra prévia para revisar os valores atuais.'
    };
    return messages[error && error.message] || 'Não foi possível concluir. Gere outra prévia e tente novamente.';
  }
  function invalidate(state, message) {
    state.generation++;
    if (state.request && !state.applying) state.request.abort();
    state.request = null; state.preview = null; state.apply.disabled = true; state.apply.textContent = 'Aplicar alterações revisadas';
    state.applied = 0; state.cursor = 0; state.stopApply.hidden = true; state.fields.disabled = false;
    window.clearTimeout(state.expiryTimer); state.result.hidden = true; state.changes.replaceChildren();
    if (!state.applying) {state.previewButton.disabled = false; state.cancel.hidden = true;}
    if (message) status(state, message);
  }
  function url(path) {return new URL(path, window.location.href).href;}
  async function request(state, payload, signal) {
    var options = {credentials: 'same-origin', cache: 'no-store', signal: signal,
      headers: {'X-Requested-With': 'XMLHttpRequest', 'Accept': 'application/json'}};
    if (payload) {
      options.method = 'POST'; options.headers['Content-Type'] = 'application/json'; options.body = JSON.stringify(payload);
      if (new TextEncoder().encode(options.body).byteLength > state.requestBytes) throw new Error('request_limit');
    }
    var response = await window.fetch(url('naxx-update.php?feature=stream-link-edit'), options);
    if (response.redirected || response.status === 401 || response.status === 403) throw new Error('permission');
    var result;
    try {result = await response.json();} catch (_) {throw new Error('invalid_response');}
    if (!response.ok) {
      var failure = new Error(response.status === 409 ? 'conflict' : response.status === 410 ? 'preview_expired' : response.status === 413 ? 'request_limit' : 'request_failed');
      failure.status = response.status;
      if (result && Number.isSafeInteger(result.applied)) failure.applied = result.applied;
      if (result && typeof result.message === 'string') failure.userMessage = result.message.slice(0, 500);
      throw failure;
    }
    if (!result || result.ok !== true) throw new Error('request_failed');
    if (typeof result.csrf === 'string' && /^[a-f0-9]{64}$/.test(result.csrf)) state.csrf = result.csrf;
    if (result.limits && Number.isSafeInteger(result.limits.request_bytes) && result.limits.request_bytes > 0) state.requestBytes = Math.min(8388608, result.limits.request_bytes);
    return result;
  }
  function signature(state) {
    var c = state.controls, file = c.file.files && c.file.files[0];
    return JSON.stringify([selectionKey(), c.mode.value, c.source.checked, c.sourceFind.value, c.sourceReplace.value,
      c.logo.checked, c.logoMode.value, c.logoFind.value, c.logoReplace.value, c.logoURL.value,
      c.inputMode.value, c.url.value, file && [file.name, file.size, file.lastModified], c.importSource.checked, c.importLogo.checked]);
  }
  function operation(state) {
    var c = state.controls, result = {kind: 'replace'};
    if (c.mode.value === 'm3u') {
      if (!c.importSource.checked && !c.importLogo.checked) throw new Error('operation_empty');
      if (c.inputMode.value === 'file' && !(c.file.files && c.file.files[0])) throw new Error('file_missing');
      if (c.inputMode.value === 'url') {
        var address;
        try {address = new URL(c.url.value.trim());} catch (_) {throw new Error('url_invalid');}
        if (!/^https?:$/.test(address.protocol) || address.username || address.password) throw new Error('url_invalid');
      }
      return {kind: 'm3u', update_source: c.importSource.checked, update_logo: c.importLogo.checked};
    }
    if (c.source.checked) {
      if (!c.sourceFind.value) throw new Error('source_find');
      result.source = {find: c.sourceFind.value, replace: c.sourceReplace.value};
    }
    if (c.logo.checked) {
      if (c.logoMode.value === 'set') {
        var logo;
        try {logo = new URL(c.logoURL.value.trim());} catch (_) {throw new Error('logo_url');}
        if (!/^https?:$/.test(logo.protocol) || !logo.hostname) throw new Error('logo_url');
        result.logo = {mode: 'set', url: c.logoURL.value.trim()};
      } else {
        if (!c.logoFind.value) throw new Error('logo_find');
        result.logo = {mode: 'replace', find: c.logoFind.value, replace: c.logoReplace.value};
      }
    }
    if (!result.source && !result.logo) throw new Error('operation_empty');
    return result;
  }

  // Leitura incremental: retém no máximo duas entradas por nome selecionado.
  // A segunda mantém a evidência de ambiguidade, mesmo se a URL se repetir.
  function m3uReader(state, catalog, signal) {
    if (!window.NaxxImporter || typeof window.NaxxImporter.createM3UReader !== 'function') throw new Error('importer_unavailable');
    var keys = new Set(catalog.map(function (channel) {return channel.match_key;}).filter(function (key) {return typeof key === 'string';})), kept = new Map(), pending = '', bytes = 0, records = 0;
    var decoder = new TextDecoder('utf-8'), lastYield = 0;
    var readLine = window.NaxxImporter.createM3UReader(function (record) {
      records++; if (records > maxRecords) throw new Error('list_limit');
      var key = nameKey(record.name);
      if (!key || !keys.has(key)) return;
      var matches = kept.get(key); if (!matches) {matches = []; kept.set(key, matches);}
      if (matches.length < 2) matches.push({name: String(record.name), url: String(record.url || '').trim(), logo: String(record.logo || '').trim()});
    });
    async function consume(chunk, final) {
      if (signal.aborted) throw new DOMException('Cancelado', 'AbortError');
      bytes += chunk ? chunk.byteLength : 0; if (bytes > maxBytes) throw new Error('list_limit');
      pending += decoder.decode(chunk, {stream: !final});
      var start = 0, newline;
      while ((newline = pending.indexOf('\n', start)) >= 0) {
        if (newline - start > 65536) throw new Error('line_limit');
        readLine(pending.slice(start, newline)); start = newline + 1;
        if (Date.now() - lastYield > 12) {
          status(state, 'Lendo lista… ' + records.toLocaleString('pt-BR') + ' entradas; somente os nomes selecionados ficam na revisão.');
          await new Promise(function (resolve) {window.setTimeout(resolve, 0);}); lastYield = Date.now();
          if (signal.aborted) throw new DOMException('Cancelado', 'AbortError');
        }
      }
      pending = pending.slice(start); if (pending.length > 65536) throw new Error('line_limit');
      if (final && pending) {readLine(pending); pending = '';}
    }
    return {consume: consume, finish: function () {
      if (!records) throw new Error('list_empty');
      var items = []; kept.forEach(function (matches) {matches.forEach(function (item) {items.push(item);});});
      return {items: items, scanned: records, bytes: bytes};
    }};
  }
  async function readFile(file, parser, signal) {
    if (file.size > maxBytes) throw new Error('list_limit');
    for (var position = 0; position < file.size; position += 256 * 1024) {
      if (signal.aborted) throw new DOMException('Cancelado', 'AbortError');
      var blob = file.slice(position, position + 256 * 1024), buffer;
      if (typeof blob.arrayBuffer === 'function') buffer = await blob.arrayBuffer();
      else buffer = await new Promise(function (resolve, reject) {
        var reader = new FileReader(); reader.onload = function () {resolve(reader.result);};
        reader.onerror = function () {reject(new Error('request_failed'));}; reader.readAsArrayBuffer(blob);
      });
      await parser.consume(new Uint8Array(buffer), false);
    }
    await parser.consume(undefined, true);
  }
  async function readURL(address, parser, signal) {
    var response = await window.fetch(url('naxx-import-url.php'), {method: 'POST', credentials: 'same-origin', cache: 'no-store', signal: signal,
      headers: {'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8', 'X-Requested-With': 'XMLHttpRequest'}, body: new URLSearchParams({url: address})});
    if (response.redirected || response.status === 401 || response.status === 403) throw new Error('permission');
    if (!response.ok || response.headers.get('X-Naxx-Stream-Protocol') !== '1' || !response.body || !response.body.getReader) throw new Error('list_incomplete');
    var reader = response.body.getReader(), buffer = null, offset = 0, total = 0;
    async function take(length, content) {
      var output = content ? null : new Uint8Array(length), written = 0;
      while (written < length) {
        if (signal.aborted) throw new DOMException('Cancelado', 'AbortError');
        if (!buffer || offset === buffer.byteLength) {
          var incoming = await reader.read(); if (incoming.done) throw new Error('list_incomplete');
          buffer = incoming.value; offset = 0; if (!buffer.byteLength) continue;
        }
        var count = Math.min(length - written, buffer.byteLength - offset), piece = buffer.subarray(offset, offset + count);
        if (content) {total += count; await parser.consume(piece, false);} else output.set(piece, written);
        offset += count; written += count;
      }
      return output;
    }
    async function size() {var value = await take(4, false); return new DataView(value.buffer).getUint32(0, false);}
    try {
      while (true) {
        var length = await size();
        if (!length) {
          var finalLength = await size(); if (!finalLength || finalLength > 65536) throw new Error('list_incomplete');
          var complete;
          try {complete = JSON.parse(new TextDecoder('utf-8', {fatal: true}).decode(await take(finalLength, false)));} catch (_) {throw new Error('list_incomplete');}
          if (!complete || complete.ok !== true || complete.bytes !== total || (buffer && offset < buffer.byteLength)) throw new Error('list_incomplete');
          while (true) {var extra = await reader.read(); if (extra.done) break; if (extra.value.byteLength) throw new Error('list_incomplete');}
          break;
        }
        if (length > 16777216) throw new Error('list_incomplete');
        await take(length, true);
      }
      await parser.consume(undefined, true);
    } catch (error) {try {await reader.cancel();} catch (_) {} throw error;}
    finally {reader.releaseLock();}
  }
  function masked(value, show) {
    if (show) return String(value || '');
    try {var address = new URL(String(value)); return address.protocol + '//' + address.host + '/…' + (address.search ? '?…' : '');}
    catch (_) {return value ? '(valor oculto)' : '(vazio)';}
  }
  function render(state) {
    var preview = state.preview; if (!preview) return;
    state.changes.replaceChildren();
    var summary = preview.summary;
    state.summary.textContent = summary.selected + ' selecionados · ' + summary.changed + ' com alterações · ' +
      (summary.unchanged || 0) + ' sem alteração · ' + (summary.unmatched || 0) + ' sem correspondência · ' + (summary.ambiguous || 0) + ' ambíguos · ' + (summary.invalid || 0) + ' inválidos';
    (preview.changes || []).slice(0, 100).forEach(function (change) {
      var row = element('tr'); row.appendChild(element('td', '', String(change.id) + ' — ' + String(change.name || '')));
      [['old_sources', 'old_logo'], ['new_sources', 'new_logo']].forEach(function (keys) {
        var cell = element('td'), sources = change[keys[0]];
        if (Array.isArray(sources)) sources.forEach(function (source) {cell.appendChild(element('div', 'naxx-stream-link-edit__url', masked(source, state.show.checked)));});
        if (Object.prototype.hasOwnProperty.call(change, keys[1])) cell.appendChild(element('div', 'naxx-stream-link-edit__url', 'Logo: ' + masked(change[keys[1]], state.show.checked)));
        row.appendChild(cell);
      });
      state.changes.appendChild(row);
    });
    state.sample.textContent = preview.truncated ? 'Amostra de até 100 canais. A aplicação abrange os ' + summary.changed + ' canais com alterações da prévia.' : 'A prévia inclui todos os canais com alterações.';
    state.issues.replaceChildren();
    var reasons = {unmatched: 'Nome não encontrado na lista', ambiguous: 'Nome repetido no painel ou na lista', invalid: 'Fonte ou logo inválido',
      duplicate_existing: 'Nome repetido no painel', duplicate_import: 'Nome repetido na lista', invalid_source: 'Fonte inválida', invalid_logo: 'Logo inválido'};
    (preview.issues || []).slice(0, 100).forEach(function (issue) {state.issues.appendChild(element('li', '', String(issue.id) + ' — ' + String(issue.name || '') + ': ' + (reasons[issue.reason] || String(issue.reason || 'Entrada não aplicável').slice(0, 500))));});
    state.issueBox.hidden = !(preview.issues && preview.issues.length);
    state.issueNote.textContent = preview.issues_truncated ? 'Exibindo até 100 nomes; os totais acima incluem todos os canais.' : '';
    state.result.hidden = false;
  }
  function expires(value) {
    var timestamp = typeof value === 'number' ? value * (value < 100000000000 ? 1000 : 1) : Date.parse(value);
    return Number.isFinite(timestamp) ? timestamp : 0;
  }
  async function preview(state) {
    if (state.applying) return;
    invalidate(state);
    var selected, update;
    try {selected = ids(); update = operation(state);} catch (error) {status(state, errorText(error), true); return;}
    var controller = new AbortController(), generation = state.generation, key = signature(state);
    state.request = controller; state.previewButton.disabled = true; state.cancel.hidden = false;
    status(state, 'Preparando a prévia dos canais selecionados…');
    try {
      if (!state.csrf) await request(state, null, controller.signal);
      if (!state.csrf) throw new Error('invalid_response');
      if (update.kind === 'm3u') {
        var catalog = await request(state, {action: 'catalog', csrf: state.csrf, ids: selected}, controller.signal);
        if (!Array.isArray(catalog.channels) || catalog.channels.length !== selected.length || catalog.channels.some(function (channel) {return !channel || typeof channel.name !== 'string' || (channel.match_key !== null && typeof channel.match_key !== 'string');})) throw new Error('invalid_response');
        await loadParser();
        if (controller.signal.aborted || generation !== state.generation || key !== signature(state) || !current(state)) return;
        var parser = m3uReader(state, catalog.channels, controller.signal);
        if (state.controls.inputMode.value === 'file') await readFile(state.controls.file.files[0], parser, controller.signal);
        else await readURL(state.controls.url.value.trim(), parser, controller.signal);
        var parsed = parser.finish(); update.items = parsed.items;
      }
      if (controller.signal.aborted || generation !== state.generation || key !== signature(state) || !current(state)) return;
      var result = await request(state, {action: 'preview', csrf: state.csrf, ids: selected, operation: update}, controller.signal);
      if (controller.signal.aborted || generation !== state.generation || key !== signature(state) || !current(state)) return;
      if (!result.summary || !Number.isSafeInteger(result.summary.changed) || result.summary.changed < 0 || result.summary.changed > selected.length ||
          !Array.isArray(result.changes) || result.changes.length > 100 || !Number.isSafeInteger(result.summary.selected) || result.summary.selected !== selected.length ||
          (result.summary.changed && (typeof result.token !== 'string' || !result.token))) throw new Error('invalid_response');
      var expiration = result.summary.changed ? expires(result.expires_at) : Date.now() + 600000; if (expiration <= Date.now()) throw new Error('preview_expired');
      state.preview = result; state.previewKey = key; state.expires = expiration; state.apply.disabled = result.summary.changed === 0;
      state.show.checked = false; render(state);
      status(state, result.summary.changed ? 'Revise os valores abaixo e clique em Aplicar alterações revisadas.' : 'Nenhuma alteração aplicável. Os canais permanecem iguais.');
      if (result.summary.changed) state.expiryTimer = window.setTimeout(function () {if (state.preview === result) {invalidate(state); status(state, errorText(new Error('preview_expired')), true);}}, Math.min(2147483647, expiration - Date.now()));
    } catch (error) {
      if (generation !== state.generation || !current(state) || controller.signal.aborted) return;
      invalidate(state); status(state, errorText(error), true);
    } finally {
      if (state.request === controller) {state.request = null; state.previewButton.disabled = false; state.cancel.hidden = true;}
    }
  }
  async function apply(state) {
    if (state.applying || !state.preview || state.apply.disabled) return;
    if (state.previewKey !== signature(state)) {invalidate(state); status(state, errorText(new Error('preview_changed')), true); return;}
    if (Date.now() >= state.expires) {invalidate(state); status(state, errorText(new Error('preview_expired')), true); return;}
    var token = state.preview.token, controller = new AbortController();
    state.applying = true; state.stopRequested = false; state.request = controller; state.fields.disabled = true; state.apply.disabled = true; state.previewButton.disabled = true;
    state.stopApply.hidden = false; state.stopApply.disabled = false;
    window.clearTimeout(state.expiryTimer); status(state, 'Aplicando exatamente as alterações revisadas…');
    try {
      while (true) {
        if (!current(state)) return;
        if (state.previewKey !== signature(state)) {state.stopRequested = true; break;}
        var result = await request(state, {action: 'apply', csrf: state.csrf, token: token, cursor: state.cursor}, controller.signal);
        if (!current(state)) return;
        if (!Number.isSafeInteger(result.applied) || result.applied < state.applied || !Number.isSafeInteger(result.total) || result.total !== state.preview.summary.changed ||
            result.applied > result.total || typeof result.done !== 'boolean' || (!result.done && (!Number.isSafeInteger(result.next_cursor) || result.next_cursor <= state.cursor))) throw new Error('invalid_response');
        state.applied = result.applied; state.cursor = result.next_cursor;
        status(state, state.applied + ' de ' + result.total + ' canais atualizados…');
        if (result.done) {
          state.preview = null; state.result.hidden = true; state.changes.replaceChildren();
          status(state, result.applied + ' canais atualizados. Salvo. O painel atualizará os canais automaticamente nos próximos minutos.');
          var table = document.getElementById('datatable-mass'), jq = window.jQuery;
          if (table && jq && jq.fn && jq.fn.dataTable && jq.fn.dataTable.isDataTable(table)) jq(table).DataTable().ajax.reload(null, false);
          break;
        }
        if (state.stopRequested) break;
      }
      if (state.preview) status(state, state.applied + ' canais atualizados. Aplicação interrompida após o lote atual. Retome para continuar a mesma prévia.');
    } catch (error) {
      if (current(state)) {
        if (error.message === 'conflict' || error.message === 'permission' || error.message === 'preview_expired' || error.message === 'request_limit' || error.status === 422) {
          if (Number.isSafeInteger(error.applied)) state.applied = error.applied;
          state.preview = null; state.result.hidden = true; state.changes.replaceChildren();
          status(state, state.applied + ' canais já atualizados. ' + errorText(error), true);
        } else status(state, state.applied + ' canais confirmados. A conexão foi interrompida. Retome a mesma prévia para confirmar e continuar sem repetir alterações.', true);
      }
    } finally {
      state.applying = false; state.request = null; state.stopApply.hidden = true; state.fields.disabled = false; state.previewButton.disabled = false;
      state.apply.disabled = !state.preview || state.previewKey !== signature(state) || Date.now() >= state.expires;
      state.apply.textContent = state.preview ? 'Retomar aplicação revisada' : 'Aplicar alterações revisadas';
      if (state.preview && state.previewKey !== signature(state)) {state.preview = null; state.apply.disabled = true; state.result.hidden = true; status(state, state.applied + ' canais atualizados. A seleção mudou; gere outra prévia para continuar.');}
    }
  }
  function views(state) {
    var c = state.controls, importing = c.mode.value === 'm3u';
    state.replaceFields.hidden = importing; state.importFields.hidden = !importing;
    state.fileField.hidden = c.inputMode.value !== 'file'; state.urlField.hidden = c.inputMode.value !== 'url';
    state.logoReplaceFields.hidden = c.logoMode.value === 'set'; state.logoSetField.hidden = c.logoMode.value !== 'set';
    state.sourceFields.disabled = !c.source.checked; state.logoFields.disabled = !c.logo.checked;
  }
  function mount(target) {
    var box = element('section', 'naxx-stream-link-edit'); box.setAttribute('aria-label', 'Links e logos');
    box.appendChild(element('h3', '', 'Links e logos'));
    box.appendChild(element('p', 'naxx-stream-link-edit__notice', 'Atualize as fontes e os logos apenas dos canais selecionados. Confira a prévia antes de aplicar.'));
    var count = element('p', 'naxx-stream-link-edit__count'); box.appendChild(count);
    var fields = element('fieldset', 'naxx-stream-link-edit__fields'); box.appendChild(fields);
    var modeLabel = element('label', 'naxx-stream-link-edit__field'), mode = element('select', 'form-control'); mode.dataset.naxxLink = 'mode';
    modeLabel.appendChild(element('span', '', 'Como atualizar')); modeLabel.appendChild(mode); fields.appendChild(modeLabel);
    option(mode, 'replace', 'Localizar e substituir'); option(mode, 'm3u', 'Atualizar usando lista M3U');
    var replaceFields = element('div', 'naxx-stream-link-edit__replace'); fields.appendChild(replaceFields);
    var source = checkbox(replaceFields, 'source', 'Substituir texto nos links das fontes', true);
    var sourceFields = element('fieldset', 'naxx-stream-link-edit__pair'); replaceFields.appendChild(sourceFields);
    var sourceFind = field(sourceFields, 'source-find', 'Localizar nos links'), sourceReplace = field(sourceFields, 'source-replace', 'Substituir por');
    sourceFind.placeholder = 'Ex.: dominio-antigo.com'; sourceReplace.placeholder = 'Ex.: dominio-novo.com';
    replaceFields.appendChild(element('p', 'text-muted', 'Substituição literal de todas as ocorrências, com diferença entre maiúsculas e minúsculas. Os demais trechos da fonte são mantidos.'));
    var logo = checkbox(replaceFields, 'logo', 'Atualizar os logos', false), logoFields = element('fieldset'); replaceFields.appendChild(logoFields);
    var logoMode = element('select', 'form-control'); logoMode.dataset.naxxLink = 'logo-mode'; logoMode.setAttribute('aria-label', 'Como atualizar os logos');
    option(logoMode, 'replace', 'Localizar e substituir nos logos'); option(logoMode, 'set', 'Definir o mesmo logo para todos'); logoFields.appendChild(logoMode);
    var logoReplaceFields = element('div', 'naxx-stream-link-edit__pair'); logoFields.appendChild(logoReplaceFields);
    var logoFind = field(logoReplaceFields, 'logo-find', 'Localizar nos logos'), logoReplace = field(logoReplaceFields, 'logo-replace', 'Substituir por');
    var logoSetField = element('div'); logoFields.appendChild(logoSetField); var logoURL = field(logoSetField, 'logo-url', 'URL do logo', 'url');
    var importFields = element('div', 'naxx-stream-link-edit__import'); fields.appendChild(importFields);
    importFields.appendChild(element('p', '', 'A lista usa o nome completo de cada canal. Acentos e indicações como HD, SD e FHD precisam coincidir; nomes repetidos ou não encontrados ficam para revisão.'));
    var inputMode = element('select', 'form-control'); inputMode.dataset.naxxLink = 'input-mode'; inputMode.setAttribute('aria-label', 'Origem da lista M3U');
    option(inputMode, 'file', 'Arquivo M3U'); option(inputMode, 'url', 'URL da lista M3U'); importFields.appendChild(inputMode);
    var fileField = element('div'), urlField = element('div'); importFields.appendChild(fileField); importFields.appendChild(urlField);
    var file = field(fileField, 'file', 'Arquivo M3U / M3U8', 'file'); file.accept = '.m3u,.m3u8,audio/x-mpegurl,application/vnd.apple.mpegurl';
    var address = field(urlField, 'url', 'URL da lista M3U', 'url'); address.placeholder = 'https://provedor.exemplo/lista.m3u';
    var importSource = checkbox(importFields, 'import-source', 'Atualizar a primeira fonte e manter as fontes alternativas', true);
    var importLogo = checkbox(importFields, 'import-logo', 'Usar tvg-logo quando presente na lista', true);
    importFields.appendChild(element('p', 'text-muted', 'Nenhum canal novo será criado. A lista substitui a primeira fonte dos nomes únicos correspondentes; fontes alternativas e logos ausentes são mantidos.'));
    var actions = element('div', 'naxx-stream-link-edit__actions'); box.appendChild(actions);
    var previewButton = button(actions, 'preview', 'Gerar prévia', true), cancel = button(actions, 'cancel', 'Cancelar análise'); cancel.hidden = true;
    var message = element('p', 'naxx-stream-link-edit__status'); message.setAttribute('role', 'status'); message.setAttribute('aria-live', 'polite'); box.appendChild(message);
    var result = element('div', 'naxx-stream-link-edit__preview'); result.hidden = true; box.appendChild(result);
    var summary = element('p', 'naxx-stream-link-edit__summary'); result.appendChild(summary);
    var show = checkbox(result, 'show', 'Mostrar links completos nesta tela', false);
    var sample = element('p', 'text-muted'); result.appendChild(sample);
    var scroll = element('div', 'naxx-stream-link-edit__table'); result.appendChild(scroll);
    var table = element('table', 'table table-sm'), head = element('thead'), header = element('tr');
    ['Canal', 'Antes', 'Depois'].forEach(function (text) {header.appendChild(element('th', '', text));}); head.appendChild(header); table.appendChild(head);
    var changes = element('tbody'); table.appendChild(changes); scroll.appendChild(table);
    var issueBox = element('details', 'naxx-stream-link-edit__issues'); result.appendChild(issueBox);
    issueBox.appendChild(element('summary', '', 'Revisar não alterados')); var issueNote = element('p', 'text-muted'), issues = element('ul'); issueBox.appendChild(issueNote); issueBox.appendChild(issues);
    var applyButton = button(result, 'apply', 'Aplicar alterações revisadas', true); applyButton.disabled = true;
    var stopApply = button(result, 'stop-apply', 'Parar após o lote atual'); stopApply.hidden = true;
    var state = {target: target, box: box, count: count, fields: fields, status: message, previewButton: previewButton, cancel: cancel, apply: applyButton,
      result: result, summary: summary, sample: sample, changes: changes, show: show, generation: 0, request: null, preview: null, csrf: '', applying: false, requestBytes: 8388608,
      stopApply: stopApply, cursor: 0, applied: 0, issues: issues, issueBox: issueBox, issueNote: issueNote,
      replaceFields: replaceFields, importFields: importFields, fileField: fileField, urlField: urlField, logoReplaceFields: logoReplaceFields, logoSetField: logoSetField,
      sourceFields: sourceFields, logoFields: logoFields, controls: {mode: mode, source: source, sourceFind: sourceFind, sourceReplace: sourceReplace,
        logo: logo, logoMode: logoMode, logoFind: logoFind, logoReplace: logoReplace, logoURL: logoURL, inputMode: inputMode, file: file, url: address, importSource: importSource, importLogo: importLogo}};
    active = state; target.prepend(box); views(state);
    fields.addEventListener('input', function () {if (!state.applying) invalidate(state, 'Campos alterados. Gere a prévia para revisar.');});
    fields.addEventListener('change', function () {views(state); if (!state.applying) invalidate(state, 'Campos alterados. Gere a prévia para revisar.');});
    box.addEventListener('keydown', function (event) {if (event.key === 'Enter' && event.target.tagName === 'INPUT' && event.target.type !== 'checkbox' && event.target.type !== 'file') event.preventDefault();});
    previewButton.addEventListener('click', function () {preview(state);}); applyButton.addEventListener('click', function () {apply(state);});
    cancel.addEventListener('click', function () {invalidate(state, 'Análise cancelada. Os canais permanecem iguais.');});
    stopApply.addEventListener('click', function () {state.stopRequested = true; stopApply.disabled = true; status(state, 'Aguardando concluir o lote atual para interromper…');});
    show.addEventListener('change', function () {render(state);});
    state.selection = selectionKey();
    function sync() {
      if (!current(state)) {enhance(); return;}
      var next = selectionKey();
      if (next !== state.selection) {state.selection = next; if (state.applying) state.stopRequested = true; else invalidate(state, 'Seleção alterada. Gere uma nova prévia.');}
      var text = (Array.isArray(window.rSelected) ? new Set(window.rSelected.map(String)).size : 0).toLocaleString('pt-BR') + ' canais selecionados';
      if (count.textContent !== text) count.textContent = text;
    }
    state.timer = window.setInterval(sync, 250); sync();
  }
  function destroy(state) {
    state.generation++; if (state.request && !state.applying) state.request.abort();
    window.clearInterval(state.timer); window.clearTimeout(state.expiryTimer); state.preview = null; state.box.remove();
  }
  function enhance() {
    var target = /\/stream_mass(?:\.php)?$/.test(window.location.pathname) ? document.getElementById('stream-details') : null;
    if (target && !target.closest('form')) target = null;
    if (active && (active.target !== target || !active.box.isConnected)) {destroy(active); active = null;}
    if (target && !active && Array.isArray(window.rSelected)) mount(target);
  }
  function watch() {
    enhance();
    if (!observer && document.body) {
      observer = new MutationObserver(function (changes) {
        if (scheduled || !changes.some(function (change) {return Array.from(change.addedNodes).concat(Array.from(change.removedNodes)).some(function (node) {
          return node.nodeType === 1 && (!active || !active.box.contains(node));
        });})) return;
        scheduled = true; window.setTimeout(function () {scheduled = false; enhance();}, 0);
      });
      observer.observe(document.body, {childList: true, subtree: true});
    }
  }
  window.NaxxStreamLinkEdit = {enhance: enhance};
  window.addEventListener('popstate', enhance);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', watch, {once: true}); else watch();
}());
