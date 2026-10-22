/* Melhorias progressivas: não altera contas, URLs, autenticação ou dados do XUI. */
(function () {
  'use strict';
  var overlayScript=document.currentScript;
  var overlayRevision=window.naxxAssetRevision||'/* NAXX_STYLESHEET_VERSION */';
  var overlayAssetBase=overlayScript&&overlayScript.src?new URL('../css/',overlayScript.src):new URL('assets/css/',location.href);
  function loadOverlayStyles(){
    var nativeStyle=document.querySelector('link[rel~="stylesheet"][href*="/app.css"],link[rel~="stylesheet"][href*="/app.dark.css"]');
    if(!nativeStyle)return;
    var light=!/\/app\.dark\.css(?:\?|$)/.test(nativeStyle.href);
    var href=new URL(light?'naxx-overlay.light.css':'naxx-overlay.css',overlayAssetBase);
    href.searchParams.set('v',overlayRevision);
    var link=document.querySelector('link[data-naxx-overlay]');
    if(!link){link=document.createElement('link');link.rel='stylesheet';link.dataset.naxxOverlay='';document.head.appendChild(link);}
    if(link.href!==href.href)link.href=href.href;
  }
  loadOverlayStyles();
  new MutationObserver(loadOverlayStyles).observe(document.head,{childList:true,subtree:true,attributes:true,attributeFilter:['href']});
  document.documentElement.lang = 'pt-BR';
  var viewport = document.querySelector('meta[name="viewport"]');
  if (!viewport) {
    viewport = document.createElement('meta');
    viewport.name = 'viewport';
    document.head.appendChild(viewport);
  }
  viewport.content = 'width=device-width, initial-scale=1, viewport-fit=cover';
  var jqTables=window.jQuery;
  if(jqTables&&jqTables.fn&&jqTables.fn.dataTable){
    jqTables.extend(true,jqTables.fn.dataTable.defaults,{language:{emptyTable:'Nenhum registro disponível.',info:'Mostrando _START_ a _END_ de _TOTAL_ registros',infoEmpty:'Nenhum registro disponível.',infoFiltered:'(filtrado de _MAX_ registros)',lengthMenu:'Mostrar _MENU_ registros',loadingRecords:'Carregando…',processing:'Processando…',search:'Pesquisar:',zeroRecords:'Nenhum resultado encontrado.',paginate:{first:'Primeira',last:'Última',next:'Próxima',previous:'Anterior'},aria:{sortAscending:': ordenar em ordem crescente',sortDescending:': ordenar em ordem decrescente'}}});
  }
  var translations = {'Dashboard':'Visão geral','All Servers':'Todos os servidores','Main Server':'Servidor principal','Online Connections':'Conexões ativas','Active Lines':'Contas ativas','Live Streams':'Canais ao vivo','Down Streams':'Canais indisponíveis','Network Output':'Saída de rede','Network Input':'Entrada de rede','Service Status':'Estado dos serviços','CPU & Memory':'CPU e memória','Network Traffic':'Tráfego de rede','Connections':'Conexões','Database Incomplete':'Atualização do banco pendente','Root Crons Missing':'Rotinas do servidor pendentes','Server Order':'Ordem dos servidores','Service Setup':'Configuração dos serviços','Access Control':'Controle de acesso','Stream Providers':'Provedores de conteúdo','Plex Sync':'Sincronização Plex','Access Codes':'Códigos de acesso','Blocked ASN\'s':'ASNs bloqueados','HMAC Keys':'Chaves HMAC','RTMP Monitor':'Monitor RTMP','Created Channels':'Canais criados','Stream Review':'Revisar transmissões','Recordings':'Gravações','TV Guide':'Guia de programação','Import Multiple':'Importar lista','Import & Review':'Importar e revisar','Import':'Importar','Review':'Revisar','Save':'Salvar','Add':'Adicionar','Light':'Claro','Dark':'Escuro','Default':'Padrão','Blue':'Azul','Light Blue':'Azul claro','Green':'Verde','Red':'Vermelho','Orange':'Laranja','Purple':'Roxo','Pink':'Rosa','Dark Grey':'Cinza escuro','Light Grey':'Cinza claro','Search...':'Pesquisar…','Search:':'Pesquisar:','Next':'Próximo','Previous':'Anterior','Data':'Dados','Advanced':'Opções avançadas','Servers':'Servidores','Source':'Fonte','Sources':'Fontes','Online':'Ativo','Offline':'Inativo','Transcoding Disabled':'Transcodificação desativada','Disabled':'Desativado'};
  function translate(element) {
    Array.from(element.childNodes).forEach(function(node){if(node.nodeType!==3)return;var key=node.textContent.trim(),value=translations[key],duration=key.match(/^(\d+) (Hours?|Days?)$/);if(!value&&duration)value=duration[1]+' '+(duration[2].startsWith('Hour')?(duration[1]==='1'?'hora':'horas'):(duration[1]==='1'?'dia':'dias'));if(value)node.textContent=node.textContent.replace(key,value);});
  }
  Object.assign(translations,{'Encoding Queue':'Fila de codificação','Login Logs':'Registros de acesso','On-Demand Scanner':'Verificador sob demanda','Panel Errors':'Erros do painel','Restream Detection':'Detecção de retransmissão','Stream Rank':'Classificação de canais','System Logs':'Registros do sistema','VOD Theft Detection':'Detecção de cópia de VOD','Stream Review':'Revisão de canais'});
  Object.assign(translations,{'No potential issues have been detected!':'Nenhum problema foi detectado.','Online Streams':'Canais ativos','EPG Files':'Guias de programação','Quick Tools':'Ferramentas rápidas','Quality':'Qualidade','Search Streams...':'Pesquisar canais…','All Categories':'Todas as categorias','All Statuses':'Todos os estados','No information available':'Nenhuma informação disponível'});
  Object.assign(translations,{'CPU Usage':'Uso de CPU','Memory Usage':'Uso de memória','IO Usage':'Uso de disco','Input':'Entrada','Output':'Saída','Unique Users':'Usuários únicos','Total Connections':'Total de conexões','Streams Live':'Canais ativos','Down':'Indisponíveis','Requests/sec':'Requisições/s','User Profile':'Meu perfil','General Settings':'Configurações gerais','Backup Settings':'Configurações de backup','Plex Settings':'Configurações Plex','Watch Settings':'Pastas monitoradas','License Info':'Informações da licença','Logout':'Sair'});
  Object.assign(translations,{'Cache & Redis Settings':'Configurações de cache e Redis','Good Performance':'Bom desempenho','Redis Connection Handler is disabled on your service, if you have a lot of throughput you will see better performance with Redis enabled.':'O Redis está desativado neste servidor. Ativá-lo pode melhorar o desempenho quando há muitas requisições.','If you maintain active connections of over 10,000 for example you should consider this. Below this amount you\'re unlikely to see any benefit.':'Considere ativar o Redis se mantiver mais de 10.000 conexões simultâneas. Abaixo disso, provavelmente não haverá ganho.','XUI Caching System':'Sistema de cache do XUI','Redis Connection Handler':'Gerenciador de conexões Redis','Cache Cron Execution':'Execução da rotina de cache','The default is to run the cron every 5 minutes, but when your Streams and Lines tables grow larger it can take a fair amount of time to grab and cache this data. You can change the time to achieve a better balance between performance and data accuracy.':'Por padrão, a rotina é executada a cada 5 minutos. Quando as tabelas de canais e contas crescem, buscar e armazenar esses dados pode levar mais tempo. Ajuste o intervalo para equilibrar desempenho e precisão.','Please ensure the cron format is correct, otherwise it won\'t run.':'Confira se o formato da rotina está correto; caso contrário, ela não será executada.','Minute':'Minuto','Hour':'Hora','Thread Count':'Quantidade de threads','Update Changes Only':'Atualizar somente alterações','Streams':'Canais','Lines':'Contas','Series':'Séries','Time Taken':'Tempo decorrido','Add EPG':'Adicionar EPG'});
  Object.assign(translations,{'Details':'Detalhes','Sources':'Fontes','Categories':'Categorias','Bouquets':'Listas de canais','Fallback Categories':'Categorias padrão','Fallback Bouquets':'Listas de canais padrão','New Categories:':'Novas categorias:','New Bouquets:':'Novas listas:','Transcoding':'Transcodificação','Options':'Opções','Add Stream':'Adicionar canal','Stream Name':'Nome do canal','Stream Logo':'Logo do canal','Notes':'Observações','Capture Server':'Servidor de captura','Video Input':'Entrada de vídeo','Audio Input':'Entrada de áudio','Generate PTS':'Gerar PTS','Native Frames':'Quadros nativos','Stream All Codecs':'Transmitir todos os codecs','Allow Recording':'Permitir gravação','Direct Source':'Fonte direta','Direct Stream':'Transmissão direta','Restart on FPS Drop':'Reiniciar ao cair o FPS','FPS Threshold %':'Limite de FPS (%)','Custom Channel SID':'SID personalizado do canal','On Demand Probesize':'Tamanho da análise sob demanda','Minute Delay':'Atraso (minutos)','User Agent':'Identificação do cliente','HTTP Proxy':'Proxy HTTP','Cookie':'Cookie HTTP','Headers':'Cabeçalhos','Transcoding Profile':'Perfil de transcodificação','Auto-Restart':'Reinício automático','Adaptive Link':'Link adaptável','Sync Title':'Sincronizar título','Map':'Mapeamento','RTMP Push':'Publicação RTMP','Search EPG':'Buscar EPG','Channel Name':'Nome do canal','EPG Source':'Fonte da EPG','No EPG':'Sem EPG','EPG Channel ID':'ID do canal na EPG','EPG Language':'Idioma da EPG','Minute Offset':'Deslocamento (minutos)','Output RTMP':'Saída RTMP','Server Tree':'Servidores de transmissão','On-Demand Servers':'Servidores sob demanda','Low Latency On-Demand':'Sob demanda com baixa latência','Timeshift Server':'Servidor de replay','Timeshift Days':'Dias de replay','Thumbnail Server':'Servidor de miniaturas','Start Stream Now':'Iniciar canal agora','Quick Search':'Busca rápida','XUI EPG':'EPG do XUI','XMLTV EPG':'EPG XMLTV','Advanced Options':'Opções avançadas','Choose...':'Escolha...','Search':'Pesquisar','M3U':'Lista M3U','Import Streams':'Importar canais','Add Single':'Adicionar canal','Manage Streams':'Gerenciar canais','Stream Info':'Informações do canal','Not scanned':'Ainda não analisado','On Demand':'Sob demanda','Direct':'Direto','Stream':'Canal'});
  var streamHelpTranslations = {
    gen_timestamps:'Permite que o FFmpeg gere os timestamps de apresentação para sincronizar áudio e vídeo. Em algumas fontes, isso pode causar dessincronização.',
    read_native:'Para canais ao vivo, mantenha a leitura de quadros nativos desativada. Ative para arquivos de vídeo estáticos quando a codificação exigir esse formato.',
    stream_all:'Transmite todos os codecs da fonte. Use quando a fonte tiver várias faixas de áudio, vídeo ou legendas.',
    direct_source:'Entrega a fonte diretamente ao usuário, sem retransmiti-la pelo XUI. O endereço de origem pode ficar visível para quem reproduzir o canal.',
    direct_proxy:'Com Fonte direta ativada, retransmite pelo servidor para ocultar o endereço original. Aceita MPEG-TS e HLS como entrada, mas a saída para clientes usa MPEG-TS. Recurso experimental.',
    fps_restart:'Reinicia o canal quando a taxa de quadros cair abaixo do limite definido.',
    fps_threshold:'O canal será reiniciado se a taxa de quadros ficar abaixo desta porcentagem da taxa original. O máximo é 100%.',
    custom_sid:'Informe o SID do canal para compatibilidade com EPG em dispositivos Enigma2. Use o código com dois-pontos inicial, sem o primeiro número.',
    probesize_ondemand:'Ajusta o tamanho da análise de fontes sob demanda. Aumente o valor se o canal iniciar sem áudio.',
    delay_minutes:'Atrasa a transmissão pelo número de minutos informado. Não funciona em canais sob demanda.',
    http_proxy:'Formato esperado: IP:porta.',
    cookie:'Informe os cookies HTTP da fonte no formato chave=valor;.',
    headers:'Cabeçalhos HTTP adicionais no formato aceito pelo FFmpeg.',
    transcode_profile_id:'Use transcodificação quando for necessário ampliar a compatibilidade com dispositivos. Ela só ocorre no servidor conectado diretamente à fonte.',
    adaptive_link:'Agrupa canais para que o cliente escolha uma fonte adequada à largura de banda ao solicitar HLS. A seleção não depende das listas do usuário; MPEG-TS reproduz o canal normalmente.',
    title_sync:'Sincroniza o título com um provedor de canais configurado no XUI. O título é atualizado pela rotina automática do painel.',
    rtmp_output:'Envia o canal ao servidor RTMP para distribuição a clientes RTMP.',
    llod:'A transmissão sob demanda de baixa latência reduz o atraso. As opções disponíveis variam conforme o protocolo de entrada; os modos avançados têm limitações de compatibilidade.'
  };
  var brandAssetVersion = '/* NAXX_BRAND_ASSET_VERSION */';
  var stylesheetVersion = '/* NAXX_STYLESHEET_VERSION */';
  /* NAXX_SETTINGS_TRANSLATIONS */
  var settingsHelpTranslations = {};
  /* NAXX_SETTINGS_HELP_TRANSLATIONS */
  translations['Importing Series using this method will parse your M3U or folder and push the individual episodes through Watch Folder. If you have category and bouquet allocation set up in Watch Folder Settings then they will be used here too.']='O painel processa a lista M3U ou a pasta e encaminha os episódios pela rotina de pastas monitoradas. As categorias e listas configuradas nessa rotina também serão usadas.';
  function translateSettingsHelp() {
    if (!/\/settings(?:\.php)?$/.test(location.pathname)) return;
    var jq = window.jQuery;
    document.querySelectorAll('label[for]').forEach(function (label) {
      var key = label.getAttribute('for');
      // O formulário original repete for="api_ips" no campo de senha.
      if (key === 'api_ips' && /^(Senha da API|API Password)$/.test(label.textContent.trim())) key = 'api_password';
      var help = settingsHelpTranslations[key];
      if (!help) return;
      label.querySelectorAll('.tooltip,.tooltip-left,.tooltip-right').forEach(function (icon) {
        icon.naxxSettingsHelp = help;
        ['title', 'data-original-title', 'data-content'].forEach(function (attribute) {
          if (icon.hasAttribute(attribute) && icon.getAttribute(attribute) !== help) icon.setAttribute(attribute, help);
        });
        // jBox retira title e mantém o conteúdo neste cache do jQuery.
        if (jq && jq(icon).data('jBox-getContent') !== help) jq(icon).data('jBox-getContent', help);
      });
    });
    Array.from(window.jBoxes || []).forEach(function (box) {
      if (!box || !box.wrapper || !box.options || box.options.getContent !== 'title' || typeof box.setContent !== 'function') return;
      var source = box.source && box.source[0];
      var help = source && source.naxxSettingsHelp;
      if (!help) {
        var attached = Array.from(box.attachedElements || []);
        var icon = attached.find(function (element) { return element.naxxSettingsHelp; });
        help = icon && icon.naxxSettingsHelp;
      }
      // Só reescreve uma instância criada quando o conteúdo realmente mudou.
      if (help && box.naxxSettingsHelp !== help) {
        box.naxxSettingsHelp = help;
        box.setContent(help);
      }
    });
  }
  function translateStreamHelp() {
    if (!/\/stream(?:\.php)?$/.test(location.pathname) || new URLSearchParams(location.search).has('import')) return;
    var jq = window.jQuery;
    document.querySelectorAll('label[for]').forEach(function (label) {
      var help = streamHelpTranslations[label.getAttribute('for')];
      if (!help) return;
      label.querySelectorAll('.tooltip,.tooltip-left,.tooltip-right').forEach(function (icon) {
        icon.naxxStreamHelp = help;
        ['title','data-original-title','data-content'].forEach(function (attribute) {
          if (icon.hasAttribute(attribute) && icon.getAttribute(attribute) !== help) icon.setAttribute(attribute, help);
        });
        if (jq && jq(icon).data('jBox-getContent') !== help) jq(icon).data('jBox-getContent', help);
      });
    });
    Array.from(window.jBoxes || []).forEach(function (box) {
      if (!box || !box.wrapper || !box.options || box.options.getContent !== 'title' || typeof box.setContent !== 'function') return;
      var source = box.source && box.source[0], help = source && source.naxxStreamHelp;
      if (!help) help = Array.from(box.attachedElements || []).map(function (element) { return element.naxxStreamHelp; }).find(Boolean);
      if (help && box.naxxStreamHelp !== help) { box.naxxStreamHelp = help; box.setContent(help); }
    });
  }
  function setBrandFavicon() {
    var icon = document.querySelector('link[rel~="icon"]');
    if (!icon) { icon = document.createElement('link'); icon.rel = 'icon'; document.head.appendChild(icon); }
    icon.type = 'image/svg+xml';
    var href = 'assets/images/naxx-favicon.svg?v=' + brandAssetVersion;
    if (icon.getAttribute('href') !== href) icon.href = href;
  }
  function versionBrandStylesheets() {
    if (!stylesheetVersion || stylesheetVersion.indexOf('/*') === 0) return;
    document.querySelectorAll('link[rel~="stylesheet"][href]').forEach(function (link) {
      try {
        var asset = new URL(link.href, location.href);
        if (!/\/assets\/css\/app(?:\.dark)?\.css$/.test(asset.pathname)) return;
        if (asset.searchParams.get('naxx') === stylesheetVersion) return;
        asset.searchParams.set('naxx', stylesheetVersion);
        link.href = asset.href;
      } catch (error) {}
    });
  }
  function replaceLegacyLogos() {
    document.querySelectorAll('img[src="assets/images/logo.png"],img[src$="/assets/images/logo.png"]').forEach(function (image) {
      var brand = image.parentElement;
      if (!brand) return;
      brand.classList.add('logo');
      brand.setAttribute('aria-label', 'XUI NAXX');
      image.remove();
    });
  }
  function modernImageURL(value) {
    if(!value)return '';
    try{
      var url=new URL(value,location.href);
      if(url.origin===location.origin&&/\/resize(?:\.php)?$/.test(url.pathname)&&url.searchParams.has('url'))url=new URL(url.searchParams.get('url'),location.href);
      return /^(https?:)$/.test(url.protocol)&&/\.(?:svg|webp|avif)$/i.test(url.pathname)?url.href:'';
    }catch(error){return '';}
  }
  function enhanceModernImages() {
    var contentList=/\/(?:streams|movies|series)(?:\.php)?$/.test(location.pathname);
    if(contentList)document.body.classList.add('naxx-content-list');
    document.querySelectorAll('img[src]').forEach(function(image){
      if(contentList&&image.closest('table tbody'))image.classList.add('naxx-content-logo');
      var source=modernImageURL(image.getAttribute('src'));
      if(!source)return;
      if(image.src!==source){image.removeAttribute('srcset');image.src=source;}
      image.decoding='async';
      if(image.closest('table'))image.loading='lazy';
    });
    if(typeof window.openImage==='function'&&!window.openImage.naxxModern){
      var original=window.openImage;
      var openModernImage=function(element){
        var node=typeof element==='string'?document.querySelector(element):element;
        var input=node&&node.parentElement&&node.parentElement.parentElement&&node.parentElement.parentElement.querySelector('input');
        var source=modernImageURL(node&&(node.getAttribute('data-src')||(input&&input.value)));
        var jq=window.jQuery;
        if(source&&jq&&jq.magnificPopup){jq.magnificPopup.open({items:{src:source,type:'image'},mainClass:'naxx-image-popup',image:{titleSrc:function(){return 'Prévia da imagem';}}});return;}
        return original.apply(this,arguments);
      };
      openModernImage.naxxModern=true;window.openImage=openModernImage;
    }
  }
  function removeKnowledgebaseLinks() {
    document.querySelectorAll('a').forEach(function (link) {
      var label = (link.textContent || '').replace(/\s+/g, ' ').trim().toLowerCase();
      var href = (link.getAttribute('href') || '').toLowerCase();
      if (label !== 'xui knowledgebase' && label !== 'documentação xui' && !/knowledgebase|docs\.xui/.test(href)) return;
      var item = link.closest('li');
      if (item && item.querySelectorAll('a').length === 1) item.remove();
      else link.remove();
    });
  }
  function addUpdateMenuLink(){
    var settings=document.querySelector('.dropdown-menu a[href="settings"],.dropdown-menu a[href="settings.php"]');
    var license=Array.from(document.querySelectorAll('.dropdown-menu a')).find(function(link){
      return /(?:^|\/)license(?:\.php)?(?:\?|$)/i.test(link.getAttribute('href')||'')||/^(?:license information|informa[çc][õo]es (?:da |de )?licen[çc]a)$/i.test(link.textContent.trim());
    });
    var existing=document.querySelector('[data-naxx-update-link]');
    if(license){
      if(existing&&existing!==license)existing.remove();
    }else if(existing||!settings)return;
    var link=license||document.createElement('a');
    link.className=link.className||(settings&&settings.className)||'dropdown-item';
    link.href='naxx-update-page.php';link.dataset.naxxUpdateLink='';
    link.removeAttribute('onclick');link.replaceChildren();
    var icon=document.createElement('i');icon.className='mdi mdi-update mr-1';icon.setAttribute('aria-hidden','true');
    link.append(icon,document.createTextNode('Atualização'));
    if(!license)settings.after(link);
  }
  function translateCacheSettings() {
    if (!/\/cache(?:\.php)?$/.test(location.pathname)) return;
    document.querySelectorAll('.container-fluid p,.card p').forEach(function (paragraph) {
      var text = (paragraph.textContent || '').replace(/\s+/g, ' ').trim();
      var match = text.match(/^Your last cron execution was at (.+?)\. If it takes longer to run a cron than the time between executions, you will have issues as the caching will be cut off before completion\.$/);
      if (!match) return;
      var date = document.createElement('strong');
      date.textContent = match[1];
      paragraph.replaceChildren(
        document.createTextNode('A última execução da rotina ocorreu em '),
        date,
        document.createTextNode('. Se a execução demorar mais do que o intervalo entre as execuções, o cache será interrompido antes de terminar.')
      );
    });
  }
  function addEpgSyncButton() {
    if (!/\/epgs?(?:\.php)?$/.test(location.pathname) || document.querySelector('[data-naxx-epg-sync]')) return;
    var addButton = Array.from(document.querySelectorAll('.page-title-box a,.page-title-box button,.page-title-box .btn')).find(function (element) {
      return /^(add epg|adicionar epg)$/i.test((element.textContent || '').replace(/\s+/g, ' ').trim());
    });
    if (!addButton) return;
    var group = addButton.closest('.btn-group') || addButton;
    var refreshButton = document.createElement('button');
    refreshButton.type = 'button';
    refreshButton.className = 'btn btn-outline-primary naxx-epg-refresh-button';
    refreshButton.textContent = '↻ Atualizar fontes';
    refreshButton.title = 'Atualizar as fontes EPG cadastradas';
    var button = document.createElement('button');
    button.type = 'button';
    button.className = 'btn btn-primary naxx-epg-sync-button';
    button.dataset.naxxEpgSync = '1';
    button.textContent = '↔ Sincronizar canais';
    button.title = 'Associar automaticamente os canais às IDs XMLTV correspondentes';
    var refreshStatus = document.createElement('span');
    refreshStatus.className = 'naxx-epg-sync-status naxx-epg-refresh-status';
    refreshStatus.setAttribute('role', 'status');
    refreshStatus.setAttribute('aria-live', 'polite');
    var status = document.createElement('span');
    status.className = 'naxx-epg-sync-status';
    status.setAttribute('role', 'status');
    status.setAttribute('aria-live', 'polite');
    group.parentNode.insertBefore(refreshButton, group.nextSibling);
    group.parentNode.insertBefore(button, refreshButton.nextSibling);
    group.parentNode.insertBefore(refreshStatus, button.nextSibling);
    group.parentNode.insertBefore(status, refreshStatus.nextSibling);
    refreshButton.addEventListener('click', function () {
      var table = document.querySelector('.dataTable,table');
      var jq = window.jQuery;
      var dataTable = table && jq && jq.fn && jq.fn.dataTable && jq.fn.dataTable.isDataTable(table) ? jq(table).DataTable() : null;
      var pageInfo = dataTable && dataTable.page && dataTable.page.info ? dataTable.page.info() : null;
      var firstPage = pageInfo ? pageInfo.page : 0;
      var pageCount = pageInfo ? pageInfo.pages : 1;
      var page = firstPage;
      var sent = 0;
      function actionsOnCurrentPage() {
        var actions = [];
        table.querySelectorAll('tbody tr').forEach(function (row) {
          if (!row.querySelector('td')) return;
          var cells = row.querySelectorAll('td');
          var actionCell = cells[cells.length - 1];
          if (!actionCell) return;
          var controls = Array.from(actionCell.querySelectorAll('a,button'));
          var action = controls.find(function (control) {
            var icon = control.querySelector('i,svg');
            var details = [control.textContent, control.title, control.getAttribute('aria-label'), control.getAttribute('data-original-title'), control.getAttribute('href'), control.getAttribute('onclick'), control.className, icon && icon.getAttribute('class')].join(' ').toLowerCase();
            return /sync|refresh|reload|update|rotate|redo/.test(details);
          });
          if (!action && controls.length === 3) action = controls[1];
          if (action) actions.push(action);
        });
        return actions;
      }
      if (!table) { refreshStatus.textContent = 'A tabela de fontes EPG não foi encontrada.'; return; }
      refreshButton.disabled = true;
      refreshStatus.textContent = 'Preparando atualização das fontes EPG…';
      function finish() {
        function report() {
          refreshStatus.textContent = sent
            ? 'Atualização solicitada para ' + sent + ' fonte(s) EPG.'
            : 'Nenhum botão de atualização foi encontrado nas fontes EPG.';
          refreshButton.disabled = false;
        }
        if (dataTable && page !== firstPage) {
          jq(table).one('draw.dt', report);
          dataTable.page(firstPage).draw('page');
        } else report();
      }
      function processPage() {
        var actions = actionsOnCurrentPage();
        var current = 0;
        function sendNext() {
          if (current >= actions.length) {
            if (dataTable && page + 1 < pageCount) {
              page += 1;
              refreshStatus.textContent = 'Verificando página ' + (page + 1) + ' de ' + pageCount + '…';
              jq(table).one('draw.dt', function () { window.setTimeout(processPage, 50); });
              dataTable.page(page).draw('page');
            } else finish();
            return;
          }
          refreshStatus.textContent = 'Atualizando fontes EPG: ' + (sent + 1) + '…';
          var action = actions[current++];
          try { action.click(); sent += 1; }
          catch (error) { /* Continue a sincronização das demais fontes. */ }
          window.setTimeout(sendNext, 1500);
        }
        sendNext();
      }
      processPage();
    });
    button.addEventListener('click', function () {
      button.disabled = true;
      status.textContent = 'Associando canais aos identificadores XMLTV…';
      fetch('./naxx-epg-sync.php', {
        method: 'POST',
        credentials: 'same-origin',
        headers: {'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest'},
        body: '{}'
      }).then(function (response) {
        return response.text().then(function (text) {
          var data;
          try { data = JSON.parse(text); } catch (error) { data = null; }
          if (response.redirected && /\/login(?:\.php)?$/.test(new URL(response.url).pathname)) throw new Error('Sua sessão expirou. Entre novamente no painel.');
          if (!response.ok || !data || !data.ok) throw new Error(data && data.message ? data.message : 'Não foi possível sincronizar os canais.');
          return data;
        });
      }).then(function (data) {
        var stats = data.stats || {};
        status.textContent = 'Vinculados: ' + (stats.linked || 0) + '. Mantidos: ' + (stats.preserved || 0) + '. Sem correspondência: ' + (stats.unmatched || 0) + '. Ambíguos: ' + (stats.ambiguous || 0) + '.';
        status.dataset.state = 'success';
      }).catch(function (error) {
        status.textContent = error && error.message ? error.message : 'Falha ao sincronizar os canais.';
        status.dataset.state = 'error';
      }).finally(function () { button.disabled = false; });
    });
  }
  function monitorChannelPlayer(frame) {
    if (!frame || frame.dataset.naxxErrorMonitor) return;
    frame.dataset.naxxErrorMonitor = '1';
    function showPlayerError(message) {
      var card=frame.closest('.naxx-player-card'),overlay=card&&card.querySelector('.naxx-player-error');
      if(!overlay)return;
      overlay.querySelector('[data-naxx-player-error]').textContent=message;
      overlay.hidden=false;
      var state=card.querySelector('.naxx-player-state');if(state)state.textContent='Indisponível';
    }
    var bindEvents = function () {
      var attempts = 0;
      frame.__naxxRepairAttempted=false;
      var bind = function () {
        if (!frame.isConnected || attempts++ >= 40) return;
        try {
          var playerWindow = frame.contentWindow;
          var jwplayer = playerWindow && playerWindow.jwplayer;
          if(playerWindow&&playerWindow.document.querySelector('#login_button')){showPlayerError('Sua sessão expirou. Entre novamente no painel para reproduzir o canal.');return;}
          if (typeof jwplayer === 'function') {
            var instance = jwplayer();
            var config=instance&&typeof instance.getConfig==='function'&&instance.getConfig();
            if (instance && typeof instance.on === 'function' && config && config.playlist && config.playlist.length) {
              if (frame.__naxxPlayerInstance === instance) return;
              frame.__naxxPlayerInstance = instance;
              var card=frame.closest('.naxx-player-card'),overlay=card&&card.querySelector('.naxx-player-error');
              var state=card&&card.querySelector('.naxx-player-state');
              function repairOrigin(){
                if(frame.__naxxRepairAttempted)return Promise.resolve(false);
                frame.__naxxRepairAttempted=true;
                var item=instance.getPlaylistItem&&instance.getPlaylistItem();
                var source=item&&item.sources&&item.sources[0]&&item.sources[0].file;
                if(!source)source=config.playlist[0].sources&&config.playlist[0].sources[0]&&config.playlist[0].sources[0].file;
                var original=new URL(source,frame.src),target=new URL(original.href),origin=new URL(frame.src);
                // Só recupera a rota autenticada de prévia do próprio painel.
                if(!/^\/admin\/live(?:\.php)?$/.test(original.pathname)||!original.searchParams.has('uitoken')||original.origin===origin.origin)return Promise.resolve(false);
                target.protocol=origin.protocol;target.host=origin.host;
                if(state)state.textContent='Conectando…';
                var controller=new AbortController();var timeout=window.setTimeout(function(){controller.abort();},12000);
                return fetch(target.href,{credentials:'same-origin',signal:controller.signal,cache:'no-store'}).then(function(response){if(!response.ok)return '';return response.text();}).then(function(manifest){
                  if(!frame.isConnected||manifest.trim().indexOf('#EXTM3U')!==0)return false;
                  if(overlay)overlay.hidden=true;
                  instance.load([{file:target.href,type:'hls'}]);instance.play();return true;
                }).catch(function(){return false;}).finally(function(){window.clearTimeout(timeout);});
              }
              function reportError(error){
                repairOrigin().then(function(repaired){if(!repaired)showPlayerError(Number(error&&error.code)===232404?'O canal não respondeu. Verifique a fonte ou tente novamente.':'Não foi possível reproduzir este canal. Confira a conexão e tente novamente.');});
              }
              instance.on('error',reportError);
              instance.on('setupError',reportError);
              instance.on('play',function(){if(overlay)overlay.hidden=true;if(state)state.textContent='Reproduzindo';});
              instance.on('buffer',function(){if(state)state.textContent='Carregando…';});
              instance.on('pause',function(){if(state)state.textContent='Pausado';});
              var playerDocument=playerWindow.document;
              playerDocument.documentElement.lang='pt-BR';
              if(!playerDocument.getElementById('naxx-player-style')){
                var style=playerDocument.createElement('style');style.id='naxx-player-style';style.textContent='html,body{margin:0!important;background:#05080d!important}body .jwplayer{font-family:system-ui,sans-serif}body .jw-progress,body .jw-knob{background:#4b8df7}body .jw-button-color:hover{color:#79b8ff}body .jw-controlbar{background:linear-gradient(transparent,#070e1deb)}';playerDocument.head.appendChild(style);
              }
              var labels={'Play':'Reproduzir','Pause':'Pausar','Mute':'Silenciar','Unmute':'Ativar som','Fullscreen':'Tela cheia','Exit Fullscreen':'Sair da tela cheia','Settings':'Configurações','Volume':'Volume','Live':'Ao vivo','Playback rate':'Velocidade','Quality':'Qualidade'};
              function translateControls(){playerDocument.querySelectorAll('.jw-text,[aria-label],[title]').forEach(function(element){['aria-label','title'].forEach(function(attribute){var value=element.getAttribute(attribute);if(labels[value])element.setAttribute(attribute,labels[value]);});if(element.classList.contains('jw-text')&&labels[element.textContent.trim()])element.textContent=labels[element.textContent.trim()];});}
              translateControls();instance.on('ready',translateControls);instance.on('play',translateControls);
              if(instance.getState&&instance.getState()==='error')reportError({code:232404});
              return;
            }
          }
        } catch (error) { return; }
        window.setTimeout(bind, 250);
      };
      window.setTimeout(bind, 0);
    };
    frame.addEventListener('load', bindEvents);
    bindEvents();
  }
  function enhanceChannelPlayer() {
    if (!/\/streams(?:\.php)?$/.test(location.pathname) || typeof window.player !== 'function' || window.player.naxxEnhanced) return;
    var openPlayer = function (streamId) {
      var source = new URL('./player?type=live&id=' + encodeURIComponent(streamId), location.href).href;
      var jq = window.jQuery;
      if (!jq || !jq.magnificPopup) { window.location.assign(source); return; }
      jq.magnificPopup.open({
        items: {src: source, type: 'iframe'},
        mainClass: 'naxx-player-popup',
        closeOnBgClick: true,
        fixedContentPos: true,
        iframe: {
          markup: '<div class="naxx-player-card"><div class="naxx-player-bar"><span class="naxx-player-brand"><span class="naxx-player-mark"></span>NAXX</span><span class="naxx-player-live">AO VIVO</span><span class="naxx-player-state" role="status" aria-live="polite">Conectando…</span><span class="naxx-player-label">Prévia do canal</span><button title="Fechar player" aria-label="Fechar player" type="button" class="mfp-close">×</button></div><div class="mfp-iframe-scaler"><iframe class="mfp-iframe" frameborder="0" allow="autoplay; fullscreen; picture-in-picture; encrypted-media" allowfullscreen></iframe></div><div class="naxx-player-error" role="alert" aria-live="assertive" hidden><div class="naxx-player-error-card"><span class="naxx-player-error-symbol">!</span><h2>Transmissão indisponível</h2><p data-naxx-player-error>Não foi possível carregar o canal.</p><button class="naxx-player-retry" data-naxx-player-retry type="button">Tentar novamente</button></div></div></div>',
          srcAction: 'iframe_src'
        },
        callbacks: {
          open: function () {
            var frame = this.content && this.content.find('iframe.mfp-iframe')[0];
            if (!frame) return;
            frame.title='Player do canal ao vivo';
            monitorChannelPlayer(frame);
            var retry = this.content.find('[data-naxx-player-retry]')[0];
            if (retry && !retry.dataset.naxxBound) {
              retry.dataset.naxxBound = '1';
              retry.addEventListener('click', function () {
                var overlay = frame.closest('.naxx-player-card').querySelector('.naxx-player-error');
                if (overlay) overlay.hidden = true;
                try { frame.contentWindow.location.reload(); }
                catch (error) { frame.src = frame.src; }
              });
            }
          },
          beforeClose:function(){var frame=this.content&&this.content.find('iframe.mfp-iframe')[0];if(frame&&frame.__naxxPlayerInstance){try{frame.__naxxPlayerInstance.stop();}catch(error){}}}
        }
      });
    };
    openPlayer.naxxEnhanced = true;
    window.player = openPlayer;
  }
  function organizeMenu(){
    var nav=document.querySelector('.navigation-menu');if(!nav||nav.dataset.naxxOrganized||document.querySelector('[data-nav]'))return;
    nav.dataset.naxxOrganized='1';
    // Remove apenas os atalhos duplicados. Os formulários continuam no importador unificado.
    nav.querySelectorAll('a[href]').forEach(function(a){var route=a.getAttribute('href').replace(/^\.\//,'');if(/^(stream|movie|serie)\?import|^review\?type=/.test(route))a.closest('li').remove();});
    function setMenuLabel(anchor,label){if(!anchor)return;var changed=false;Array.from(anchor.childNodes).forEach(function(node){if(node.nodeType===3&&node.textContent.trim()){node.textContent=' '+label+' ';changed=true;}});if(!changed)anchor.prepend(document.createTextNode(label+' '));}
    function topItem(link){var item=link&&link.closest('li');while(item&&item.parentElement!==nav)item=item.parentElement;return item;}
    var team=topItem(nav.querySelector('a[href="users"]'));
    if(team){var teamLink=team.querySelector(':scope > a');setMenuLabel(teamLink,'Equipe');teamLink.title='Administradores e revendedores';}
    var clients=topItem(nav.querySelector('a[href="lines"]'));
    if(clients){
      var clientLink=clients.querySelector(':scope > a');setMenuLabel(clientLink,'Clientes');clientLink.title='Contas de acesso e dispositivos';
      clients.classList.add('naxx-clients-nav');
      var clientMenu=clients.querySelector(':scope > ul');
      if(clientMenu)Array.from(clientMenu.children).forEach(function(item){
        var link=item.querySelector(':scope > a'),list=item.querySelector(':scope > ul');
        if(!link||!list)return;
        var heading=document.createElement('span');heading.className='naxx-menu-heading';heading.textContent=list.querySelector('a[href="lines"]')?'Contas de acesso':link.textContent.replace(/\s+/g,' ').trim();
        link.replaceWith(heading);item.classList.remove('has-submenu');item.classList.add('naxx-client-group');list.className='naxx-client-links';
      });
    }
    var management=nav.querySelector('a[href="quick_tools"],a[href="codes"],a[href="stream_categories"],a[href="user_mass"]');
    if(management){var group=management.closest('ul').closest('ul.submenu').parentElement;while(group.parentElement!==nav&&group.parentElement)group=group.parentElement;var anchor=group.querySelector(':scope > a');if(anchor){group.classList.add('naxx-advanced-nav');Array.from(anchor.childNodes).forEach(function(n){if(n.nodeType===3&&n.textContent.trim())n.textContent=' Avançado ';});}}
    var advanced=nav.querySelector(':scope > li.naxx-advanced-nav');
    var advancedMenu=advanced&&advanced.querySelector(':scope > ul.submenu');
    if(advancedMenu&&!advancedMenu.dataset.naxxGrouped){
      var labels={'service setup':'Serviços e configuração','configuração dos serviços':'Serviços e configuração','access control':'Acesso e segurança','controle de acesso':'Acesso e segurança','ferramentas':'Ferramentas','editar em lote':'Edição em lote','registros':'Registros e monitoramento'};
      var sections=[];
      Array.from(advancedMenu.children).forEach(function(source){
        var sourceLink=source.querySelector(':scope > a');
        var sourceName=(sourceLink&&sourceLink.textContent||'').replace(/\s+/g,' ').trim().toLowerCase();
        var sectionName=labels[sourceName]||(/tickets|chamados/.test(sourceName)?'Suporte':'Outras opções');
        var links=source.querySelectorAll(':scope > ul a[href]');
        if(!links.length&&sourceLink&&sourceLink.getAttribute('href')!=='#')links=[sourceLink];
        var items=[];
        Array.from(links).forEach(function(link){
          var href=(link.getAttribute('href')||'').trim();
          var item=link.closest('li');
          if(!href||href==='#'||!item)return;
          items.push(item);
        });
        if(items.length)sections.push({name:sectionName,items:items});
      });
      if(sections.length){
        advancedMenu.replaceChildren();
        advancedMenu.classList.add('naxx-advanced-panel');
        advancedMenu.dataset.naxxGrouped='1';
        var searchRow=document.createElement('li');searchRow.className='naxx-advanced-search-row';
        var search=document.createElement('input');search.type='search';search.className='naxx-advanced-search';search.placeholder='Buscar ferramenta…';search.setAttribute('aria-label','Buscar em ferramentas avançadas');search.autocomplete='off';searchRow.appendChild(search);advancedMenu.appendChild(searchRow);
        sections.forEach(function(section){
          var groupItem=document.createElement('li');groupItem.className='naxx-advanced-group';
          var heading=document.createElement('h6');heading.textContent=section.name;groupItem.appendChild(heading);
          var list=document.createElement('ul');list.className='naxx-advanced-links';
          section.items.forEach(function(item){list.appendChild(item);});groupItem.appendChild(list);advancedMenu.appendChild(groupItem);
        });
        function normalizeSearch(value){return String(value||'').toLocaleLowerCase('pt-BR').normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim();}
        var empty=document.createElement('li');empty.className='naxx-advanced-empty';empty.textContent='Nenhuma ferramenta encontrada.';empty.hidden=true;advancedMenu.appendChild(empty);
        search.addEventListener('input',function(){
          var query=normalizeSearch(search.value);
          var visibleSections=0;
          advancedMenu.querySelectorAll('.naxx-advanced-group').forEach(function(section){
            var heading=normalizeSearch(section.querySelector('h6').textContent);var visible=0;
            section.querySelectorAll('.naxx-advanced-links > li').forEach(function(item){var link=item.querySelector('a');var matches=!query||heading.indexOf(query)!==-1||normalizeSearch(link&&(link.textContent+' '+link.getAttribute('href'))).indexOf(query)!==-1;item.hidden=!matches;if(matches)visible+=1;});
            section.hidden=visible===0;if(!section.hidden)visibleSections+=1;
          });
          empty.hidden=!query||visibleSections>0;
        });
        search.addEventListener('keydown',function(event){if(event.key==='Escape'){search.value='';search.dispatchEvent(new Event('input'));search.blur();}});
        function positionAdvancedPanel(){
          if(window.innerWidth<992){advancedMenu.style.left='';advancedMenu.style.width='';return;}
          var rect=advanced.getBoundingClientRect();var width=Math.min(900,window.innerWidth-24);var left=Math.max(12,Math.min(rect.left,window.innerWidth-width-12));
          advancedMenu.style.left=(left-rect.left)+'px';advancedMenu.style.width=width+'px';
        }
        advanced.addEventListener('mouseenter',positionAdvancedPanel);
        advanced.addEventListener('focusin',positionAdvancedPanel);
        window.addEventListener('resize',positionAdvancedPanel,{passive:true});
        positionAdvancedPanel();
      }
    }
    var bouquet=nav.querySelector('a[href="bouquets"]'),content=nav.querySelector('a[href="streams"],a[href="movies"],a[href="series"]'),menu=null;
    if(content){var contentTop=content.closest('li');while(contentTop.parentElement!==nav)contentTop=contentTop.parentElement;menu=contentTop.querySelector(':scope > ul');}
    if(bouquet&&menu){var bouquetItem=bouquet.closest('ul').parentElement;if(bouquetItem.parentElement===nav)menu.appendChild(bouquetItem);}
    if(menu){var item=document.createElement('li'),link=document.createElement('a');link.href='naxx-importador.php';link.textContent='Importador';link.dataset.naxxImportLink='';item.appendChild(link);menu.appendChild(item);}
    nav.querySelectorAll(':scope > li').forEach(function(li){li.classList.remove('last-elements');});Array.from(nav.children).slice(-2).forEach(function(li){li.classList.add('last-elements');});
  }
  function enhance() {
    loadOverlayStyles();
    removeKnowledgebaseLinks();
    addUpdateMenuLink();
    organizeMenu();
    replaceLegacyLogos();
    enhanceModernImages();
    addEpgSyncButton();
    if(document.getElementById('login_button')){
      document.body.classList.add('naxx-login');
      if(!document.querySelector('.naxx-login-version')){var note=document.createElement('p');note.className='naxx-login-version text-muted text-center';note.textContent='© 2026 XUI NAXX · v1.5.14';document.querySelector('#login_button').after(note);}
    }
    document.querySelectorAll('.navigation-menu a,.page-title,.header-title,.cta-box p,.card h1,.card h2,.card h3,.card h4,.card h5,.card h6,.card p,.topnav-menu a,.dropdown-item,.dropdown-item span,.nav-tabs a,.nav-tabs a span,.nav-pills a,.nav-pills a span,.nav-link,.next a,.previous a,button,label,th,option,.jstree-anchor,.select2-selection__placeholder,.apexcharts-legend-text,.timeline-item-info strong,.bootstrap-select .filter-option-inner-inner,.bootstrap-select .text,.select2-selection__rendered,.jBox-content,.jBox-title,.tooltip-inner,.popover-body').forEach(translate);
    document.querySelectorAll('[placeholder],[title],[data-original-title],[data-content]').forEach(function(element){['placeholder','title','data-original-title','data-content'].forEach(function(attribute){var value=element.getAttribute(attribute);if(value&&translations[value])element.setAttribute(attribute,translations[value]);});});
    translateSettingsHelp();
    translateStreamHelp();
    translateCacheSettings();
    versionBrandStylesheets();
    setBrandFavicon();
    enhanceChannelPlayer();
    if(/\/settings(?:\.php)?$/.test(location.pathname))document.title=document.title.replace(/\|\s*Settings$/,'| Configurações gerais');
    if(/\/stream(?:\.php)?$/.test(location.pathname) && !new URLSearchParams(location.search).has('import'))document.title=document.title.replace(/\|\s*Stream$/,'| Adicionar canal');
    document.querySelectorAll('input[placeholder],input[type="submit"]').forEach(function(input){if(translations[input.placeholder])input.placeholder=translations[input.placeholder];if(translations[input.value])input.value=translations[input.value];});
    document.querySelectorAll('.copyright').forEach(function(footer){if(footer.dataset.naxxVersion)return;footer.dataset.naxxVersion='1';footer.textContent='© 2026 XUI NAXX · v1.5.14';});
    document.title=document.title.replace(/^XUI(?:\.one)?\s*\|/, 'XUI NAXX |');
    var titleParts=document.title.split('|');if(titleParts.length===2&&translations[titleParts[1].trim()])document.title=titleParts[0].trim()+' | '+translations[titleParts[1].trim()];
    if(location.search.includes('naxx_embed=1'))document.body.classList.add('naxx-embedded');
    document.querySelectorAll('.logo').forEach(function (logo) {
      logo.setAttribute('aria-label', 'XUI NAXX — página inicial');
    });
    document.querySelectorAll('table.table').forEach(function (table) {
      // DataTables com scroll próprio conserva seus contêineres e alinhamento.
      if (table.closest('.table-responsive, .xui-table-scroll, .dataTables_scroll')) return;
      var wrapper = document.createElement('div');
      wrapper.className = 'xui-table-scroll';
      wrapper.tabIndex = 0;
      wrapper.setAttribute('role', 'region');
      wrapper.setAttribute('aria-label', 'Tabela com rolagem horizontal');
      table.parentNode.insertBefore(wrapper, table);
      wrapper.appendChild(table);
    });
    document.querySelectorAll('.navbar-toggle').forEach(function (toggle) {
      toggle.setAttribute('aria-label', 'Abrir ou fechar menu');
      toggle.setAttribute('aria-controls', 'navigation');
      toggle.setAttribute('aria-expanded', String(toggle.classList.contains('open')));
    });
  }
  function ready() {
    enhance();
    var pending = false;
    new MutationObserver(function (mutations) {
      if (!mutations.some(function (mutation) { return mutation.addedNodes.length; }) || pending) return;
      pending = true;
      window.requestAnimationFrame(function () { pending = false; enhance(); });
    }).observe(document.body, {childList:true, subtree:true});
    document.addEventListener('click', function (event) {
      var importer=event.target.closest('[data-naxx-import-link],[data-naxx-update-link]');
      if(importer&&!event.ctrlKey&&!event.metaKey){event.preventDefault();event.stopImmediatePropagation();window.location.assign(importer.href);return;}
      var toggle = event.target.closest('.navbar-toggle');
      if (toggle) window.setTimeout(function () {
        toggle.setAttribute('aria-expanded', String(toggle.classList.contains('open')));
      }, 0);
    },true);
  }
  // Aguardar inicialização das tabelas e dos plugins da versão original.
  if (document.readyState === 'complete') ready();
  else window.addEventListener('load', ready, {once:true});
}());
