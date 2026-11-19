/* Traduções contextuais do painel nativo. Nunca altera dados ou ações. */
(function (global) {
  'use strict';

  // Textos fixos verificados no cabeçalho e nos formulários do XUI.
  // Os seletores não incluem nomes de contas, canais, categorias ou provedores.
  var modalHeadings = {
    'Server Tools': 'Ferramentas do servidor',
    'Domain List': 'Lista de domínios',
    'XUI EPG Browser': 'Navegador de EPG do XUI',
    'Provider Streams': 'Canais do provedor',
    'Provider Movies': 'Filmes do provedor',
    'Use the EPG icon for this stream?': 'Usar o ícone da EPG neste canal?',
    'Add / Remove Credits': 'Adicionar ou remover créditos',
    'Clear Stream Logs': 'Limpar registros dos canais'
  };
  var modalControls = {
    'Credits': 'Créditos',
    'Adjust Credits': 'Ajustar créditos',
    'Use Icon': 'Usar ícone',
    'Record': 'Gravar',
    'Cancel': 'Cancelar',
    'Close': 'Fechar',
    'Clear Stream Logs': 'Limpar registros dos canais'
  };
  var formLabels = {
    'Series Name': 'Nome da série',
    'Poster URL': 'URL do pôster',
    'Backdrop URL': 'URL da imagem de fundo',
    'Plot': 'Sinopse',
    'Cast': 'Elenco',
    'Director': 'Diretor',
    'Genres': 'Gêneros',
    'Release Date': 'Data de lançamento',
    'First Aired': 'Estreia',
    'Runtime': 'Duração',
    'Youtube Trailer': 'Trailer do YouTube',
    'Rating': 'Classificação',
    'Timezone': 'Fuso horário',
    'Disable TMDb': 'Desativar TMDb',
    'Ignore No Match': 'Ignorar itens sem correspondência',
    'Show Potential Duplicates': 'Mostrar possíveis duplicados',
    'Keep Logs For': 'Manter registros por'
  };
  var columns = {
    'Credits': 'Créditos',
    'Server Name': 'Nome do servidor',
    'Stream Name': 'Nome do canal',
    'Stream Info': 'Informações do canal',
    'Provider Streams': 'Canais do provedor',
    'Provider Movies': 'Filmes do provedor'
  };
  var navigation = {
    'Server Tools': 'Ferramentas do servidor',
    'Clear Stream Logs': 'Limpar registros dos canais',
    'Provider Streams': 'Canais do provedor',
    'Provider Movies': 'Filmes do provedor'
  };
  var accountColumns = {
    'USERNAME': 'Usuário', 'Username': 'Usuário',
    'PASSWORD': 'Senha', 'Password': 'Senha',
    'OWNER': 'Responsável', 'Owner': 'Responsável',
    'TRIAL': 'Teste', 'Trial': 'Teste',
    'ACTIVE': 'Em uso', 'Active': 'Em uso',
    'EXPIRATION': 'Vencimento', 'Expiration': 'Vencimento',
    'LAST CONNECTION': 'Última conexão', 'Last Connection': 'Última conexão'
  };
  var accountControls = {
    'Add Line': 'Adicionar conta', 'Filter Results': 'Filtrar resultados',
    'Show': 'Exibir', 'No Filter': 'Sem filtro',
    'Search for an owner...': 'Pesquisar responsável…'
  };
  var dialogButtons = {
    'Confirm': 'Confirmar', 'Cancel': 'Cancelar', 'Delete': 'Excluir',
    'Kill': 'Encerrar', 'Clear': 'Limpar', 'Close': 'Fechar'
  };
  // Somente mensagens estáticas emitidas pelos scripts nativos. Não há
  // substituição parcial: um texto que contenha nomes ou valores é preservado.
  var messages = {
    'All connections for this line have been killed.': 'Todas as conexões desta conta foram encerradas.',
    'An error occured while mapping streams.': 'Ocorreu um erro ao mapear os canais.',
    'An error occured while processing your request.': 'Ocorreu um erro ao processar sua solicitação.',
    'An invalid directory was entered, please use another.': 'A pasta informada é inválida. Escolha outra.',
    'Are you sure you want to clear the Redis database? This will drop all connections.': 'Deseja limpar o banco do Redis? Todas as conexões serão encerradas.',
    'Are you sure you want to delete these episodes?': 'Deseja excluir estes episódios?',
    'Are you sure you want to delete these movies?': 'Deseja excluir estes filmes?',
    'Are you sure you want to delete these streams?': 'Deseja excluir estes canais?',
    'Are you sure you want to delete this series and all episodes?': 'Deseja excluir esta série e todos os episódios?',
    'Are you sure you want to delete this stream?': 'Deseja excluir este canal?',
    'Are you sure you want to kill all connections for this line?': 'Deseja encerrar todas as conexões desta conta?',
    'Are you sure you want to kill all connections?': 'Deseja encerrar todas as conexões?',
    'Cache has been completely disabled!': 'O cache foi desativado por completo.',
    'Cache has been enabled!': 'O cache foi ativado.',
    'Connection has been killed.': 'A conexão foi encerrada.',
    'Connections have been killed.': 'As conexões foram encerradas.',
    'Could not process M3U file, please use another.': 'Não foi possível processar o arquivo M3U. Escolha outro.',
    'Credits could not be adjusted.': 'Não foi possível ajustar os créditos.',
    'Credits have been adjusted.': 'Os créditos foram ajustados.',
    'Enter a series name.': 'Informe o nome da série.',
    'Episodes have been deleted.': 'Os episódios foram excluídos.',
    'Episodes have been queued for re-encoding.': 'Os episódios foram adicionados à fila de recodificação.',
    'Episodes have started endoding.': 'A codificação dos episódios foi iniciada.',
    'Episodes have stopped encoding.': 'A codificação dos episódios foi interrompida.',
    'Fingerprint signal has been sent.': 'O sinal de identificação foi enviado.',
    'Generating CSV report...': 'Gerando relatório CSV…',
    'Handler has been completely disabled!': 'O gerenciador de conexões foi desativado por completo.',
    'Handler has been enabled!': 'O gerenciador de conexões foi ativado.',
    'Individual actions disabled in multi-select mode.': 'As ações individuais estão desativadas enquanto há vários itens selecionados.',
    'Item has been saved.': 'O item foi salvo.',
    'Line has been banned.': 'A conta foi bloqueada.',
    'Line has been disabled.': 'A conta foi desativada.',
    'Line has been enabled.': 'A conta foi ativada.',
    'Line has been unbanned.': 'A conta foi desbloqueada.',
    'Movies have been deleted.': 'Os filmes foram excluídos.',
    'Movies have been queued for re-encoding.': 'Os filmes foram adicionados à fila de recodificação.',
    'Movies have started endoding.': 'A codificação dos filmes foi iniciada.',
    'Movies have stopped encoding.': 'A codificação dos filmes foi interrompida.',
    'No new episodes could be found in the playlist or folder.': 'Nenhum episódio novo foi encontrado na lista ou na pasta.',
    'Please ensure the source is a local file before symlinking.': 'Para criar um link simbólico, a fonte precisa ser um arquivo local.',
    'Please ensure you enter both a title and message.': 'Informe o título e a mensagem.',
    'Please enter a description.': 'Informe uma descrição.',
    'Please enter a title for the recorded event.': 'Informe um título para a gravação.',
    'Please enter a valid IP address / CIDR.': 'Informe um endereço IP ou bloco CIDR válido.',
    'Please enter a valid MAC address.': 'Informe um endereço MAC válido.',
    'Please enter a valid date.': 'Informe uma data válida.',
    'Please enter a valid email address.': 'Informe um endereço de e-mail válido.',
    'Please enter an access code.': 'Informe um código de acesso.',
    'Please generate a key.': 'Gere uma chave.',
    'Please select a M3U file to upload.': 'Selecione um arquivo M3U para enviar.',
    'Please select a destination server to record the event to.': 'Selecione o servidor de destino da gravação.',
    'Please select a member group.': 'Selecione um grupo de usuários.',
    'Please select a playlist to upload & review.': 'Selecione uma lista para enviar e revisar.',
    'Please select a source server to record the event from.': 'Selecione o servidor de origem da gravação.',
    'Please select at least one source for your channel.': 'Selecione ao menos uma fonte para o canal.',
    'Please select at least one source for your movie.': 'Selecione ao menos uma fonte para o filme.',
    'Please select at least one source for your station.': 'Selecione ao menos uma fonte para a estação.',
    'Please select at least one source for your stream.': 'Selecione ao menos uma fonte para o canal.',
    'Please select both a source and destination.': 'Selecione a origem e o destino.',
    'Quick tool was successfully executed.': 'A ferramenta rápida foi executada.',
    'Redis database has been cleared!': 'O banco do Redis foi limpo.',
    'Regenerating cache in the background...': 'Recriando o cache em segundo plano…',
    'Required entry fields have not been populated. Please check the form.': 'Preencha os campos obrigatórios e confira o formulário.',
    'Select at least one stream to edit.': 'Selecione ao menos um canal para editar.',
    'Series successfully deleted.': 'A série foi excluída.',
    'Sorry, this code is reserved for system functions.': 'Este código é reservado para funções do sistema.',
    'Stream icon has been set.': 'O ícone do canal foi definido.',
    'Stream map complete. Please select relevant streams from the table.': 'O mapeamento foi concluído. Selecione os canais desejados na tabela.',
    'Stream map has started, this can take a while depending on how many streams are present.': 'O mapeamento foi iniciado. O tempo necessário depende da quantidade de canais.',
    "Stream mapping didn't return any information.": 'O mapeamento não retornou informações.',
    'Stream monitor logs have been cleared.': 'Os registros de monitoramento dos canais foram limpos.',
    'Stream successfully deleted.': 'O canal foi excluído.',
    'Stream successfully restarted.': 'O canal foi reiniciado.',
    'Stream successfully started.': 'O canal foi iniciado.',
    'Stream successfully stopped.': 'O canal foi interrompido.',
    'Streams have been deleted.': 'Os canais foram excluídos.',
    'Streams have been restarted.': 'Os canais foram reiniciados.',
    'Streams have been started.': 'Os canais foram iniciados.',
    'Streams have been stopped.': 'Os canais foram interrompidos.',
    'The MAC address you entered is already in use.': 'O endereço MAC informado já está em uso.',
    'The paired user does not exist! Please unlink it.': 'O usuário vinculado não existe. Remova o vínculo.',
    'The username you selected already exists. Please use another.': 'O nome de usuário informado já existe. Escolha outro.',
    'This HMAC Key already exists, please use another.': 'Esta chave HMAC já existe. Use outra.',
    'This IP address is already in the database. Please use another.': 'Este endereço IP já está cadastrado. Use outro.',
    'This ISP has already been blocked.': 'Este provedor de internet já está bloqueado.',
    'This access code already exists, please use another.': 'Este código de acesso já existe. Use outro.',
    'This directory is already being watched, please use another.': 'Esta pasta já está sendo monitorada. Escolha outra.',
    'This group name is already in use. Please use another.': 'Este nome de grupo já está em uso. Escolha outro.',
    'This library is already being synced, please use another.': 'Esta biblioteca já está sendo sincronizada. Escolha outra.',
    'This movie already exists in your database. Please use another name.': 'Este filme já está cadastrado. Use outro nome.',
    'This package name is already in use. Please use another.': 'Este nome de pacote já está em uso. Escolha outro.',
    'This provider is already being tracked on the system.': 'Este provedor já está sendo acompanhado pelo sistema.',
    'This series already exists in your database.': 'Esta série já está cadastrada.',
    'This station source is already in your database. Please use another URL.': 'Esta fonte de estação já está cadastrada. Use outra URL.',
    'This stream source is already in your database. Please use another URL.': 'Esta fonte de canal já está cadastrada. Use outra URL.',
    'User has been disabled.': 'O usuário foi desativado.',
    'User has been enabled.': 'O usuário foi ativado.',
    'You already have an empty row.': 'Já existe uma linha vazia.',
    'Your access code needs to be at least 8 characters long.': 'O código de acesso precisa ter pelo menos 8 caracteres.',
    'Your report has been submitted.': 'O relatório foi enviado.'
  };
  var headingSelector = '#restartServicesLabel,#epgBrowserLabel,#providerStreamsLabel,#providerMoviesLabel,#epgPiconLabel,#failuresLabel,.bs-domains #modalLabel,.creditsModal h4';
  var controlSelector = '.creditsModal label,.creditsModal button,.bs-picon-modal-center button,#programmeRecord,.bs-failures-modal-center button';
  var fieldSelector = ['title', 'cover', 'backdrop_path', 'plot', 'cast', 'director', 'genre', 'release_date', 'episode_run_time', 'youtube_trailer', 'rating', 'timezone', 'disable_tmdb', 'ignore_no_match', 'show_duplicates', 'keep_logs'].map(function (id) { return 'label[for="' + id + '"]'; }).join(',');
  var protectedSelector = '.nav-user,.pro-user-name,tbody,input,textarea,select,option,[contenteditable="true"],script,style';

  function within(root, selector) {
    var elements = [];
    if (root.nodeType === 1 && root.matches(selector)) elements.push(root);
    return elements.concat(Array.from(root.querySelectorAll(selector)));
  }
  function lookup(dictionary, text) {
    var key = text.replace(/\s+/g, ' ').trim();
    return Object.prototype.hasOwnProperty.call(dictionary, key) ? dictionary[key] : null;
  }
  function translateNode(node, dictionary) {
    var text = node.nodeValue, translated = lookup(dictionary, text);
    if (translated) node.nodeValue = text.replace(/\S[\s\S]*\S|\S/, translated);
  }
  function translateElement(element, dictionary, descendants) {
    if (element.closest(protectedSelector)) return;
    Array.from(element.childNodes).forEach(function (node) {
      if (node.nodeType === 3) translateNode(node, dictionary);
      else if (descendants && node.nodeType === 1 && !node.matches('br,svg,i,.close-jq-toast-single') && !node.closest(protectedSelector)) translateElement(node, dictionary, true);
    });
  }
  function translateGroup(root, selector, dictionary, descendants) {
    within(root, selector).forEach(function (element) { translateElement(element, dictionary, descendants); });
  }
  function translateAccounts(root) {
    var document = root.ownerDocument || root;
    var table = document.getElementById('datatable-users');
    if (!table) return;
    translateGroup(root, '#datatable-users thead th', accountColumns, true);
    translateGroup(root, '.page-title-box button,#collapse_filters > label', accountControls, true);
    translateGroup(root, '#select2-user_filter-container,[id^="select2-user_filter-result-"]', accountControls, true);
    within(root, '#select2-user_reseller-container').forEach(function (container) {
      var ownerSelect = document.getElementById('user_reseller');
      if (container.querySelector('.select2-selection__placeholder') || (ownerSelect && ownerSelect.value === '')) translateElement(container, accountControls, true);
    });
    within(root, '#user_filter option').forEach(function (option) {
      Array.from(option.childNodes).forEach(function (node) { if (node.nodeType === 3) translateNode(node, accountControls); });
    });
    // Só a opção vazia é uma instrução do seletor de responsáveis. As demais
    // opções e os resultados da busca são nomes cadastrados pelo administrador.
    within(root, '#user_reseller option').forEach(function (option) {
      if (option.value === '') Array.from(option.childNodes).forEach(function (node) { if (node.nodeType === 3) translateNode(node, accountControls); });
    });
    // "Never" é um marcador nativo apenas na coluna de data da última conexão.
    // As outras células, inclusive usuários chamados "Never", são preservadas.
    var headers = Array.from(table.querySelectorAll('thead tr:last-child th'));
    var connectionIndex = headers.findIndex(function (header) { return /^(?:last connection|última conexão)$/i.test(header.textContent.trim()); });
    if (connectionIndex < 0) return;
    var rows = root === document || root === table || (root.nodeType === 1 && root.contains(table)) ? table.querySelectorAll('tbody tr') : within(root, '#datatable-users tbody tr');
    if (root.nodeType === 1 && root.closest('#datatable-users tbody tr')) rows = [root.closest('#datatable-users tbody tr')];
    Array.from(rows).forEach(function (row) {
      var cell = row.children[connectionIndex];
      if (!cell || cell.tagName !== 'TD' || cell.childElementCount || !cell.classList.contains('dt-center')) return;
      Array.from(cell.childNodes).forEach(function (node) { if (node.nodeType === 3) translateNode(node, {'Never': 'Nunca'}); });
    });
  }
  function enhance(root) {
    root = root || global.document;
    if (root.nodeType === 3) root = root.parentElement;
    if (!root || !root.querySelectorAll) return;
    translateGroup(root, headingSelector, modalHeadings, true);
    translateGroup(root, controlSelector, modalControls, true);
    translateGroup(root, fieldSelector, formLabels, false);
    translateGroup(root, 'table thead th', columns, true);
    translateGroup(root, '.navigation-menu a,.navigation-menu a > span,.page-title,.header-title', navigation, false);
    translateAccounts(root);
    translateGroup(root, '.jBox-Confirm .jBox-content,.jq-toast-single', messages, true);
    translateGroup(root, '.jBox-Confirm .jBox-title,.jBox-Confirm .jBox-button,.jBox-Confirm .jBox-Confirm-button', dialogButtons, true);
    // Atributos aqui pertencem somente aos controles conhecidos dos diálogos.
    within(root, controlSelector).forEach(function (element) {
      ['title', 'data-original-title', 'aria-label'].forEach(function (attribute) {
        var value = element.getAttribute(attribute);
        if (value) {
          var translated = lookup(modalControls, value);
          if (translated) element.setAttribute(attribute, translated);
        }
      });
    });
  }

  global.NaxxPanelTranslations = { enhance: enhance };
  if (global.document.readyState === 'loading') {
    global.document.addEventListener('DOMContentLoaded', function () { enhance(global.document); }, {once:true});
  } else enhance(global.document);
})(window);
