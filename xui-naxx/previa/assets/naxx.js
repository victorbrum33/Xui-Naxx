/* Melhorias progressivas: não altera contas, URLs, autenticação ou dados do XUI. */
(function () {
  'use strict';
  document.documentElement.lang = 'pt-BR';
  var viewport = document.querySelector('meta[name="viewport"]');
  if (!viewport) {
    viewport = document.createElement('meta');
    viewport.name = 'viewport';
    document.head.appendChild(viewport);
  }
  viewport.content = 'width=device-width, initial-scale=1, viewport-fit=cover';
  var translations = {'Dashboard':'Visão geral','All Servers':'Todos os servidores','Main Server':'Servidor principal','Online Connections':'Conexões ativas','Active Lines':'Contas ativas','Live Streams':'Canais ao vivo','Down Streams':'Canais indisponíveis','Network Output':'Saída de rede','Network Input':'Entrada de rede','Service Status':'Estado dos serviços','CPU & Memory':'CPU e memória','Network Traffic':'Tráfego de rede','Connections':'Conexões','Database Incomplete':'Atualização do banco pendente','Root Crons Missing':'Rotinas do servidor pendentes','Server Order':'Ordem dos servidores','Service Setup':'Configuração dos serviços','Access Control':'Controle de acesso','Stream Providers':'Provedores de conteúdo','Plex Sync':'Sincronização Plex','Access Codes':'Códigos de acesso','Blocked ASN\'s':'ASNs bloqueados','HMAC Keys':'Chaves HMAC','RTMP Monitor':'Monitor RTMP','Created Channels':'Canais criados','Stream Review':'Revisar transmissões','Recordings':'Gravações','TV Guide':'Guia de programação','Import Multiple':'Importar lista','Import & Review':'Importar e revisar','Import':'Importar','Review':'Revisar','Save':'Salvar','Add':'Adicionar','Light':'Claro','Dark':'Escuro','Default':'Padrão','Blue':'Azul','Light Blue':'Azul claro','Green':'Verde','Red':'Vermelho','Orange':'Laranja','Purple':'Roxo','Pink':'Rosa','Dark Grey':'Cinza escuro','Light Grey':'Cinza claro','Search...':'Pesquisar…','Search:':'Pesquisar:','Next':'Próximo','Previous':'Anterior','Data':'Dados','Advanced':'Opções avançadas','Servers':'Servidores','Source':'Fonte','Sources':'Fontes','Online':'Ativo','Offline':'Inativo','Transcoding Disabled':'Transcodificação desativada','Disabled':'Desativado'};
  function translate(element) {
    Array.from(element.childNodes).forEach(function(node){if(node.nodeType!==3)return;var key=node.textContent.trim(),value=translations[key],duration=key.match(/^(\d+) (Hours?|Days?)$/);if(!value&&duration)value=duration[1]+' '+(duration[2].startsWith('Hour')?(duration[1]==='1'?'hora':'horas'):(duration[1]==='1'?'dia':'dias'));if(value)node.textContent=node.textContent.replace(key,value);});
  }
  Object.assign(translations,{'CPU Usage':'Uso de CPU','Memory Usage':'Uso de memória','IO Usage':'Uso de disco','Input':'Entrada','Output':'Saída','Unique Users':'Usuários únicos','Total Connections':'Total de conexões','Streams Live':'Canais ativos','Down':'Indisponíveis','Requests/sec':'Requisições/s','User Profile':'Meu perfil','General Settings':'Configurações gerais','Backup Settings':'Configurações de backup','Plex Settings':'Configurações Plex','Watch Settings':'Pastas monitoradas','License Info':'Informações da licença','XUI Knowledgebase':'Documentação XUI','Logout':'Sair'});
  Object.assign(translations,{'Details':'Detalhes','Categories':'Categorias','Bouquets':'Listas de canais','Fallback Categories':'Categorias padrão','Fallback Bouquets':'Listas de canais padrão','New Categories:':'Novas categorias:','New Bouquets:':'Novas listas:','Transcoding':'Transcodificação','Options':'Opções'});
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
  function organizeMenu(){
    var nav=document.querySelector('.navigation-menu');if(!nav||nav.dataset.naxxOrganized||document.querySelector('[data-nav]'))return;
    nav.dataset.naxxOrganized='1';
    // Remove apenas os atalhos duplicados. Os formulários continuam no importador unificado.
    nav.querySelectorAll('a[href]').forEach(function(a){var route=a.getAttribute('href').replace(/^\.\//,'');if(/^(stream|movie|serie)\?import|^review\?type=/.test(route))a.closest('li').remove();});
    var management=nav.querySelector('a[href="quick_tools"]');
    if(management){var group=management.closest('ul').closest('ul.submenu').parentElement;while(group.parentElement!==nav&&group.parentElement)group=group.parentElement;var anchor=group.querySelector(':scope > a');if(anchor)Array.from(anchor.childNodes).forEach(function(n){if(n.nodeType===3&&n.textContent.trim())n.textContent=' Avançado ';});}
    var bouquet=nav.querySelector('a[href="bouquets"]'),content=nav.querySelector('a[href="streams"],a[href="movies"],a[href="series"]'),menu=null;
    if(content){var contentTop=content.closest('li');while(contentTop.parentElement!==nav)contentTop=contentTop.parentElement;menu=contentTop.querySelector(':scope > ul');}
    if(bouquet&&menu){var bouquetItem=bouquet.closest('ul').parentElement;if(bouquetItem.parentElement===nav)menu.appendChild(bouquetItem);}
    if(menu){var item=document.createElement('li'),link=document.createElement('a');link.href='naxx-importador.php';link.textContent='Importador';link.dataset.naxxImportLink='';item.appendChild(link);menu.appendChild(item);}
    nav.querySelectorAll(':scope > li').forEach(function(li){li.classList.remove('last-elements');});Array.from(nav.children).slice(-2).forEach(function(li){li.classList.add('last-elements');});
  }
  function enhance() {
    organizeMenu();
    if(document.getElementById('login_button')){
      document.body.classList.add('naxx-login');
      var oldLogo=document.querySelector('img[src="assets/images/logo.png"]');
      if(oldLogo){var brand=document.createElement('span');brand.className='logo';brand.setAttribute('aria-label','XUI NAXX');oldLogo.replaceWith(brand);}
      if(!document.querySelector('.naxx-login-version')){var note=document.createElement('p');note.className='naxx-login-version text-muted text-center';note.textContent='© 2026 XUI NAXX · v1.5.14';document.querySelector('#login_button').after(note);}
    }
    document.querySelectorAll('.navigation-menu a,.page-title,.header-title,.cta-box p,.card h1,.card h2,.card h3,.card h4,.card h5,.card h6,.card p,.topnav-menu a,.dropdown-item,.dropdown-item span,.nav-tabs a,.nav-tabs a span,.nav-pills a,.nav-pills a span,.nav-link,.next a,.previous a,button,label,th,option,.jstree-anchor,.select2-selection__placeholder,.apexcharts-legend-text,.timeline-item-info strong,.bootstrap-select .filter-option-inner-inner,.bootstrap-select .text,.select2-selection__rendered,.jBox-content,.jBox-title,.tooltip-inner,.popover-body').forEach(translate);
    document.querySelectorAll('[placeholder],[title],[data-original-title],[data-content]').forEach(function(element){['placeholder','title','data-original-title','data-content'].forEach(function(attribute){var value=element.getAttribute(attribute);if(value&&translations[value])element.setAttribute(attribute,translations[value]);});});
    translateSettingsHelp();
    if(/\/settings(?:\.php)?$/.test(location.pathname))document.title=document.title.replace(/\|\s*Settings$/,'| Configurações gerais');
    document.querySelectorAll('input[placeholder],input[type="submit"]').forEach(function(input){if(translations[input.placeholder])input.placeholder=translations[input.placeholder];if(translations[input.value])input.value=translations[input.value];});
    document.querySelectorAll('.copyright').forEach(function(footer){if(footer.dataset.naxxVersion)return;footer.dataset.naxxVersion='1';footer.textContent='© 2026 XUI NAXX · v1.5.14';});
    document.title=document.title.replace(/^XUI(?:\.one)?\s*\|/, 'XUI NAXX |');
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
      var importer=event.target.closest('[data-naxx-import-link]');
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
