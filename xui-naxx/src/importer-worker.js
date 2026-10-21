/* Analisa listas fora da interface; M3U é lido por blocos sem copiar o arquivo inteiro. */
'use strict';
var nativeAssets = self.location.pathname.split('/').pop().indexOf('naxx-') === 0;
importScripts((nativeAssets ? 'naxx-' : '') + 'importer.js?v=1.5.14-4');

self.onmessage = async function (event) {
  var file = event.data && event.data.file;
  var options = event.data && event.data.options || {};
  var bytes = 0, total = file && file.size || 0, lastPercent = -5, lastProgress = 0;
  function progress(force) {
    var percent = total ? bytes / total * 100 : 0, now = Date.now();
    if (force || percent - lastPercent >= 5 || now - lastProgress >= 500) {
      self.postMessage({type:'progress', bytes:bytes, total:total});
      lastPercent = percent; lastProgress = now;
    }
  }
  try {
    if (!file || typeof file.name !== 'string') throw new Error('Selecione um arquivo para analisar.');
    progress(true);
    var result;
    if (/\.(csv|json)$/i.test(file.name)) {
      // O trabalho e a cópia destes formatos permanecem no worker.
      result = NaxxImporter.parse(await file.text(), file.name, options);
      bytes = total;
    } else {
      var session = NaxxImporter.createSession(options);
      var readLine = NaxxImporter.createM3UReader(session.add);
      var decoder = new TextDecoder('utf-8'), pending = '';
      function consume(chunk, final) {
        pending += decoder.decode(chunk, {stream:!final});
        var start = 0, newline;
        while ((newline = pending.indexOf('\n', start)) !== -1) {
          readLine(pending.slice(start, newline));
          start = newline + 1;
        }
        pending = pending.slice(start);
        if (final && pending.length) {readLine(pending); pending = '';}
      }
      if (typeof file.stream === 'function') {
        var reader = file.stream().getReader();
        try {
          while (true) {
            var chunk = await reader.read();
            if (chunk.done) break;
            bytes += chunk.value.byteLength;
            consume(chunk.value, false);
            progress(false);
          }
        } finally {reader.releaseLock();}
      } else {
        // Navegadores anteriores a File.stream também leem em blocos.
        var blockSize = 256 * 1024;
        while (bytes < total) {
          var block = new Uint8Array(await file.slice(bytes, bytes + blockSize).arrayBuffer());
          bytes += block.byteLength;
          consume(block, false);
          progress(false);
        }
      }
      consume(undefined, true);
      result = session.finish();
    }
    progress(true);
    self.postMessage({type:'result', result:result});
  } catch (error) {
    self.postMessage({type:'error', message:error && error.message || 'Não foi possível analisar o arquivo.'});
  }
};
