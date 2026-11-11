/* Acrescenta tamanhos à lista de Canais e mantém os dois controles nativos sincronizados. */
(function () {
  'use strict';
  var tableId = 'datatable-streampage';
  var sizes = [['2000', '2.000'], ['5000', '5.000']];
  var bound = false;

  function controls() {
    // Filmes e séries reutilizam o ID da tabela, mas têm controles próprios.
    if (!/\/streams(?:\.php)?$/.test(window.location.pathname)) return null;
    var table = document.getElementById(tableId);
    var main = document.getElementById('stream_show_entries');
    if (!table || !main) return null;
    return {
      table: table,
      main: main,
      generated: document.querySelector('select[name="datatable-streampage_length"][aria-controls="datatable-streampage"]')
    };
  }

  function hasOption(select, value) {
    return Array.prototype.some.call(select.options, function (option) { return option.value === value; });
  }

  function extendOptions(select) {
    if (!select) return;
    sizes.forEach(function (size) {
      if (hasOption(select, size[0])) return;
      var option = document.createElement('option');
      option.value = size[0];
      option.textContent = size[1];
      select.appendChild(option);
    });
  }

  function setValue(select, value, jq) {
    if (!select || select.value === value || !hasOption(select, value)) return false;
    select.value = value;
    // Atualiza só a apresentação do Select2. O change nativo desenharia a tabela novamente.
    if (select.classList.contains('select2-hidden-accessible')) jq(select).trigger('change.select2');
    return true;
  }

  function synchronize(current, length, jq) {
    if (window.rClearing) return false;
    var value = String(length);
    setValue(current.generated, value, jq);
    return setValue(current.main, value, jq);
  }

  function bind(jq) {
    if (bound) return;
    bound = true;
    jq(document).on('init.dt.naxxStreamPageSize', '#' + tableId, enhance);
    jq(document).on('length.dt.naxxStreamPageSize', '#' + tableId, function (_event, settings, length) {
      var current = controls();
      if (!current || settings.nTable !== current.table) return;
      extendOptions(current.main);
      extendOptions(current.generated);
      var changed = synchronize(current, length, jq);
      // Quando o menu do DataTables mudou o tamanho, guarda entries como o Select2 nativo faria.
      if (changed && typeof window.setParam === 'function' &&
          new URLSearchParams(window.location.search).get('entries') !== String(length)) {
        window.setParam('entries', String(length));
      }
    });
  }

  function enhance() {
    var current = controls();
    if (!current) return;
    extendOptions(current.main);
    extendOptions(current.generated);
    var jq = window.jQuery;
    if (!jq || !jq.fn || !jq.fn.dataTable) return;
    bind(jq);
    if (jq.fn.dataTable.isDataTable(current.table)) {
      synchronize(current, jq(current.table).DataTable().page.len(), jq);
    }
  }

  window.NaxxStreamPageSize = {enhance: enhance};
  enhance();
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', enhance, {once: true});
}());
