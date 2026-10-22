/* Importador local de catálogo. Não envia arquivos nem acessa URLs das fontes. */
(function (global) {
  'use strict';
  function normalize(value) { return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase(); }
  function inferType(name, group, url, requested) {
    var type = normalize(requested);
    if (/^(channel|canal|canais|live|stream)$/.test(type)) return 'channel';
    if (/^(movie|filme|filmes|vod)$/.test(type)) return 'movie';
    if (/^(series|serie|episode|episodio)$/.test(type)) return 'series';
    var description = normalize(name + ' ' + group);
    if (/\bs\d{1,3}\s*e\d{1,4}\b|\b\d{1,3}x\d{1,4}\b|\bseries?\b|\btemporada\b/.test(description)) return 'series';
    if (/\bfilmes?\b|\bmovies?\b|\bvod\b/.test(description) || /\.(mp4|mkv|avi|mov|m4v)(?:[?#]|$)/i.test(url)) return 'movie';
    return 'channel';
  }
  function sourceURL(value) {
    try {
      var url = new URL(String(value || '').trim());
      if (!/^(https?|rtmp|rtmps|rtsp):$/.test(url.protocol) || !url.hostname) return null;
      return url.href;
    } catch (_) { return null; }
  }
  function episodeInfo(name) {
    var match = String(name).match(/\bS(\d{1,3})\s*E(\d{1,4})\b/i) || String(name).match(/\b(\d{1,3})x(\d{1,4})\b/i);
    return match ? {seriesName: name.slice(0, match.index).replace(/[\s.\-_]+$/, '').trim(), season:Number(match[1]), episode:Number(match[2])} : {};
  }
  function splitTitle(line) {
    var quoted = false;
    for (var i = 0; i < line.length; i++) {
      if (line[i] === '"' && line[i-1] !== '\\') quoted = !quoted;
      if (line[i] === ',' && !quoted) return [line.slice(0, i), line.slice(i+1).trim()];
    }
    return [line, ''];
  }
  function createM3UReader(add) {
    var info = null, group = '', lineNumber = 0;
    return function (raw) {
      lineNumber++;
      var line = raw.trim();
      if (!line) return;
      if (/^#EXTINF:/i.test(line)) {
        var parts = splitTitle(line), attrs = {};
        parts[0].replace(/([\w-]+)\s*=\s*"([^"\r\n]*)"/g, function (_, key, value) { attrs[key.toLowerCase()] = value; return _; });
        info = {name:parts[1] || attrs['tvg-name'] || '', category:attrs['group-title'] || '', logo:attrs['tvg-logo'] || '', tvgId:attrs['tvg-id'] || '', line:lineNumber};
        group = '';
      } else if (/^#EXTGRP:/i.test(line)) group = line.slice(8).trim();
      else if (line[0] !== '#') {
        add(Object.assign({name:'', category:'', line:lineNumber}, info || {}, {url:line, category:(info && info.category) || group}));
        info = null; group = '';
      }
    };
  }
  function parseM3U(text) {
    var records = [], readLine = createM3UReader(function (record) {records.push(record);});
    text.replace(/^\uFEFF/, '').split(/\r?\n/).forEach(readLine);
    return records;
  }
  function parseCSV(text) {
    var rows = [], row = [], cell = '', quoted = false;
    var first = text.split(/\r?\n/, 1)[0];
    var delimiter = first.indexOf(';') >= 0 && first.indexOf(',') < 0 ? ';' : ',';
    for (var i = 0; i < text.length; i++) {
      var char = text[i];
      if (char === '"') {
        if (quoted && text[i+1] === '"') {cell += '"'; i++;}
        else quoted = !quoted;
      } else if (char === delimiter && !quoted) {row.push(cell.trim()); cell = '';}
      else if ((char === '\n' || char === '\r') && !quoted) {
        if (char === '\r' && text[i+1] === '\n') i++;
        row.push(cell.trim()); if (row.some(Boolean)) rows.push(row); row = []; cell = '';
      } else cell += char;
    }
    if (quoted) throw new Error('CSV inválido: há uma coluna com aspas não fechadas.');
    row.push(cell.trim()); if (row.some(Boolean)) rows.push(row);
    var headers = (rows.shift() || []).map(normalize);
    if (!headers.some(function (header) {return /^(url|source|fonte)$/.test(header);})) throw new Error('O CSV precisa das colunas name (ou nome) e url.');
    return rows.map(function (values, index) {
      var record = {line:index+2};
      headers.forEach(function (header, position) {record[header] = values[position] || '';});
      return record;
    });
  }
  function createSession(options) {
    options = options || {};
    var existing = new Set((options.existing || []).map(function (item) {return sourceURL(item.url);}));
    var seen = new Set(), items = [], issues = [], duplicates = 0, total = 0;
    function add(record) {
      var index = total++;
      if (!record || typeof record !== 'object') {issues.push({line:index+1, reason:'Item inválido.'}); return;}
      var name = String(record.name || record.nome || record.title || '').trim();
      var url = sourceURL(record.url || record.source || record.fonte);
      if (!name || !url) {issues.push({line:record.line || index+1, reason:!name ? 'Nome ausente.' : 'URL inválida ou protocolo não permitido.'}); return;}
      if (seen.has(url) || existing.has(url)) {duplicates++; return;}
      seen.add(url);
      var category = String(options.category || record.category || record.categoria || record.group || '').trim();
      var type = inferType(name, category, url, options.type || record.type || record.tipo);
      // Preserve a imagem original; SVG/WebP e URLs sem extensão são lidos pelo navegador.
      var logo = sourceURL(record.logo || record['tvg-logo'] || record.stream_icon || record.cover || record.movie_image);
      items.push(Object.assign({id:'import-' + index, name:name.slice(0,300), url:url, category:category.slice(0,200) || 'Sem categoria', type:type, tvgId:String(record.tvgId || record['tvg-id'] || '').slice(0,200), logo:logo && /^https?:/.test(logo) ? logo : ''}, type === 'series' ? episodeInfo(name) : {}));
    }
    function finish() {
      if (!total) throw new Error('Nenhum item encontrado. Verifique se o arquivo contém nomes e URLs.');
      return {items:items, issues:issues, duplicates:duplicates, total:total};
    }
    return {add:add, finish:finish};
  }
  function parse(text, filename, options) {
    text = String(text).replace(/^\uFEFF/, '');
    var raw;
    if (/\.json$/i.test(filename) || /^[\[{]/.test(text.trim())) {
      var json = JSON.parse(text);
      raw = Array.isArray(json) ? json : json.items;
      if (!Array.isArray(raw)) throw new Error('O JSON precisa ser uma lista de itens ou um objeto com a propriedade items.');
    } else if (/\.csv$/i.test(filename)) raw = parseCSV(text);
    else raw = parseM3U(text);
    var session = createSession(options);
    raw.forEach(session.add);
    return session.finish();
  }
  function cleanAttribute(value) {return String(value || '').replace(/["\r\n]/g, ' ').trim();}
  function toM3U(items) {
    return '#EXTM3U\n' + items.map(function (item) {
      return '#EXTINF:-1 tvg-id="' + cleanAttribute(item.tvgId) + '" tvg-logo="' + cleanAttribute(item.logo) + '" group-title="' + cleanAttribute(item.category) + '",' + cleanAttribute(item.name) + '\n' + item.url;
    }).join('\n') + '\n';
  }
  global.NaxxImporter = {parse:parse, createSession:createSession, createM3UReader:createM3UReader, toM3U:toM3U, sourceURL:sourceURL, inferType:inferType};
}(typeof window !== 'undefined' ? window : globalThis));
