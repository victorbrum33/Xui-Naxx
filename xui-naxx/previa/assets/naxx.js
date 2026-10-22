/* Melhorias progressivas: não altera contas, URLs, autenticação ou dados do XUI. */
(function () {
  'use strict';
  var overlayScript=document.currentScript;
  var overlayRevision=window.naxxAssetRevision||'7fed7003f43e';
  var overlayAssetBase=overlayScript&&overlayScript.src?new URL('../css/',overlayScript.src):new URL('assets/css/',location.href);
  function loadOverlayStyles(){
    if(overlayScript&&overlayScript.src&&!/\/(?:naxx-overlay|app\.min)\.js(?:\?|$)/.test(overlayScript.src))return;
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
  // Os gráficos também inserem estilos no head. Só mudanças nos links de CSS
  // precisam conferir o tema, sem reexaminar o painel a cada animação.
  new MutationObserver(function(mutations){
    if(mutations.some(function(mutation){
      if(mutation.type==='attributes')return mutation.target.matches('link[rel~="stylesheet"]');
      return Array.from(mutation.addedNodes).concat(Array.from(mutation.removedNodes)).some(function(node){return node.nodeType===1&&node.matches('link[rel~="stylesheet"]');});
    })){versionBrandStylesheets();loadOverlayStyles();}
  }).observe(document.head,{childList:true,subtree:true,attributes:true,attributeFilter:['href']});
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
  var translationSelector='.navigation-menu a,.page-title,.header-title,.cta-box p,.card h1,.card h2,.card h3,.card h4,.card h5,.card h6,.card p,.topnav-menu a,.dropdown-item,.dropdown-item span,.nav-tabs a,.nav-tabs a span,.nav-pills a,.nav-pills a span,.nav-link,.next a,.previous a,button,label,th,option,.jstree-anchor,.select2-selection__placeholder,.apexcharts-legend-text,.timeline-item-info strong,.bootstrap-select .filter-option-inner-inner,.bootstrap-select .text,.select2-selection__rendered,.jBox-content,.jBox-title,.tooltip-inner,.popover-body';
  var translatedAttributes=['placeholder','title','data-original-title','data-content'];
  function within(root,selector){
    var elements=Array.from(root.querySelectorAll(selector));
    if(root.nodeType===1&&root.matches(selector))elements.unshift(root);
    return elements;
  }
  function containsFeature(root,selector){return root===document||(root.nodeType===1&&root.matches(selector))||Boolean(root.querySelector(selector));}
  Object.assign(translations,{'Encoding Queue':'Fila de codificação','Login Logs':'Registros de acesso','On-Demand Scanner':'Verificador sob demanda','Panel Errors':'Erros do painel','Restream Detection':'Detecção de retransmissão','Stream Rank':'Classificação de canais','System Logs':'Registros do sistema','VOD Theft Detection':'Detecção de cópia de VOD','Stream Review':'Revisão de canais'});
  Object.assign(translations,{'No potential issues have been detected!':'Nenhum problema foi detectado.','Online Streams':'Canais ativos','EPG Files':'Guias de programação','Quick Tools':'Ferramentas rápidas','Quality':'Qualidade','Search Streams...':'Pesquisar canais…','All Categories':'Todas as categorias','All Statuses':'Todos os estados','No information available':'Nenhuma informação disponível'});
  Object.assign(translations,{'Channel Order':'Ordem dos canais',"EPG's":'Guias de programação','Fingerprint':'Marca de identificação','Mass Delete':'Excluir em lote','Mass Edit':'Editar em lote','Stream Tools':'Ferramentas de canais','Export as CSV':'Exportar CSV','Actions':'Ações','ACTIONS':'AÇÕES','Start':'Iniciar','Stop':'Parar','Restart':'Reiniciar','Kill Connections':'Encerrar conexões','Edit':'Editar','Delete':'Excluir'});
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
  var brandAssetVersion = 'dc7f713aa259';
  var stylesheetVersion = '7fed7003f43e';
  Object.assign(translations,{"Settings": "Configurações gerais", "Save Changes": "Salvar alterações", "General": "Geral", "Security": "Segurança", "Streaming": "Transmissão", "Web Player": "Player web", "Logs": "Registros", "Preferences": "Preferências", "Server Name": "Nome do servidor", "Server Timezone": "Fuso horário do servidor", "Message of the Day": "Mensagem do dia", "Show Entries": "Itens por página", "Fails Per Time": "Falhas por período", "Date Format": "Formato da data", "Datetime Format": "Formato de data e hora", "Group Streams Table": "Agrupar transmissões na tabela", "Seamless Navigation": "Navegação sem recarregar a página", "Show Tickets Icon": "Exibir ícone de chamados", "Disable Restart Counter": "Desativar contador de reinicializações", "Auto-Cleanup Files": "Limpar arquivos automaticamente", "Check VOD Cron": "Verificar rotina de VOD", "Show Images & Picons": "Exibir imagens e ícones de canais", "Group Buttons": "Agrupar botões", "Quick Edit Modal": "Janela de edição rápida", "MySQL Sleep Timeout": "Tempo limite de conexões ociosas no MySQL", "Show Graphs": "Exibir gráficos", "Show Connections Map": "Exibir mapa de conexões", "Alternate Server View": "Visualização alternativa de servidores", "Show Header Stats": "Exibir estatísticas no cabeçalho", "Show Service Status": "Exibir estado dos serviços", "CPU Threshold %": "Limite de CPU (%)", "Memory Threshold %": "Limite de memória (%)", "Disk Threshold %": "Limite de disco (%)", "Network Threshold %": "Limite de rede (%)", "Clients Threshold %": "Limite de clientes (%)", "Search": "Pesquisa", "Enable Search": "Ativar pesquisa", "Number of Items": "Quantidade de itens", "Reseller": "Revendedor", "Disable Trials": "Desativar testes", "SSL Custom DNS": "DNS personalizado com SSL", "Debug": "Diagnóstico", "Debug Mode": "Modo de diagnóstico", "Auto-Send Logs to XUI": "Enviar registros automaticamente ao XUI", "Enable reCAPTCHA": "Ativar reCAPTCHA", "reCAPTCHA V2 - Site Key": "reCAPTCHA V2 — chave do site", "reCAPTCHA V2 - Secret Key": "reCAPTCHA V2 — chave secreta", "Default Arguments": "Parâmetros padrão", "User Agent": "Agente de usuário", "HTTP Proxy": "Proxy HTTP", "Headers": "Cabeçalhos", "On Demand Probesize": "Tamanho da análise sob demanda", "IP Security": "Segurança de IP", "Match Subnet of IP": "Verificar sub-rede do IP", "Logout On IP Change": "Encerrar sessão ao mudar de IP", "Restrict to Same IP": "Restringir ao mesmo IP", "Random RTMP IP": "IP RTMP aleatório", "Disallow 2nd IP": "Bloquear segundo IP", "Disallow if Connections <=": "Bloquear se as conexões forem menores ou iguais a", "Restream Prevention": "Prevenção de retransmissão", "XUI Detect - Deny": "Detecção de XUI — negar acesso", "XUI Detect - Ban Lines": "Detecção de XUI — banir contas", "Block Hosting Servers": "Bloquear servidores de hospedagem", "Block Proxies / VPN's": "Bloquear proxies e VPNs", "Spam Prevention": "Prevenção de abuso", "Flood Limit": "Limite de requisições", "Per Seconds": "Período em segundos", "Auth Flood Limit": "Limite de requisições de autenticação", "Auth Flood Seconds": "Período de autenticação em segundos", "Auth Flood Sleep": "Pausa após excesso de autenticações", "Flood IP Exclusions": "IPs isentos do limite de requisições", "Detect MAC Bruteforce": "Detectar tentativas de força bruta por MAC", "Detect Username Bruteforce": "Detectar tentativas de força bruta por usuário", "Bruteforce Frequency": "Intervalo de verificação de força bruta", "Maximum Login Attempts": "Máximo de tentativas de login", "Max Simultaneous Downloads": "Máximo de downloads simultâneos", "TMDb Key": "Chave do TMDb", "TMDb Language": "Idioma do TMDb", "Download Images": "Baixar imagens", "API Redirect": "Redirecionamento da API", "Append Movie Year": "Adicionar ano ao título do filme", "API Container": "Formato de saída da API", "Cache Playlists for": "Manter listas em cache por", "Grab Playlists from MySQL": "Obter listas diretamente do MySQL", "Force EPG to UTC Timezone": "Forçar EPG no fuso UTC", "Keep Request Protocol": "Manter protocolo da requisição", "VOD Parser": "Analisador de títulos de VOD", "Enable Cloudflare": "Ativar Cloudflare", "Legacy Support": "Compatibilidade com aplicativos antigos", "Legacy Playlist URL": "URL de lista para aplicativos antigos", "Legacy XMLTV URL": "URL XMLTV para aplicativos antigos", "Legacy Panel API": "API do painel para aplicativos antigos", "Duplicate Streams in Legacy Apps": "Duplicar transmissões em aplicativos antigos", "EPG API": "API do guia de programação", "Enable EPG API": "Ativar API do guia de programação", "Append Extra Data": "Incluir dados adicionais", "Days to Fetch": "Dias para buscar", "Days to Keep": "Dias para manter", "API Services": "Serviços da API", "Admin Streaming IP's": "IPs de transmissão dos administradores", "API IP's": "IPs autorizados na API", "API Password": "Senha da API", "Disable EPG Download - Line": "Desativar download de EPG para contas", "Disable EPG Download - Restreamer": "Desativar download de EPG para retransmissores", "Disable Playlist Download - Line": "Desativar download de listas para contas", "Disable Playlist Download - Restreamer": "Desativar download de listas para retransmissores", "Disable Player API": "Desativar API do player", "Disable Enigma2 API": "Desativar API Enigma2", "Disable Ministra API": "Desativar API Ministra", "Verify Hosts": "Verificar servidores de origem", "Streaming Password": "Senha de transmissão", "Enable ISP Lock": "Ativar bloqueio por provedor", "Enable ASN Lock": "Ativar bloqueio por ASN", "Disable MPEG-TS Output": "Desativar saída MPEG-TS", "Allow Restreamers - MPEG-TS": "Permitir retransmissores em MPEG-TS", "Disable HLS Output": "Desativar saída HLS", "Allow Restreamers - HLS": "Permitir retransmissores em HLS", "Disable RTMP Output": "Desativar saída RTMP", "Allow Restreamers - RTMP": "Permitir retransmissores em RTMP", "Case Sensitive Lines": "Diferenciar maiúsculas e minúsculas nas contas", "Override Country with First": "Usar país da primeira conexão", "Encrypt HLS Segments": "Criptografar segmentos HLS", "Disallow Empty UA": "Bloquear agente de usuário vazio", "VOD Bitrate Buffer": "Buffer de taxa de bits do VOD", "VOD Limit At %": "Limitar VOD a (%)", "Auto-Kick Hours": "Desconectar automaticamente após horas", "Use Domain Name in API": "Usar nome de domínio na API", "Encrypt Playlists": "Criptografar listas", "Encrypt Restreamer Playlists": "Criptografar listas de retransmissores", "Restrictions on Playlists & EPG": "Aplicar restrições às listas e ao EPG", "Ignore Invalid Credentials": "Ignorar credenciais inválidas", "Client Prebuffer": "Buffer inicial do cliente", "Restreamer Prebuffer": "Buffer inicial do retransmissor", "Load Balancing": "Balanceamento de carga", "Restreamer Bypass Proxy": "Permitir que retransmissores ignorem o proxy", "Channel Sorting Type": "Tipo de ordenação dos canais", "Sort VOD by Date": "Ordenar VOD por data", "Use Nginx Buffer": "Usar buffer do Nginx", "Log Client ISP's": "Registrar provedor dos clientes", "Online Capacity Interval": "Intervalo de atualização da capacidade", "Monitor Connection Status": "Monitorar estado das conexões", "Auto-Restart Crashed PHP-FPM": "Reiniciar PHP-FPM automaticamente após falhas", "Kill Rogue FFMPEG PID's": "Encerrar processos FFMPEG órfãos", "Redirect Expiration": "Validade do redirecionamento", "HLS Read Native": "Leitura nativa de HLS", "Read Buffer Size": "Tamanho do buffer de leitura", "Redis Connection Sync Timer": "Intervalo de sincronização de conexões do Redis", "Allow CDN / Forwarding": "Permitir CDN e encaminhamento", "Max Failures": "Máximo de falhas", "On-Demand Settings": "Configurações sob demanda", "Instant Off": "Desligamento imediato", "Exit on Failure": "Encerrar em caso de falha", "Wait Timeout": "Tempo limite de espera", "Request Prebuffer": "Solicitar buffer inicial", "Balance As Live": "Balancear como transmissão ao vivo", "On-Demand Scanner": "Verificador de conteúdo sob demanda", "Enable Scanner": "Ativar verificador", "Scan Time": "Intervalo de verificação", "Max Probe Time": "Tempo máximo de análise", "Keep Logs For": "Manter registros por", "Encoding Queue Settings": "Configurações da fila de codificação", "Max Movie Encodes": "Máximo de filmes em codificação", "Max Channel Encodes": "Máximo de canais em codificação", "Queue Loop Timer": "Intervalo da fila", "Segment Settings": "Configurações de segmentos", "Segment Duration": "Duração do segmento", "List Size": "Tamanho da lista", "Delete Threshold": "Limite para exclusão", "Max Segment Wait Time": "Tempo máximo de espera por segmento", "Analysis Duration": "Duração da análise", "Probe Size": "Tamanho da análise", "FFMPEG Version": "Versão do FFMPEG", "FFMPEG Segment Type": "Tipo de segmento do FFMPEG", "FFMPEG Show Warnings": "Exibir avisos do FFMPEG", "Ignore Keyframes": "Ignorar quadros-chave", "DTS - Use FFMPEG v4.0": "DTS — usar FFMPEG v4.0", "Loopback Streams via PHP": "Retornar transmissões pelo PHP", "Stream Monitor Settings": "Configurações do monitor de transmissões", "Restart on Audio Loss": "Reiniciar ao perder o áudio", "Priority Backup": "Prioridade da fonte reserva", "Probe Duration": "Duração da análise inicial", "Stream Failure Sleep": "Pausa após falha de transmissão", "FPS Start Delay": "Atraso inicial da verificação de FPS", "FPS Check Type": "Tipo de verificação de FPS", "Probe via API": "Analisar pela API", "Off Air Videos": "Vídeos para conteúdo fora do ar", "Stream Down Video": "Vídeo de transmissão indisponível", "Banned Video": "Vídeo de conta banida", "Expired Video": "Vídeo de conta expirada", "Expiring Video": "Vídeo de aviso de vencimento", "2nd IP Connected Video": "Vídeo de segundo IP conectado", "Allowed Countries": "Países permitidos", "Show All Categories": "Exibir todas as categorias", "Default Container": "Formato padrão", "Always Enabled Subtitles": "Manter legendas ativadas", "Connection Problem Indiciation": "Indicar problemas de conexão", "Show Channel Logos": "Exibir logos dos canais", "Show Preview Channel Logos": "Exibir prévia dos logos dos canais", "Playback Limit": "Limite de reprodução", "Default Aspect Ratio": "Proporção de imagem padrão", "Default Theme Type": "Tipo de tema padrão", "Legacy Theme": "Tema para modelos antigos", "Legacy URL Redirect": "Redirecionar URLs antigas", "Keep URL Extension": "Manter extensão da URL", "Disable SSL": "Desativar SSL", "Load Channels on Startup": "Carregar canais ao iniciar", "Disable MAG Token": "Desativar token MAG", "Allowed STB Types": "Tipos de aparelhos permitidos", "Allowed STB Recording": "Aparelhos autorizados a gravar", "Speedtest URL": "URL do teste de velocidade", "Information Message": "Mensagem informativa", "Allow Playlist Download": "Permitir download de listas", "Allow Bouquet Ordering": "Permitir ordenar listas de canais", "Hide Incompatible Streams": "Ocultar transmissões incompatíveis", "Mark HEVC as Compatible": "Marcar HEVC como compatível", "Background Blur px": "Desfoque do fundo (px)", "Background Opacity %": "Opacidade do fundo (%)", "Extract Subtitles": "Extrair legendas", "Activity Logs": "Registros de atividade", "Client Logs": "Registros de clientes", "Login Logs": "Registros de login", "Stream Error Logs": "Registros de erros de transmissão", "Stream Restart Logs": "Registros de reinicialização de transmissões", "Brackets": "Parênteses", "Hyphen": "Hífen", "Default Format": "Formato padrão", "Extended Title": "Título ampliado", "Extended Description": "Descrição ampliada", "Max Clients": "Máximo de clientes", "Network Speed": "Velocidade da rede", "Detected Network Speed": "Velocidade de rede detectada", "Bouquet": "Lista de canais", "Legacy": "Antigo", "Progress Info": "Informações de progresso", "Modern": "Moderno", "Forever": "Para sempre", "All Countries": "Todos os países", "Remove item": "Remover item", "Choose...": "Selecione…", "Default - EN": "Padrão — inglês", "Leave blank to use default XUI video.": "Deixe em branco para usar o vídeo padrão do XUI.", "Cancel": "Cancelar", "Use Icon": "Usar ícone", "Adjust Credits": "Ajustar créditos", "Reason for Adjustment...": "Motivo do ajuste…", "Record": "Gravar", "Clear Stream Logs": "Limpar registros da transmissão", "Reinstall Server": "Reinstalar servidor", "Restart Services": "Reiniciar serviços", "Reboot Server": "Reiniciar servidor", "Update Binaries": "Atualizar binários", "Update Server": "Atualizar servidor"});
  var settingsHelpTranslations = {};
  Object.assign(settingsHelpTranslations,{"server_name": "Nome do seu serviço de transmissão.", "default_timezone": "Fuso horário padrão das interfaces de administração e revenda. É usado por todos os usuários até que escolham outro fuso no próprio perfil.", "message_of_day": "Mensagem exibida na API do player. Alguns aplicativos Android usam essa informação.", "default_entries": "Quantidade de itens exibidos por página nas tabelas das interfaces de administração e revenda.", "fails_per_time": "Período, em segundos, usado para contar as falhas na página de transmissões: falhas a cada X segundos.", "date_format": "Formato padrão das datas. Consulte os códigos de formatação de datas do PHP antes de alterar.", "datetime_format": "Formato padrão de data e hora. Consulte os códigos de formatação de datas do PHP antes de alterar.", "streams_grouped": "Agrupa os servidores de uma mesma transmissão em uma única linha, reduzindo a quantidade de linhas da tabela.", "js_navigate": "Usa JavaScript para carregar páginas sem recarregar toda a interface. Esse recurso fica desativado em dispositivos móveis.", "show_tickets": "Exibe o ícone de chamados no canto superior direito do menu. Ao desativar, os chamados ficam no menu de gerenciamento.", "hide_failures": "Oculta o contador de reinicializações ao lado do tempo de atividade da transmissão.", "cleanup": "Remove automaticamente arquivos desnecessários em segundo plano. Opção recomendada.", "check_vod": "Verifica periodicamente se os arquivos de VOD existem. Se não existirem, marca o conteúdo como não codificado. Não é recomendado para acervos muito grandes.", "show_images": "Exibe os logos dos canais e as imagens de VOD nas páginas de gerenciamento.", "group_buttons": "Agrupa os botões de ação em um menu nas páginas compatíveis.", "modal_edit": "Abre a edição em uma janela sobre a página atual, sem sair dela.", "mysql_sleep_kill": "Tempo permitido para uma conexão MySQL permanecer ociosa, no estado Sleep, antes de ser encerrada. Use 0 para desativar.", "dashboard_stats": "Exibe gráficos de recursos do sistema, rede e conexões na visão geral.", "dashboard_map": "Exibe o mapa das conexões na visão geral.", "dashboard_display_alt": "Troca os cartões dos servidores entre os formatos largo e quadrado na visão geral.", "header_stats_sh": "Exibe as estatísticas dos servidores no menu do cabeçalho.", "dashboard_status": "Exibe avisos conforme as estatísticas dos servidores.", "threshold_cpu": "Quando o uso de CPU ultrapassar esta porcentagem, será exibido um aviso no quadro de estado dos serviços.", "threshold_mem": "Quando o uso de memória ultrapassar esta porcentagem, será exibido um aviso no quadro de estado dos serviços.", "threshold_disk": "Quando o uso de disco ultrapassar esta porcentagem, será exibido um aviso no quadro de estado dos serviços.", "threshold_network": "Quando o uso da rede ultrapassar esta porcentagem, será exibido um aviso no quadro de estado dos serviços.", "threshold_clients": "Exibe um aviso quando a quantidade de clientes, em relação ao máximo permitido pelo servidor, ultrapassar esta porcentagem.", "enable_search": "Exibe a pesquisa no canto superior direito do cabeçalho e permite que o mecanismo de cache grave as consultas de pesquisa no banco de dados.", "search_items": "Quantidade de resultados exibidos na pesquisa. O máximo é 100.", "disable_trial": "Desativa temporariamente a criação de testes para todas as contas.", "reseller_ssl_domain": "Usa HTTPS nos downloads de listas quando o servidor principal tem SSL ativo e o revendedor usa um DNS personalizado.", "debug_show_errors": "Ativa a exibição de erros para diagnosticar problemas no painel. As mensagens podem incluir detalhes técnicos do sistema.", "auto_send_logs": "Envia automaticamente os registros de erros do painel para análise e verificação pela equipe do XUI.", "recaptcha_v2_site_key": "Acesse https://google.com/recaptcha/admin para obter as chaves do reCAPTCHA.", "recaptcha_v2_secret_key": "Acesse https://google.com/recaptcha/admin para obter as chaves do reCAPTCHA.", "http_proxy": "Formato: IP:porta.", "cookie": "Formato: chave=valor;", "headers": "Cabeçalhos enviados pelo parâmetro -headers do FFmpeg.", "probesize_ondemand": "Tamanho da análise inicial das transmissões sob demanda. Ajuste se houver problemas de ausência de áudio.", "ip_subnet_match": "Aceita mudanças de IP dentro da mesma sub-rede /24, mantendo a verificação de segurança menos restritiva. Por exemplo, 159.55.26.0 e 159.55.26.255 serão considerados equivalentes.", "ip_logout": "Encerra a sessão se o IP mudar durante o uso, ajudando a proteger contra o uso indevido de cookies.", "restrict_same_ip": "Vincula as conexões HLS ao endereço IP de origem. Desative se isso causar problemas com IPs dinâmicos.", "rtmp_random": "Usa um IP aleatório nas conexões RTMP.", "disallow_2nd_ip_con": "Impede uma conexão de outro IP enquanto a conta já estiver em uso.", "disallow_2nd_ip_max": "A restrição ao segundo IP só se aplica às contas cujo limite de conexões seja menor ou igual a este valor. Por exemplo, com 3, contas com limite de até 3 conexões serão desconectadas ao conectar por outro IP.", "restream_deny_unauthorised": "Nega conexões de contas sem permissão de retransmissão que tentem usar o XUI para retransmitir conteúdo.", "detect_restream_block_user": "Bane contas sem permissão de retransmissão que tentem usar o XUI para retransmitir conteúdo.", "block_streaming_servers": "Bloqueia automaticamente servidores identificados como pertencentes a provedores de hospedagem. Não afeta retransmissores autorizados.", "block_proxies": "Bloqueia automaticamente proxies e VPNs conforme o ASN. Não afeta retransmissores autorizados.", "flood_limit": "Quantidade de tentativas antes de bloquear o IP. Use 0 para desativar a detecção de excesso de requisições.", "flood_seconds": "Período, em segundos, usado para contar as requisições.", "auth_flood_limit": "Quantidade de requisições válidas antes de aplicar uma pausa. Use 0 para desativar.<br/><br/>Este limite se aplica apenas a clientes autenticados. Por exemplo, após 30 conexões em 10 segundos, as próximas requisições podem aguardar 1 segundo durante o período de controle.", "auth_flood_seconds": "Período, em segundos, usado para contar as requisições autenticadas.", "auth_flood_sleep": "Tempo de espera aplicado ao atingir o limite de requisições autenticadas. A requisição continua após a pausa.", "flood_ips_exclude": "Separe os endereços IP por vírgulas.", "bruteforce_mac_attempts": "Detecta e bloqueia automaticamente IPs com tentativas de força bruta contra dispositivos MAG ou Enigma. Use 0 tentativas para desativar.", "bruteforce_username_attempts": "Detecta e bloqueia automaticamente IPs com tentativas de força bruta contra contas. Use 0 tentativas para desativar.", "bruteforce_frequency": "Período usado para contar as tentativas de força bruta por MAC e usuário: X tentativas a cada X segundos.", "login_flood": "Quantidade de tentativas de login permitidas antes de bloquear o IP. Use 0 para não limitar, por exemplo, ao utilizar reCAPTCHA ou código de acesso como proteção.", "max_simultaneous_downloads": "Máximo de downloads simultâneos de EPG e listas por usuário. Não afeta retransmissores. Requisições excedentes recebem o erro HTTP 429. Use 0 para desativar o limite.", "tmdb_api_key": "Obtenha sua chave de API em <a href='https://www.themoviedb.org/settings/api'>https://www.themoviedb.org/settings/api</a>.", "tmdb_language": "Idioma padrão das consultas ao TMDb. Pode ser alterado individualmente em cada filme ou série.", "download_images": "Baixa para o servidor principal as imagens obtidas de serviços como o TMDb.", "api_redirect": "Redireciona as requisições de transmissão da API usando tokens criptografados com AES, em vez de URLs com usuário e senha. Pode permanecer desativado se seus aplicativos não utilizarem esse recurso.", "movie_year_append": "Adiciona automaticamente o ano ao título do filme ao usar o TMDb ou as pastas monitoradas.", "api_container": "Formato de saída padrão usado em aplicativos Android e Smart TVs.", "cache_playlists": "Quando maior que 0, mantém as listas baixadas pelos clientes em cache por esta quantidade de segundos. Reduz o processamento, mas pode ocupar bastante disco com muitos clientes.", "playlist_from_mysql": "Lê as transmissões diretamente do MySQL em vez do cache local. Pode ser mais rápido quando há uma grande quantidade de transmissões.", "force_epg_timezone": "Gera o EPG e os horários das APIs em UTC. Também informa UTC como fuso na API do player para sincronizar os aplicativos.", "keep_protocol": "Mantém nas listas e transmissões o protocolo solicitado pelo cliente: HTTP ou HTTPS.", "parse_type": "Escolhe entre GuessIt e PTN para interpretar nomes de arquivos nas pastas monitoradas e em outros recursos. O GuessIt costuma ser mais preciso, mas usa mais recursos.", "cloudflare": "Permite conexões dos IPs da Cloudflare e o encaminhamento do IP real do cliente para o XUI.", "legacy_get": "Redireciona requisições de get.php para a nova URL de listas.", "legacy_xmltv": "Redireciona requisições de xmltv.php para a nova URL do EPG.", "legacy_panel_api": "Redireciona requisições de panel_api.php para a nova API do player do XUI.", "show_category_duplicates": "Repete o conteúdo em cada categoria à qual ele pertence para melhorar a compatibilidade com aplicativos antigos. Como consequência, o mesmo item pode aparecer várias vezes na pesquisa ou na categoria Todos.", "enable_epg_api": "Ativa a API do guia de programação na interface de administração.", "epg_api_extended": "Acrescenta informações aos dados de EPG recebidos, como o nome do programa.", "epg_api_days_fetch": "Quantidade de dias buscados ao obter os dados de EPG.", "epg_api_days_keep": "Quantidade de dias de EPG mantidos no armazenamento.", "allowed_ips_admin": "IPs autorizados a acessar transmissões com a senha de transmissão administrativa. Separe os IPs por vírgulas.", "api_ips": "IPs autorizados a acessar a API administrativa do XUI. Separe os IPs por vírgulas.", "api_password": "Senha necessária para acessar a API administrativa do XUI. Deixe em branco para usar somente a lista de IPs autorizados.", "disable_xmltv": "Impede o download do guia de programação no formato XMLTV para contas comuns.", "disable_xmltv_restreamer": "Impede o download do guia de programação no formato XMLTV para retransmissores.", "disable_playlist": "Impede que contas comuns baixem listas HLS ou listas para dispositivos.", "disable_playlist_restreamer": "Impede que retransmissores baixem listas HLS ou listas para dispositivos.", "disable_player_api": "Impede o acesso à API por aplicativos Android e Smart TVs.", "disable_enigma2": "Impede a conexão de dispositivos Enigma.", "disable_ministra": "Impede a conexão de dispositivos MAG pela API Ministra.", "verify_host": "Confere os domínios e IPs com os endereços autorizados no banco de dados, incluindo IPs de servidores, domínios e DNS dos revendedores.", "enable_isp_lock": "Ativa ou desativa globalmente o bloqueio por provedor de internet.", "block_svp": "Ativa ou desativa globalmente o bloqueio por ASN.", "disable_ts": "Desativa a saída MPEG-TS para todos os clientes e dispositivos.", "disable_ts_allow_restream": "Permite que retransmissores continuem usando MPEG-TS mesmo com essa saída desativada.", "disable_hls": "Desativa a saída HLS para todos os clientes e dispositivos.", "disable_hls_allow_restream": "Permite que retransmissores continuem usando HLS mesmo com essa saída desativada.", "disable_rtmp": "Desativa a saída RTMP para todos os clientes e dispositivos.", "disable_rtmp_allow_restream": "Permite que retransmissores continuem usando RTMP mesmo com essa saída desativada.", "case_sensitive_line": "Diferencia letras maiúsculas e minúsculas no usuário e na senha das contas.", "county_override_1st": "Usa o país identificado na primeira conexão da conta.", "encrypt_hls": "Criptografa as transmissões HLS com AES-256 durante a reprodução. Aumenta o uso de CPU e protege o conteúdo dos pacotes.", "disallow_empty_user_agents": "Bloqueia conexões de clientes que não informam o agente de usuário.", "vod_bitrate_plus": "Buffer adicional usado na transmissão de VOD.", "vod_limit_perc": "Aplica o limite de velocidade após transmitir esta porcentagem do VOD. Use 0 para limitar desde o início ou 100 para desativar a limitação.", "user_auto_kick_hours": "Desconecta automaticamente clientes que permanecerem conectados por mais que esta quantidade de horas.", "use_mdomain_in_lists": "Usa o nome de domínio nas listas.", "encrypt_playlist": "Criptografa as credenciais das contas nos arquivos de listas.", "encrypt_playlist_restreamer": "Criptografa as credenciais nos arquivos de listas dos retransmissores.", "restrict_playlists": "Verifica agente de usuário, IP, provedor e país antes de permitir downloads de listas ou EPG. Ao desativar, os downloads podem ser feitos de qualquer IP; as restrições das transmissões continuam valendo.", "ignore_invalid_users": "Encerra rapidamente conexões com usuário ou senha incorretos, sem carregar as funções do XUI nem acionar o limite de requisições. Pode reduzir o uso de CPU em servidores com muitas requisições.", "client_prebuffer": "Quantidade de dados, em segundos de reprodução, enviada inicialmente ao cliente quando ele se conecta à transmissão. Valores maiores aumentam o buffer inicial.", "restreamer_prebuffer": "Quantidade de dados, em segundos de reprodução, enviada inicialmente ao retransmissor quando ele se conecta à transmissão. Valores maiores aumentam o buffer inicial.", "split_by": "Critério preferido para distribuir conexões entre os servidores.", "restreamer_bypass_proxy": "Encaminha retransmissores diretamente aos balanceadores, sem passar pelos proxies quando o serviço de proxy estiver ativo.", "channel_number_type": "Critério preferido para ordenar os canais nas listas e nos aplicativos.", "vod_sort_newest": "Ordena o VOD pela data de inclusão, do mais recente para o mais antigo. Para funcionar corretamente, o tipo de ordenação dos canais deve estar definido como Lista de canais.", "use_buffer": "Ativa o buffer do proxy para a conexão. Ao desativar, as respostas são enviadas sem esse buffer; ao ativar, a resposta pode ser armazenada temporariamente pelo proxy.", "show_isps": "Obtém o provedor de internet de cada cliente conectado e armazena essa informação no banco de dados.", "online_capacity_interval": "Intervalo de verificação da atividade dos servidores para calcular os limites de conexões.", "monitor_connection_status": "Verifica connection_status() do PHP durante a transmissão de canais e VOD. Encerra a conexão quando o estado retornado deixa de ser CONNECTION_NORMAL.", "restart_php_fpm": "Executa uma rotina que reinicia o PHP-FPM quando ele falha e são encontrados erros.", "kill_rogue_ffmpeg": "Verifica a cada minuto os processos FFmpeg de transmissões que deveriam estar paradas e os encerra. Também faz essa limpeza antes de iniciar uma transmissão.", "create_expiration": "Validade, em segundos, do redirecionamento do servidor principal para um balanceador. Aumente se houver muitos erros TOKEN_EXPIRED nos registros.", "read_native_hls": "Ativa a leitura nativa em todas as transmissões HLS. Desative para configurar individualmente em cada transmissão compatível.", "read_buffer_size": "Tamanho do buffer usado para ler arquivos em blocos.", "connection_sync_timer": "Intervalo entre execuções da rotina de sincronização das conexões do Redis.", "allow_cdn_access": "Aceita o IP real encaminhado pelo cabeçalho X-Forwarded-For e usa tokens no lugar da criptografia do caminho das transmissões.<br/>Exige configurar os IPs autorizados para encaminhamento. Recurso de uso avançado.", "stop_failures": "Quantidade de falhas antes de encerrar o monitor da transmissão. Com 3, o monitor para após três falhas e pode ser reiniciado pela rotina de transmissões no minuto seguinte. Use 0 para continuar tentando indefinidamente.", "on_demand_instant_off": "Ao desconectar um cliente de uma transmissão sob demanda, verifica se ainda há espectadores e desliga a transmissão se não houver nenhum.", "on_demand_failure_exit": "Se a transmissão sob demanda falhar ao iniciar, encerra a tentativa e desconecta o cliente. Uma nova conexão fará outra tentativa, evitando tentativas contínuas que ocupem a fonte.", "on_demand_wait_time": "Tempo de espera para iniciar uma transmissão sob demanda. Ao esgotar esse tempo, a conexão é encerrada. Também se aplica a transmissões comuns enquanto iniciam ou estão indisponíveis.", "request_prebuffer": "Solicita um buffer inicial ao provedor para iniciar a reprodução mais rapidamente. Requer um provedor XUI e pode deixar o conteúdo cerca de 10 segundos atrasado.<br/><br/>Pela URL: adiciona ?prebuffer=1. Pelo cabeçalho: envia a solicitação em um cabeçalho, aceito pelo XUI a partir da versão 1.4.4.", "ondemand_balance_equal": "Trata servidores sob demanda como servidores já ativos no balanceamento. Assim, um servidor sob demanda pode ser iniciado mesmo que outro servidor já transmita o mesmo conteúdo.", "on_demand_checker": "Analisa periodicamente o estado, a resolução, os codecs, o FPS e o tempo de resposta das transmissões sob demanda. Registra os erros no banco e verifica uma transmissão por vez em cada servidor.", "on_demand_scan_time": "Intervalo, em segundos, entre as verificações de uma transmissão.", "on_demand_max_probe": "Tempo máximo, em segundos, de análise da transmissão antes de cancelar.", "on_demand_scan_keep": "Tempo de retenção dos registros, em segundos. Afeta as estatísticas de disponibilidade da página de registros. O padrão é 604800 segundos, equivalente a uma semana.", "max_encode_movies": "Máximo de filmes codificados simultaneamente por servidor. Use um valor compatível com a capacidade do servidor; valores maiores são adequados quando todo o conteúdo usa links simbólicos.", "max_encode_cc": "Máximo de canais criados codificados simultaneamente por servidor. Recomenda-se 1, exceto quando todos usam links simbólicos.", "queue_loop": "Intervalo entre as verificações da fila. Se o conteúdo usar links simbólicos, recomenda-se 1 segundo.", "seg_time": "Duração de cada segmento HLS. Os quadros-chave podem impedir a duração exata, mas o valor deve funcionar na maioria das transmissões.", "seg_list_size": "Quantidade de segmentos mantidos na lista HLS.", "seg_delete_threshold": "Quantidade de segmentos antigos mantidos ao gerar a lista HLS. Valores menores economizam RAM, mas mantenha um buffer suficiente para novos clientes. Por exemplo, 30 segundos de buffer precisam de três segmentos de 10 segundos.", "segment_wait_time": "Tempo máximo, em segundos, de espera por um novo segmento. Ao esgotar esse tempo sem novos dados, a conexão do cliente é encerrada.", "stream_max_analyze": "Tempo de análise da transmissão. Um tempo maior melhora a precisão da amostra. 5.000.000 de microssegundos equivalem a 5 segundos.", "probesize": "Quantidade de dados analisados, em bytes.", "ffmpeg_cpu": "Versão do FFmpeg usada para filmes, canais criados e transmissões comuns.<br/><br/>v4.0: versão antiga, de 2018, fornecida originalmente com o XUI.<br/>v4.3.2 e v4.4: versões compiladas pelo XUI com mais bibliotecas e suporte a DASH e NVENC.", "segment_type": "Escolhe -f segment ou -f hls no processamento. A opção hls foi criada para HLS e tende a funcionar melhor. A opção segment desativa o limite de exclusão e é usada por padrão nas transmissões sob demanda para agilizar o início.", "ffmpeg_warnings": "Grava também os avisos do FFmpeg na tabela de erros das transmissões. Ao desativar, grava somente erros.", "ignore_keyframes": "Permite iniciar segmentos fora dos quadros-chave. Pode ajudar alguns players quando o intervalo entre quadros-chave varia, mas prejudicar outros ou causar tela preta no início até o vídeo começar.", "dts_legacy_ffmpeg": "Usa automaticamente o FFmpeg v4.0 em transmissões com áudio DTS. Pode corrigir falhas de sincronização do áudio. A opção de gerar PTS deve estar desativada.", "php_loopback": "Usa o PHP para ler diretamente as transmissões de retorno e gerar HLS, sem passar pelo FFmpeg.", "audio_restart_loss": "Reinicia periodicamente a transmissão se não houver áudio detectado.", "priority_backup": "Retorna à primeira fonte quando ela voltar a funcionar.", "probe_extra_wait": "Tempo de espera adicional após a duração de análise antes de cancelar a verificação da transmissão.", "stream_fail_sleep": "Tempo de espera, em segundos, após uma falha ao iniciar a transmissão antes de tentar novamente.", "fps_delay": "Tempo de espera, em segundos, antes de verificar se o FPS caiu abaixo do limite.", "fps_check_type": "Escolhe entre usar as informações de progresso após o atraso inicial ou analisar um segmento e usar avg_frame_rate para determinar o FPS.", "api_probe": "Usa chamadas de API para analisar as fontes a partir dos servidores XUI.", "show_not_on_air_video": "Exibe este vídeo quando a transmissão estiver fora do ar.", "show_banned_video": "Exibe este vídeo quando uma conta banida tentar acessar uma transmissão.", "show_expired_video": "Exibe este vídeo quando uma conta expirada tentar acessar uma transmissão.", "show_expiring_video": "Exibe este vídeo uma vez por dia durante os sete dias anteriores ao vencimento da conta.", "show_connected_video": "Exibe este vídeo quando o cliente for bloqueado por já estar conectado por outro IP.", "show_all_category_mag": "Exibe a categoria Todos nos dispositivos MAG.", "always_enabled_subtitles": "Mantém as legendas sempre ativadas.", "playback_limit": "Exibe um aviso e interrompe a transmissão após esta quantidade de horas de reprodução contínua.", "tv_channel_default_aspect": "Define a proporção de imagem padrão das transmissões. A opção Ajustar é recomendada.", "mag_default_type": "Define se novos dispositivos usam o tema moderno ou o tema antigo por padrão.", "stalker_theme": "Tema padrão do Ministra usado pelos dispositivos MAG.", "mag_legacy_redirect": "Redireciona /c para a pasta do Ministra com links simbólicos, permitindo o endereço antigo em dispositivos legados. Exige acesso de administrador do servidor e é aplicado pela rotina do minuto seguinte. Não é recomendado por segurança.", "mag_keep_extension": "Mantém a extensão nas URLs de canais ao vivo, conteúdo com deslocamento de tempo e VOD. Alguns dispositivos antigos dependem dela para escolher como reproduzir.", "mag_disable_ssl": "Força os dispositivos MAG a usarem URLs sem SSL. Considere a compatibilidade dos aparelhos antigos antes de desativar a proteção das conexões.", "mag_load_all_channels": "Carrega todos os canais ao iniciar, em vez de aguardar a seleção de uma categoria. Pode ajudar dispositivos antigos que não seguem os padrões do Ministra.", "disable_mag_token": "Desativa a verificação do token MAG durante a reprodução. Pode melhorar a compatibilidade, mas reduz a segurança.", "test_download_url": "URL do arquivo baixado durante o teste de velocidade dos dispositivos MAG.", "mag_message": "Mensagem exibida em Informações, na aba Minha conta. Aceita HTML; quebras de linha são convertidas em &lt;br/&gt;.", "player_allow_playlist": "Permite que os clientes gerem URLs de listas pelo player web.", "player_allow_bouquet": "Permite que os clientes alterem a ordem das suas listas de canais pelo player web.", "player_hide_incompatible": "Oculta transmissões incompatíveis com a maioria dos navegadores, priorizando formatos como H.264 e AV1. Também oculta canais e filmes indisponíveis.", "player_allow_hevc": "Considera HEVC compatível no player web. O suporte depende do navegador, do sistema e dos codecs disponíveis no dispositivo.", "player_blur": "Intensidade do desfoque das imagens de fundo, em pixels.", "player_opacity": "Opacidade das imagens de fundo. O padrão é 10%.", "extract_subtitles": "Extrai automaticamente as legendas de filmes e episódios durante o processamento, permitindo seu uso no player web.", "save_closed_connection": "Tempo de retenção dos registros de atividade, gravados quando uma conexão ativa é encerrada. Eles ajudam no acompanhamento do serviço, mas podem ocupar bastante espaço com muitas conexões.", "client_logs_save": "Tempo de retenção dos registros de clientes. Manter o histórico ajuda a investigar problemas, mas aumenta o espaço usado no banco.", "save_login_logs": "Tempo de retenção dos registros de login. Manter o histórico ajuda a acompanhar os acessos, mas aumenta o espaço usado no banco.", "stream_logs_save": "Tempo de retenção dos registros de erros das transmissões. Manter o histórico ajuda no diagnóstico, mas aumenta o espaço usado no banco.", "save_restart_logs": "Tempo de retenção dos registros de reinicialização das transmissões. Manter o histórico ajuda no diagnóstico, mas aumenta o espaço usado no banco."});
  translations['Importing Series using this method will parse your M3U or folder and push the individual episodes through Watch Folder. If you have category and bouquet allocation set up in Watch Folder Settings then they will be used here too.']='O painel processa a lista M3U ou a pasta e encaminha os episódios pela rotina de pastas monitoradas. As categorias e listas configuradas nessa rotina também serão usadas.';
  function translateSettingsHelp(root) {
    if (!/\/settings(?:\.php)?$/.test(location.pathname)) return;
    var jq = window.jQuery;
    within(root,'label[for]').forEach(function (label) {
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
  function translateStreamHelp(root) {
    if (!/\/stream(?:\.php)?$/.test(location.pathname) || new URLSearchParams(location.search).has('import')) return;
    var jq = window.jQuery;
    within(root,'label[for]').forEach(function (label) {
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
  function replaceLegacyLogos(root) {
    within(root,'img[src="assets/images/logo.png"],img[src$="/assets/images/logo.png"]').forEach(function (image) {
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
  function enhanceModernImages(root) {
    var contentList=/\/(?:streams|movies|series)(?:\.php)?$/.test(location.pathname);
    if(contentList)document.body.classList.add('naxx-content-list');
    within(root,'img[src]').forEach(function(image){
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
  function removeKnowledgebaseLinks(root) {
    within(root,'a').forEach(function (link) {
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
  function translateCacheSettings(root) {
    if (!/\/cache(?:\.php)?$/.test(location.pathname)) return;
    within(root,'.container-fluid p,.card p').forEach(function (paragraph) {
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
    var bindTimer=0,bindGeneration=0;
    frame.__naxxStopMonitor=function(){bindGeneration+=1;window.clearTimeout(bindTimer);bindTimer=0;};
    var bindEvents = function () {
      frame.__naxxStopMonitor();
      var generation=bindGeneration;
      var attempts = 0;
      frame.__naxxRepairAttempted=false;
      var bind = function () {
        bindTimer=0;
        if(generation!==bindGeneration||!frame.isConnected||attempts++>=40)return;
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
        bindTimer=window.setTimeout(bind, 250);
      };
      bindTimer=window.setTimeout(bind, 0);
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
          beforeClose:function(){var frame=this.content&&this.content.find('iframe.mfp-iframe')[0];if(frame&&frame.__naxxStopMonitor)frame.__naxxStopMonitor();if(frame&&frame.__naxxPlayerInstance){try{frame.__naxxPlayerInstance.stop();}catch(error){}}}
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
  function enhance(root) {
    root=root||document;
    if(window.NaxxPerformance&&typeof window.NaxxPerformance.enhance==='function')window.NaxxPerformance.enhance();
    var full=root===document;
    var navigation=containsFeature(root,'.navigation-menu,.topnav-menu,.dropdown-menu');
    var pageTools=containsFeature(root,'.page-title-box,table');
    var dashboard=containsFeature(root,'.card-body.active-connections,.card-body.online-users,.card-body.active-streams,.card-body.offline-streams,.card-body.input-flow,.card-body.output-flow,[id^="s_"][id$="_conns"]');
    removeKnowledgebaseLinks(root);
    if(navigation){addUpdateMenuLink();organizeMenu();}
    replaceLegacyLogos(root);
    enhanceModernImages(root);
    if(window.NaxxMenus&&(navigation||pageTools))window.NaxxMenus.enhance();
    if(window.NaxxDashboard&&dashboard)window.NaxxDashboard.enhance();
    if(full||containsFeature(root,'.page-title-box'))addEpgSyncButton();
    if(containsFeature(root,'#login_button')&&document.getElementById('login_button')){
      document.body.classList.add('naxx-login');
      if(!document.querySelector('.naxx-login-version')){var note=document.createElement('p');note.className='naxx-login-version text-muted text-center';note.textContent='© 2026 XUI NAXX · v1.5.14';document.querySelector('#login_button').after(note);}
    }
    within(root,translationSelector).forEach(translate);
    within(root,'[placeholder],[title],[data-original-title],[data-content]').forEach(function(element){translatedAttributes.forEach(function(attribute){var value=element.getAttribute(attribute);if(value&&translations[value])element.setAttribute(attribute,translations[value]);});});
    translateSettingsHelp(root);
    translateStreamHelp(root);
    translateCacheSettings(root);
    if(window.NaxxCache&&(full||containsFeature(root,'.page-title-box,#datatable-cache,#minute,.jBox-container,.jq-toast-wrap')||(root.nodeType===1&&root.closest('.jBox-container,.jq-toast-wrap'))))window.NaxxCache.enhance();
    if(full){versionBrandStylesheets();setBrandFavicon();}
    enhanceChannelPlayer();
    var pageTitle=document.title;
    if(/\/settings(?:\.php)?$/.test(location.pathname))pageTitle=pageTitle.replace(/\|\s*Settings$/,'| Configurações gerais');
    if(/\/stream(?:\.php)?$/.test(location.pathname) && !new URLSearchParams(location.search).has('import'))pageTitle=pageTitle.replace(/\|\s*Stream$/,'| Adicionar canal');
    within(root,'input[placeholder],input[type="submit"]').forEach(function(input){if(translations[input.placeholder])input.placeholder=translations[input.placeholder];if(translations[input.value])input.value=translations[input.value];});
    within(root,'.copyright').forEach(function(footer){if(footer.dataset.naxxVersion)return;footer.dataset.naxxVersion='1';footer.textContent='© 2026 XUI NAXX · v1.5.14';});
    pageTitle=pageTitle.replace(/^XUI(?:\.one)?\s*\|/, 'XUI NAXX |');
    var titleParts=pageTitle.split('|');if(titleParts.length===2&&translations[titleParts[1].trim()])pageTitle=titleParts[0].trim()+' | '+translations[titleParts[1].trim()];
    if(document.title!==pageTitle)document.title=pageTitle;
    if(location.search.includes('naxx_embed=1'))document.body.classList.add('naxx-embedded');
    within(root,'.logo').forEach(function (logo) {
      if(logo.getAttribute('aria-label')!=='XUI NAXX — página inicial')logo.setAttribute('aria-label', 'XUI NAXX — página inicial');
    });
    within(root,'table.table').forEach(function (table) {
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
    within(root,'.navbar-toggle').forEach(function (toggle) {
      toggle.setAttribute('aria-label', 'Abrir ou fechar menu');
      toggle.setAttribute('aria-controls', 'navigation');
      toggle.setAttribute('aria-expanded', String(toggle.classList.contains('open')));
    });
  }
  function ready() {
    enhance();
    document.documentElement.classList.add('naxx-ready');
    var pendingRoots=new Set(),frame=0,hiddenDirty=false;
    function enqueue(root){
      if(!root||root.nodeType!==1||root.namespaceURI!=='http://www.w3.org/1999/xhtml'||!root.isConnected)return;
      pendingRoots.add(root);
      if(!frame&&!document.hidden)frame=window.requestAnimationFrame(flush);
    }
    function flush(){
      frame=0;
      if(document.hidden)return;
      var roots=Array.from(pendingRoots).filter(function(root){return root.isConnected;});pendingRoots.clear();
      // O DataTables adiciona muitas linhas de uma vez. Cada trecho só passa
      // pelas melhorias uma vez, sem voltar a procurar no documento inteiro.
      var rootSet=new Set(roots);
      roots.filter(function(root){var parent=root.parentElement;while(parent){if(rootSet.has(parent))return false;parent=parent.parentElement;}return true;}).forEach(enhance);
    }
    function textChanged(node){
      var parent=node.parentElement;if(!parent)return;
      var key=(node.nodeValue||'').trim();
      if((translations[key]||/^\d+ (?:Hours?|Days?)$/.test(key))&&parent.matches(translationSelector)){enqueue(parent);return;}
      // Os textos extensos e avisos do cache têm tradução própria no módulo.
      if(/\/cache(?:\.php)?$/.test(location.pathname)&&parent.closest('.jBox-container,.jq-toast-wrap'))enqueue(parent);
      else if(/^Your last cron execution was at /.test(key))enqueue(parent);
    }
    var bodyObserver=new MutationObserver(function(mutations){
      if(document.hidden){hiddenDirty=true;return;}
      mutations.forEach(function(mutation){
        if(mutation.type==='characterData'){textChanged(mutation.target);return;}
        if(mutation.type==='attributes'){
          if(mutation.attributeName==='src'){if(mutation.target.matches('img'))enqueue(mutation.target);}
          else if(translations[mutation.target.getAttribute(mutation.attributeName)])enqueue(mutation.target);
          return;
        }
        var elements=[];
        Array.from(mutation.addedNodes).forEach(function(node){
          if(node.nodeType===3)textChanged(node);
          else if(node.nodeType===1&&node.namespaceURI==='http://www.w3.org/1999/xhtml')elements.push(node);
        });
        if(elements.length>8)enqueue(mutation.target);else elements.forEach(enqueue);
      });
    });
    bodyObserver.observe(document.body,{childList:true,subtree:true,characterData:true,attributes:true,attributeFilter:['src','placeholder','title','data-original-title','data-content']});
    document.addEventListener('visibilitychange',function(){
      if(document.hidden){if(frame)window.cancelAnimationFrame(frame);frame=0;}
      else{if(hiddenDirty){hiddenDirty=false;pendingRoots.clear();enqueue(document.body);}else if(pendingRoots.size&&!frame)frame=window.requestAnimationFrame(flush);}
    });
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
  if (document.readyState !== 'loading') ready();
  else document.addEventListener('DOMContentLoaded', ready, {once:true});
}());

/* Reduz consultas automáticas, sem interferir em reprodução, importações ou ações. */
(function(){
 'use strict';
 if(window.NaxxPerformance)return;
 var later=window.setTimeout.bind(window),cancel=window.clearTimeout.bind(window),pending=new Map(),handles=new Map(),statsMarker={};
 var policy={headerStats:10000,getStats:3000,getGraphStats:60000,refreshInformation:10000};
 function key(callback){
  if(typeof callback!=='function')return null;
  var name=callback.name;
  return Object.prototype.hasOwnProperty.call(policy,name)&&window[name]===callback?name:null;
 }
 function current(item){return item.name==='headerStats'||item.page===window.rCurrentPage;}
 function remove(item){
  if(item.timer!==null)cancel(item.timer);
  if(pending.get(item.name)===item)pending.delete(item.name);
  handles.delete(item.handle);
 }
 function schedule(name,callback,args,delay){
  var previous=pending.get(name);if(previous)remove(previous);
  var item={name:name,callback:callback,args:args,page:window.rCurrentPage,timer:null,handle:null,waiting:false};
  pending.set(name,item);
  item.timer=later(function(){run(item);},delay);
  // O handle que o código nativo recebeu continua válido durante a pausa e
  // após reagendar o timer físico, inclusive para killTimeouts().
  item.handle=item.timer;handles.set(item.handle,item);
  return item.handle;
 }
 function run(item){
  if(pending.get(item.name)!==item)return;
  item.timer=null;
  if(!current(item)){remove(item);return;}
  if(document.hidden){item.waiting=true;return;}
  remove(item);item.callback.apply(window,item.args);
 }
 window.setTimeout=function(callback,delay){
  var name=key(callback),args=Array.prototype.slice.call(arguments,2);
  if(!name)return later.apply(window,arguments);
  return schedule(name,callback,args,Math.max(Number(delay)||0,policy[name]));
 };
 window.clearTimeout=function(id){
  var item=handles.get(id);if(item)remove(item);
  return cancel(id);
 };
 function enhance(){
  var native=window.getStats;
  if(typeof native!=='function'||native.naxxPerformance===statsMarker)return;
  var page=window.rCurrentPage,lastStarted=-Infinity;
  function getStats(){
   var args=Array.prototype.slice.call(arguments);
   // auto=false é a consulta manual nativa: mantém argumentos e retorno.
   if(args[0]===false)return native.apply(this,args);
   if(page!==window.rCurrentPage)return;
   var wait=Math.max(0,policy.getStats-(Date.now()-lastStarted));
   // A resposta lenta nativa chama getStats() diretamente, fora dos timers.
   // Essa entrada também respeita a pausa e o intervalo mínimo.
   if(document.hidden||wait>0){schedule('getStats',getStats,args,wait);return;}
   lastStarted=Date.now();return native.apply(this,args);
  }
  getStats.naxxPerformance=statsMarker;
  window.getStats=getStats;
  var item=pending.get('getStats');
  if(item){if(item.callback===native)item.callback=getStats;else remove(item);}
 }
 document.addEventListener('visibilitychange',function(){
  if(document.hidden)return;
  pending.forEach(function(item){
   if(!current(item)){remove(item);return;}
   if(item.timer!==null)cancel(item.timer);
   item.waiting=false;item.timer=later(function(){run(item);},0);
  });
 });
 window.NaxxPerformance={pollingIntervals:Object.freeze(Object.assign({},policy)),enhance:enhance};
 enhance();
}());

/* Menus nativos: mantém os links e as ações; abre fora da área rolável da tabela. */
(function(){
 'use strict';
 var active=null,bound=false,frame=0;
 function place(){
  frame=0;if(!active)return;
  var menu=active.menu,toggle=active.toggle;
  if(!toggle.isConnected||!active.parent.isConnected){restore();return;}
  var r=toggle.getBoundingClientRect(),vw=document.documentElement.clientWidth,vh=innerHeight;
  if(r.bottom<0||r.top>vh||r.right<0||r.left>vw){window.jQuery(active.toggle).dropdown('hide');restore();return;}
  var width=Math.min(Math.max(active.width,210),vw-24),below=vh-r.bottom-16,above=r.top-16;
  var available=Math.max(80,Math.max(below,above)),height=Math.min(menu.scrollHeight,available,vh-24);
  var top=below>=height||below>=above?r.bottom+6:r.top-height-6;
  menu.style.setProperty('--naxx-menu-width',width+'px');
  menu.style.setProperty('--naxx-menu-height',Math.max(80,Math.min(available,vh-24))+'px');
  menu.style.setProperty('--naxx-menu-left',Math.max(12,Math.min(r.right-width,vw-width-12))+'px');
  menu.style.setProperty('--naxx-menu-top',Math.max(12,Math.min(top,vh-height-12))+'px');
 }
 function requestPlace(){if(active&&!frame)frame=requestAnimationFrame(place);}
 function restore(){
  if(!active)return;var saved=active;active=null;
  saved.menu.classList.remove('naxx-floating-dropdown');
  if(saved.style===null)saved.menu.removeAttribute('style');else saved.menu.setAttribute('style',saved.style);
  if(saved.marker.isConnected)saved.marker.replaceWith(saved.menu);else saved.menu.remove();
 }
 function bind(){
  var jq=window.jQuery;if(bound||!jq||!jq.fn.dropdown)return;bound=true;
  jq(document).on('shown.bs.dropdown.naxxFloating',function(event){
   var parent=event.target;if(!parent.closest||!parent.closest('table,.page-title-box'))return;
   var menu=parent.querySelector(':scope > .dropdown-menu'),toggle=parent.querySelector('[data-toggle="dropdown"]');
   if(!menu||!toggle)return;if(active)restore();
   var marker=document.createComment('naxx-menu');
   active={menu:menu,parent:parent,toggle:toggle,marker:marker,style:menu.getAttribute('style'),width:menu.getBoundingClientRect().width};
   menu.before(marker);document.body.appendChild(menu);menu.classList.add('naxx-floating-dropdown');place();
  });
  jq(document).on('hidden.bs.dropdown.naxxFloating',function(event){if(active&&event.target===active.parent)restore();});
  document.addEventListener('scroll',requestPlace,true);window.addEventListener('resize',requestPlace,{passive:true});
  document.addEventListener('keydown',function(event){
   if(!active||!(active.menu.contains(event.target)||event.target===active.toggle))return;
   if(event.key==='Escape'){event.preventDefault();event.stopImmediatePropagation();var toggle=active.toggle;jq(toggle).dropdown('hide');restore();toggle.focus();}
   else if(['ArrowDown','ArrowUp','Home','End'].indexOf(event.key)!==-1){event.preventDefault();event.stopImmediatePropagation();var items=Array.from(active.menu.querySelectorAll('.dropdown-item:not(.disabled)')).filter(function(x){return x.getBoundingClientRect().height>0;}),index=items.indexOf(document.activeElement);if(!items.length)return;var next=event.key==='Home'?0:event.key==='End'?items.length-1:event.key==='ArrowDown'?(index+1)%items.length:(index<=0?items.length:index)-1;items[next].focus();items[next].scrollIntoView({block:'nearest'});}
  },true);
 }
 function organize(){
  if(!/\/streams(?:\.php)?$/.test(location.pathname))return;
  document.querySelectorAll('.page-title-box .dropdown-menu').forEach(function(menu){
   if(menu.dataset.naxxChannelTools)return;menu.dataset.naxxChannelTools='1';
   var links=Array.from(menu.querySelectorAll(':scope > a')),groups=[['Conteúdo',[]],['Edição em lote',[]],['Manutenção e análise',[]],['Exportação',[]]];
   var importer=document.createElement('a');importer.href='naxx-importador.php';importer.className='dropdown-item';importer.dataset.naxxImportLink='';importer.textContent='Importador';groups[0][1].push(importer);
   links.forEach(function(link){var action=link.getAttribute('onclick')||'',group=2;
    if(/review|stream_categories|channel_order|epgs/.test(action))group=0;
    if(/mass_delete|stream_mass/.test(action))group=1;
    if(link.id==='btn-export-csv')group=3;
    if(/review\?type=1/.test(action))link.textContent='Revisar canais';
    groups[group][1].push(link);
   });
   groups.forEach(function(group){if(!group[1].length)return;var heading=document.createElement('h6');heading.className='dropdown-header';heading.textContent=group[0];menu.appendChild(heading);group[1].forEach(function(link){menu.appendChild(link);});});
  });
 }
 window.NaxxMenus={enhance:function(){bind();organize();if(active)requestPlace();}};
}());

/* Cache e Redis: diagnóstico de leitura, tradução e edição assistida da rotina nativa. */
(function(){
 'use strict';var current=null;
 var words={
 'Maximum Performance':'Recursos de desempenho','Good Performance':'Recursos de desempenho',
 "You're using both Caching and Redis Connection Handler, your service is optimised for":'Cache e gerenciador Redis estão habilitados nas configurações. Confira o diagnóstico abaixo para validar a conexão e o',
 'maximum performance':'estado do serviço',
 'Your last cron execution was at':'A última execução da rotina ocorreu em',
 '. If it takes longer to run a cron than the time between executions, you will have issues as the caching will be cut off before completion.':'. Se a execução demorar mais que o intervalo configurado, o cache poderá ser interrompido antes de terminar.',
 "Please ensure the cron format is correct, otherwise it won't run.":'Confira o formato da rotina; uma expressão inválida impede a execução.',
 'Minute':'Minuto','Hour':'Hora','Thread Count':'Quantidade de threads','Update Changes Only':'Atualizar somente alterações','Streams':'Canais','Lines':'Contas','Series':'Séries','Time Taken':'Tempo de execução',
 'Disable Cache':'Desativar cache','Enable Cache':'Ativar cache','Regenerate Cache':'Reconstruir cache','Save Cron':'Salvar agendamento',
 'Server Status':'Estado do servidor','Authentication':'Autenticação','ONLINE':'Ativo','OFFLINE':'Indisponível','AUTHENTICATED':'Autenticado','VALID PASSWORD':'Autenticação válida','INVALID PASSWORD':'Autenticação inválida',
 'Disable Handler':'Desativar gerenciador','Enable Handler':'Ativar gerenciador','Clear Database':'Limpar dados do Redis','Pros & Cons':'Vantagens e limitações',
 'The handler will allow all connections from clients to load balancers to be verified and managed using Redis rather than through mysql connections.':'O gerenciador valida e administra as conexões dos clientes nos servidores de distribuição usando Redis.',
 'Disabling Redis handler will disconnect all of your active clients, enabling it however should move the live connections from MySQL to Redis without disconnects.':'Desativar o gerenciador Redis desconecta os clientes ativos. Ao ativá-lo, o painel procura transferir as conexões do MySQL para o Redis sem desconectá-las.',
 "Before deciding whether Redis Connection Handler is right for you, you should know a few things. Firstly, enabling Redis will significantly increase XUI's ability to handle connections as the previous bottleneck would be from MySQL not being able to handle the amount of incoming client requests. You'll also find that zap time will be quicker, CPU should be lower and things will generally run quite smoothly.":'O Redis pode ampliar a capacidade de conexões e reduzir a carga do MySQL em servidores movimentados. O resultado depende da quantidade de clientes, das fontes e dos recursos do servidor.',
 'The drawbacks from using Redis is that the live connection database is stored in memory, although a backup is periodically written, restarting XUI can result in connection losses. In addition to this, your ability to filter or search some content in the Admin or Reseller interface will be diminished. For example, with Redis on you can only sort Live Connections by Time Active ascending or descending and you cannot search the live connection list. You also lose the ability to sort by Active Connections in Lines or Content pages etc.':'As conexões ativas ficam na memória. Mesmo com gravações periódicas de backup, reiniciar o painel pode desconectar clientes. Algumas pesquisas e ordenações também ficam limitadas: a lista de conexões pode ser ordenada pelo tempo ativo, mas sua pesquisa e a ordenação por conexões ativas em contas e conteúdo deixam de estar disponíveis.',
 'The best way to decide if Redis is right for you is to try it for yourself.':'Acompanhe os indicadores e o comportamento dos clientes para escolher a configuração adequada ao seu servidor.',
 'Clear':'Limpar','Cancel':'Cancelar','Are you sure you want to clear the Redis database? This will drop all connections.':'Limpar os dados do Redis desconecta todos os clientes ativos. Deseja continuar?',
 'Cache has been completely disabled!':'Cache desativado.','Cache has been completely regenerated!':'Reconstrução do cache solicitada.','Cache has been completely enabled!':'Cache ativado.','Handler has been completely disabled!':'Gerenciador desativado.','Handler has been enabled!':'Gerenciador ativado.','Redis database has been cleared!':'Dados do Redis limpos.','An error occured while processing your request.':'Não foi possível concluir a operação.'
 };
 function translate(){
  var roots=[document.querySelector('.wrapper')].concat(Array.from(document.querySelectorAll('.jBox-container,.jq-toast-wrap')));
  roots.filter(Boolean).forEach(function(root){var walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT),node;
   while((node=walker.nextNode())){if(node.parentElement.closest('script,style,textarea,code,pre,[data-naxx-cache-tools]'))continue;var key=node.nodeValue.replace(/\s+/g,' ').trim(),value=words[key];if(value)node.nodeValue=(/^\s/.test(node.nodeValue)?' ':'')+value+(/\s$/.test(node.nodeValue)?' ':'');}
   root.querySelectorAll('input[type="submit"]').forEach(function(input){if(words[input.value])input.value=words[input.value];});
  });
 }
 function cronPart(value,max){
  if(!value||value.length>128)return false;
  return value.split(',').every(function(part){var match=part.match(/^(\*|\d+(?:-\d+)?)(?:\/(\d+))?$/);if(!match)return false;if(match[2]&&(+match[2]<1||+match[2]>max+1))return false;if(match[1]==='*')return true;var range=match[1].split('-').map(Number);return range.every(function(n){return n>=0&&n<=max;})&&(range.length===1||range[0]<=range[1]);});
 }
 function bytes(value){if(!Number.isFinite(value))return '—';if(value===0)return '0 B';var unit=Math.min(3,Math.floor(Math.log(value)/Math.log(1024)));return new Intl.NumberFormat('pt-BR',{maximumFractionDigits:1}).format(value/Math.pow(1024,unit))+' '+['B','KB','MB','GB'][unit];}
 function mount(){
  var table=document.getElementById('datatable-cache'),minute=document.getElementById('minute'),hour=document.getElementById('hour'),threads=document.getElementById('cache_thread_count');if(!table||!minute||!hour||!threads)return;
  var root=document.createElement('section');root.className='card naxx-cache-tools';root.dataset.naxxCacheTools='';
  root.innerHTML='<div class="card-body"><div class="naxx-cache-tools-heading"><div><h5 class="header-title">Diagnóstico de cache e Redis</h5><p class="text-muted">Indicadores do Redis deste servidor, sem alterar os canais.</p></div><div class="naxx-cache-tool-actions"><button type="button" class="btn btn-primary" data-cache-refresh>Atualizar diagnóstico</button><button type="button" class="btn btn-light" data-cache-report disabled>Baixar relatório</button></div></div><p data-cache-status role="status" aria-live="polite">Consultando o serviço…</p><div class="naxx-cache-metrics">'+[['latency','Tempo de resposta'],['memory','Memória utilizada'],['peak','Pico de memória'],['keys','Chaves armazenadas'],['clients','Clientes Redis'],['rate','Taxa de acertos']].map(function(pair){return '<div><span>'+pair[1]+'</span><strong data-cache-metric="'+pair[0]+'">—</strong></div>';}).join('')+'</div><p class="naxx-cache-diagnostic-note text-muted" data-cache-note></p><label class="naxx-cache-auto"><input type="checkbox" data-cache-auto> Atualizar a cada 30 segundos enquanto esta página estiver visível</label></div>';
  var nativeCard=table.closest('.card');nativeCard.before(root);
  Array.from(document.querySelectorAll('.wrapper .card')).some(function(card){if(card!==nativeCard&&card.querySelector('.progress')){card.classList.add('naxx-cache-performance');return true;}return false;});
  [['#cache','Cache do painel'],['#connections','Conexões Redis']].forEach(function(pair){var link=document.querySelector('.nav-link[href="'+pair[0]+'"]'),span=link&&link.querySelector('span');if(span){span.classList.remove('d-none','d-sm-inline');span.textContent=pair[1];link.setAttribute('aria-label',pair[1]);}});
  var presets=document.createElement('section');presets.className='naxx-cache-presets';presets.innerHTML='<h6>Perfis de agendamento</h6><p class="text-muted">Preencha um perfil e use “Salvar agendamento” para aplicar.</p><div class="naxx-cache-preset-buttons"><button type="button" class="btn btn-light" data-cache-preset="10,1">Econômico · 10 min</button><button type="button" class="btn btn-light" data-cache-preset="5,2">Equilibrado · 5 min</button><button type="button" class="btn btn-light" data-cache-preset="2,2">Mais frequente · 2 min</button><button type="button" class="btn btn-outline-primary" data-cache-restore>Restaurar campos</button></div><p data-cache-schedule role="status"></p></section>';
  table.closest('.form-group').before(presets);
  var form=minute.closest('form'),original={minute:minute.value,hour:hour.value,threads:threads.value},timer=null,controller=null,last=null,pending=false;
  var status=root.querySelector('[data-cache-status]'),refresh=root.querySelector('[data-cache-refresh]'),auto=root.querySelector('[data-cache-auto]'),report=root.querySelector('[data-cache-report]');
  function schedule(){clearTimeout(timer);if(root.isConnected&&auto.checked&&!document.hidden)timer=setTimeout(load,30000);}
  function put(key,value){var node=root.querySelector('[data-cache-metric="'+key+'"]');if(node.textContent!==value)node.textContent=value;}
  async function load(){
   if(pending||!root.isConnected)return;pending=true;refresh.disabled=true;refresh.textContent='Consultando…';controller=new AbortController();var timeout=setTimeout(function(){controller.abort();},12000);
   try{var response=await fetch('naxx-update.php?feature=cache',{credentials:'same-origin',cache:'no-store',signal:controller.signal,headers:{'Accept':'application/json'}}),type=response.headers.get('content-type')||'';if(!type.includes('application/json'))throw new Error('A sessão expirou. Entre novamente no painel.');var data=await response.json();if(!response.ok||!data.ok)throw new Error(data.message||'Não foi possível consultar o diagnóstico.');last=data;report.disabled=false;
    var r=data.redis,online=r.status==='online';status.dataset.state=online?'success':'error';status.textContent=(online?'Redis respondeu':'Redis indisponível')+' · '+new Date(data.checked_at).toLocaleTimeString('pt-BR');
    put('latency',online?r.latency_ms.toLocaleString('pt-BR')+' ms':'—');put('memory',bytes(r.used_memory));put('peak',bytes(r.peak_memory));put('keys',online?r.keys.toLocaleString('pt-BR'):'—');put('clients',online?r.clients.toLocaleString('pt-BR'):'—');put('rate',online&&r.hit_rate!==null?r.hit_rate.toLocaleString('pt-BR')+'%':'—');
    root.querySelector('[data-cache-note]').textContent=online?(data.cache.native_redis_warning?'O Redis local respondeu, mas o painel informa uma falha na conexão ou autenticação. Revise a configuração do gerenciador antes de alterar seu estado.':(r.max_memory?'Limite de memória: '+bytes(r.max_memory)+'. ':'Sem limite de memória definido no Redis. ')+(r.operations_per_second||0)+' operações/s. Clientes Redis incluem processos internos do painel.'):r.message;
    Array.from(table.querySelectorAll('button')).forEach(function(button,index){var value=data.cache.counts[index];if(value&&button.textContent.trim()!==value)button.textContent=value;});
   }catch(error){status.dataset.state='error';status.textContent=error.name==='AbortError'?'O diagnóstico demorou para responder. Tente novamente.':error.message;}
   finally{clearTimeout(timeout);pending=false;refresh.disabled=false;refresh.textContent='Atualizar diagnóstico';schedule();}
  }
  function describe(){
   var validMinute=cronPart(minute.value.trim(),59),validHour=cronPart(hour.value.trim(),23),validThreads=/^\d+$/.test(threads.value)&&+threads.value>=1&&+threads.value<=256;
   minute.setCustomValidity(validMinute?'':'Informe um minuto válido, de 0 a 59, ou uma expressão como */5.');hour.setCustomValidity(validHour?'':'Informe uma hora válida, de 0 a 23, ou * para todas.');threads.setCustomValidity(validThreads?'':'Informe de 1 a 256 threads.');
   var note=presets.querySelector('[data-cache-schedule]');note.dataset.state=validMinute&&validHour&&validThreads?'success':'error';
   var match=minute.value.match(/^\*\/(\d+)$/);note.textContent=!validMinute||!validHour||!validThreads?'Revise os campos de minuto, hora e quantidade de threads.':(match&&hour.value==='*'?'Execução a cada '+match[1]+' minutos.':'Agendamento: minuto '+minute.value+' · hora '+hour.value+'.')+' '+threads.value+' thread(s). Aumentar a frequência ou as threads pode elevar o uso do servidor.';
   return validMinute&&validHour&&validThreads;
  }
  presets.addEventListener('click',function(event){var preset=event.target.closest('[data-cache-preset]');if(preset){var values=preset.dataset.cachePreset.split(',');minute.value='*/'+values[0];hour.value='*';threads.value=values[1];describe();}if(event.target.closest('[data-cache-restore]')){minute.value=original.minute;hour.value=original.hour;threads.value=original.threads;describe();}});
  [minute,hour,threads].forEach(function(input){input.addEventListener('input',describe);});
  function validate(event){if(!describe()){event.preventDefault();event.stopImmediatePropagation();form.reportValidity();}}
  form.addEventListener('submit',validate,true);refresh.addEventListener('click',load);auto.addEventListener('change',schedule);
  function visibility(){clearTimeout(timer);if(auto.checked&&!document.hidden)load();}document.addEventListener('visibilitychange',visibility);
  report.addEventListener('click',function(){if(!last)return;var url=URL.createObjectURL(new Blob([JSON.stringify(last,null,2)],{type:'application/json'})),link=document.createElement('a');link.href=url;link.download='naxx-diagnostico-cache-'+new Date().toISOString().slice(0,10)+'.json';link.click();setTimeout(function(){URL.revokeObjectURL(url);},1000);});
  current={root:root,destroy:function(){clearTimeout(timer);if(controller)controller.abort();document.removeEventListener('visibilitychange',visibility);form.removeEventListener('submit',validate,true);}};
  describe();load();
 }
 window.NaxxCache={enhance:function(){if(!/\/cache(?:\.php)?$/.test(location.pathname)){if(current){current.destroy();current=null;}return;}translate();if(current&&current.root.isConnected)return;if(current)current.destroy();mount();},validCronPart:cronPart};
}());

/* Agrupa os indicadores mantendo os mesmos nós usados pela atualização nativa. */
(function(){
 'use strict';
 function arrange(){
  if(document.querySelector('.naxx-dashboard-stat-shell'))return;
  var selectors=['active-connections','online-users','active-streams','offline-streams','input-flow','output-flow'];
  var columns=[];
  selectors.forEach(function(name){var body=document.querySelector('.card-body.'+name),card=body&&body.closest('.card');if(!card)return;var root=card.parentElement.tagName==='A'?card.parentElement:card,column=root.parentElement;if(columns.indexOf(column)===-1)columns.push(column);});
  if(!columns.length)return;var parent=columns[0].parentElement;if(!columns.every(function(column){return column.parentElement===parent;}))return;
  var shell=document.createElement('div');shell.className='col-12 naxx-dashboard-stat-shell';var grid=document.createElement('div');grid.className='row naxx-dashboard-stat-grid';shell.appendChild(grid);
  columns[0].before(shell);parent.classList.remove('naxx-dashboard-stat-grid');columns.forEach(function(column){grid.appendChild(column);});
 }
 function combine(firstSelector,secondSelector,title,key){
  if(document.querySelector('[data-naxx-stat-group="'+key+'"]'))return;
  var first=document.querySelector(firstSelector),second=document.querySelector(secondSelector);if(!first||!second)return;
  var firstCard=first.closest('.card'),secondCard=second.closest('.card');if(!firstCard||!secondCard||firstCard===secondCard)return;
  var firstLink=firstCard.parentElement.tagName==='A'?firstCard.parentElement:null,secondLink=secondCard.parentElement.tagName==='A'?secondCard.parentElement:null;
  var firstRoot=firstLink||firstCard,secondRoot=secondLink||secondCard,firstColumn=firstRoot.parentElement,secondColumn=secondRoot.parentElement;
  if(firstColumn.parentElement!==secondColumn.parentElement)return;
  var card=document.createElement('div');card.className='card cta-box naxx-joined-stat-card';card.dataset.naxxStatGroup=key;
  var heading=document.createElement('h5');heading.textContent=title;card.appendChild(heading);
  var grid=document.createElement('div');grid.className='naxx-joined-stats';card.appendChild(grid);firstRoot.before(card);
  [[first,firstCard,firstLink],[second,secondCard,secondLink]].forEach(function(parts){var body=parts[0],oldCard=parts[1],link=parts[2];if(link){link.replaceChildren(body);grid.appendChild(link);}else{var item=document.createElement('div');item.appendChild(body);grid.appendChild(item);oldCard.remove();}});
  var labels=key==='channels'?['Ao vivo','Indisponíveis']:key==='network'?['Saída','Entrada']:['Conexões ativas','Contas ativas'];
  first.querySelector('p').textContent=labels[0];second.querySelector('p').textContent=labels[1];
  Array.from(firstColumn.classList).forEach(function(name){var match=name.match(/^(col-(?:(?:sm|md|lg|xl)-)?)(\d+)$/);if(match&&secondColumn.classList.contains(name))firstColumn.classList.replace(name,match[1]+Math.min(12,+match[2]*2));});
  if(!secondColumn.children.length&&!secondColumn.textContent.trim())secondColumn.remove();
 }
 function servers(){
  if(!document.querySelector('.naxx-dashboard-stat-shell'))return;
  document.querySelectorAll('[id^="s_"][id$="_conns"]').forEach(function(counter){
   var body=counter.closest('.card-header'),column=body&&body.parentElement;if(!body||body.classList.contains('naxx-dashboard-server-metrics')||!column||column.classList.contains('naxx-dashboard-server'))return;
   var footer=Array.from(column.children).find(function(child){return child.classList.contains('card-footer');});if(!footer)return;
   column.classList.add('naxx-dashboard-server');var card=document.createElement('div');card.className='card naxx-dashboard-server-card';
   while(column.firstChild)card.appendChild(column.firstChild);column.appendChild(card);body.classList.add('naxx-dashboard-server-metrics');
   var labels={'Streams Live':'Canais ao vivo','Requests /sec':'Requisições/s','MEM':'Memória','IO':'Disco (E/S)','DISK':'Armazenamento'};
   body.querySelectorAll('.header-title').forEach(function(label){var text=label.textContent.replace(/\s+/g,' ').trim();if(labels[text])label.textContent=labels[text];});
  });
 }
 window.NaxxDashboard={enhance:function(){arrange();combine('.card-body.active-connections','.card-body.online-users','Acessos','access');combine('.card-body.output-flow','.card-body.input-flow','Tráfego de rede','network');combine('.card-body.active-streams','.card-body.offline-streams','Canais','channels');servers();}};
}());

/* Limpeza de conteúdo com consulta, autenticação e operações nativas do painel. */
(function () {
  'use strict';
  var definitions = {
    channel:{form:'stream_form', field:'streams', selection:'rStreams', pane:'stream-selection', table:'datatable-md1', action:'mass_delete_streams', label:'canais'},
    movie:{form:'movie_form', field:'movies', selection:'rMovies', pane:'movie-selection', table:'datatable-md2', action:'mass_delete_movies', label:'filmes'},
    series:{form:'series_form', field:'series', selection:'rSeries', pane:'series-selection', table:'datatable-md4', action:'mass_delete_series', label:'séries'},
    episodes:{form:'episodes_form', field:'episodes', selection:'rEpisodes', pane:'episodes-selection', table:'datatable-md5', action:'mass_delete_episodes', label:'episódios'}
  };
  var labels = {channel:'Deletar Canais', movie:'Deletar Filmes', series:'Deletar Séries', all:'Deletar Tudo'};
  // Os endpoints nativos só retornam dados para requisições AJAX identificadas.
  var ajaxHeaders = {'X-Requested-With':'XMLHttpRequest','Accept':'application/json, text/javascript, */*; q=0.01'};
  var active = null, busy = false, cancelled = false, readerController = null, phase = '';
  function ids(type) {
    return Array.from(new Set((window[definitions[type].selection] || []).map(String).filter(function (id) {return /^\d+$/.test(id);})));
  }
  function route(mode, run) {return 'mass_delete?naxx_cleanup=' + mode + (run ? '&naxx_cleanup_run=1' : '');}
  function mode() {
    if (!/\/mass_delete(?:\.php)?$/.test(location.pathname)) return null;
    var value = new URLSearchParams(location.search).get('naxx_cleanup');
    return Object.prototype.hasOwnProperty.call(labels, value) ? value : null;
  }
  function addQuickTools() {
    document.querySelectorAll('[data-naxx-cleanup-menu]').forEach(function (item) {item.remove();});
    if (!/\/quick_tools(?:\.php)?$/.test(location.pathname) || document.querySelector('[data-naxx-quick-cleanup]')) return;
    var nav = document.querySelector('.navigation-menu');
    // A presença do atalho original preserva a permissão de limpeza do usuário.
    var original = nav && nav.querySelector('a[href="mass_delete"],a[href="./mass_delete"],a[href="mass_delete.php"]');
    if (!original) return;
    var heading = document.querySelector('.page-title-box');
    if (!heading) return;
    var card = document.createElement('section'); card.className = 'card'; card.dataset.naxxQuickCleanup = '';
    card.innerHTML = '<div class="card-body"><h2 class="header-title">Limpeza de conteúdo</h2><p class="text-muted">Exclua todos os conteúdos do tipo escolhido, em todas as páginas e categorias. A confirmação mostra a quantidade antes da exclusão.</p><div class="d-flex flex-wrap" style="gap:10px" data-cleanup-actions></div></div>';
    Object.keys(labels).forEach(function (key) {
      var link = document.createElement('a');
      link.href = route(key,true); link.className = 'btn ' + (key === 'all' ? 'btn-danger' : 'btn-outline-danger'); link.dataset.naxxCleanupLink = '';
      var icon = document.createElement('i'); icon.className = (key === 'all' ? 'fas fa-bomb' : 'fas fa-trash-alt') + ' mr-1'; icon.setAttribute('aria-hidden','true');
      link.appendChild(icon); link.appendChild(document.createTextNode(labels[key]));
      card.querySelector('[data-cleanup-actions]').appendChild(link);
    });
    heading.after(card);
  }
  function say(text, error) {
    if (!active) return;
    var status = active.panel.querySelector('[data-cleanup-status]');
    status.className = 'alert ' + (error ? 'alert-danger' : 'alert-info') + ' mt-3 mb-0'; status.textContent = text;
  }
  function markSelection(type, selected) {
    var def = definitions[type], form = document.getElementById(def.form);
    window[def.selection] = selected.slice();
    if (form) form.querySelector('[name="' + def.field + '"]').value = JSON.stringify(selected);
    var lookup = new Set(selected);
    document.querySelectorAll('#' + def.table + ' tbody tr').forEach(function (row) {
      var cell = row.querySelector('td'), match = cell && lookup.has(cell.textContent.trim());
      ['selectedfilter','ui-selected','selected'].forEach(function (name) {row.classList.toggle(name,Boolean(match));});
    });
  }
  function plan(types) {
    return types.map(function (type) {return {type:type, ids:ids(type)};}).filter(function (job) {return job.ids.length;});
  }
  function confirm(jobs, all) {
    var total = jobs.reduce(function (sum,job) {return sum + job.ids.length;},0);
    if (!total) {say(all ? 'Não há conteúdos deste tipo para excluir.' : 'Selecione os conteúdos que deseja excluir nas opções detalhadas.',!all);return false;}
    var summary = jobs.map(function (job) {return job.ids.length + ' ' + definitions[job.type].label;}).join('\n');
    return window.confirm('Confirmar limpeza de conteúdo\n\n' + summary + '\n\nTotal: ' + total + ' conteúdos' + (all ? ' deste escopo, incluindo todas as páginas e categorias.' : ' selecionados.') + '\nA exclusão é permanente. Confirmar?');
  }
  function setBusy(value) {
    busy = value;
    if (!active) return;
    active.panel.querySelectorAll('[data-cleanup-delete-all]').forEach(function (button) {button.disabled=value;});
    active.forms.forEach(function (form) {form.querySelectorAll('[type="submit"],[data-cleanup-select-filter]').forEach(function (button) {button.disabled=value;});});
    active.panel.querySelector('[data-cleanup-cancel]').hidden = !value;
    active.panel.querySelector('[data-cleanup-cancel]').disabled = false;
    active.panel.querySelector('[data-cleanup-cancel]').textContent = phase === 'read' ? 'Cancelar consulta' : 'Interromper após o lote atual';
  }
  function delay(ms) {return new Promise(function (resolve) {window.setTimeout(resolve,ms);});}
  async function readJson(response, operation, deletion) {
    var body = (await response.text()).trim(), result;
    var next = deletion ? ' Atualize a página para conferir o resultado antes de tentar novamente.' : ' Atualize a página e tente novamente.';
    if (!body) throw new Error('O painel retornou uma resposta vazia ' + operation + '.' + next);
    try {result = JSON.parse(body);} catch (error) {throw new Error('O painel retornou uma resposta inválida ' + operation + '.' + next);}
    if (!result || typeof result !== 'object' || Array.isArray(result)) throw new Error('O painel retornou uma resposta inválida ' + operation + '.' + next);
    return result;
  }
  function orderedTypes() {return ['channel','movie','episodes','series'].filter(function (type) {return active.types.indexOf(type) !== -1;});}
  async function readIds(type, all) {
    var jq=window.jQuery,def=definitions[type],attempt=0;
    var params=null;
    while (attempt++ < 75) {
      if (jq && jq.fn.dataTable && jq.fn.dataTable.isDataTable('#'+def.table)) {
        params=jq('#'+def.table).DataTable().ajax.params();
        if (params && params.id) break;
      }
      if (cancelled) throw new Error('Consulta cancelada. Nenhum conteúdo foi excluído.');
      await delay(200);jq=window.jQuery;
    }
    if (!document.getElementById(def.form) || !jq || !jq.fn.dataTable || !jq.fn.dataTable.isDataTable('#'+def.table)) throw new Error('A tabela de '+def.label+' não está disponível. Atualize a página e tente novamente.');
    if (!params || !params.id) throw new Error('A tabela nativa ainda não está pronta.');
    params=jq.extend(true,{},params);
    if (all) {
      // Limpa somente filtros de conteúdo. Mantém o identificador da tabela,
      // include_channels e os parâmetros nativos que definem seu escopo.
      ['category','filter','server','series'].forEach(function (key) {if (Object.prototype.hasOwnProperty.call(params,key)) params[key]='';});
      params.search={value:'',regex:false};
      (params.columns || []).forEach(function (column) {column.search={value:'',regex:false};});
      params.order=[{column:0,dir:'asc'}];
    }
    var selected=new Set(),start=0,target=null;
    do {
      if (cancelled) throw new Error('Consulta cancelada. Nenhum conteúdo foi excluído.');
      params.start=start;params.length=500;
      var response=await fetch('table?'+jq.param(params),{credentials:'same-origin',cache:'no-store',headers:ajaxHeaders,signal:readerController.signal});
      if (!response.ok || /\/(login|license)(?:[?/]|$)/.test(response.url)) throw new Error('Não foi possível consultar os conteúdos. Verifique sua sessão.');
      var result=await readJson(response,'ao consultar '+def.label,false),count=Number(result.recordsFiltered);
      if (!Array.isArray(result.data) || !Number.isSafeInteger(count) || count < 0) throw new Error('A tabela nativa retornou uma resposta inválida.');
      if (target===null) target=count;
      else if (target!==count) throw new Error('A lista mudou durante a consulta. Tente novamente.');
      for (var row of result.data) {
        var id=String(row[0]).replace(/<[^>]*>/g,'').trim();
        if (!/^\d+$/.test(id) || selected.has(id)) throw new Error('A lista mudou durante a consulta ou retornou um identificador inválido. Tente novamente.');
        selected.add(id);
      }
      start+=result.data.length;
      if (start>target || (start<target && !result.data.length)) throw new Error('A lista mudou durante a consulta. Tente novamente.');
      say('Consultando '+def.label+': '+selected.size+' de '+target+'. Nenhum conteúdo foi excluído.');
      if (start<target) await delay(200);
    } while (start<target);
    if (cancelled) throw new Error('Consulta cancelada. Nenhum conteúdo foi excluído.');
    return Array.from(selected);
  }
  async function selectFilter(type) {
    if (busy || !active) return;
    var def=definitions[type];
    cancelled=false;phase='read';readerController=new AbortController();setBusy(true);
    try {
      var selected=await readIds(type,false);markSelection(type,selected);
      say(selected.length+' '+def.label+' selecionados pelo filtro atual. Revise antes de excluir.');
    } catch (error) {say(error.name === 'AbortError' ? 'Seleção cancelada. A seleção anterior foi mantida.' : error.message,true);}
    finally {readerController=null;phase='';setBusy(false);}
  }
  async function deleteAll() {
    if (busy || !active) return;
    cancelled=false;phase='read';readerController=new AbortController();setBusy(true);
    try {
      var jobs=[];
      for (var type of orderedTypes()) {
        var found=await readIds(type,true);if (found.length) jobs.push({type:type,ids:found});
      }
      if (cancelled) throw new Error('Consulta cancelada. Nenhum conteúdo foi excluído.');
      if (!confirm(jobs,true)) {if (jobs.length) say('Exclusão cancelada. Nenhum conteúdo foi excluído.');return;}
      jobs.forEach(function (job) {markSelection(job.type,job.ids);});
      readerController=null;phase='delete';setBusy(true);
      await execute(jobs);
    } catch (error) {say(error.name==='AbortError'?'Consulta cancelada. Nenhum conteúdo foi excluído.':error.message,true);}
    finally {readerController=null;phase='';setBusy(false);}
  }
  async function deleteSelected(onlyType) {
    if (busy || !active) return;
    var types=typeof onlyType==='string'?[onlyType]:orderedTypes();
    var jobs=plan(types.filter(function (type) {return active.types.indexOf(type)!==-1;}));
    if (!confirm(jobs,false)) return;
    cancelled=false;phase='delete';setBusy(true);
    try {await execute(jobs);} finally {phase='';setBusy(false);}
  }
  async function execute(jobs) {
    var sent = 0, total = jobs.reduce(function (sum,job) {return sum + job.ids.length;},0);
    try {
      for (var job of jobs) {
        var def = definitions[job.type], form = document.getElementById(def.form);
        if (!form) throw new Error('O formulário nativo não está disponível.');
        for (var start=0; start<job.ids.length; start+=100) {
          if (cancelled) {say('Limpeza interrompida. ' + sent + ' conteúdos processados; os demais continuam selecionados.');return;}
          var batch = job.ids.slice(start,start+100), data = new FormData(form);
          data.set(def.field,JSON.stringify(batch));
          say('Excluindo ' + def.label + ': ' + sent + ' de ' + total + ' conteúdos processados.');
          var response = await fetch('post.php?action=' + def.action + '&referer=' + encodeURIComponent(route(active.mode)),{method:'POST',body:data,credentials:'same-origin',headers:ajaxHeaders});
          if (!response.ok || /\/(login|license)(?:[?/]|$)/.test(response.url)) throw new Error('O painel recusou a operação. Verifique sua sessão.');
          var result = await readJson(response,'após solicitar a exclusão de '+def.label,true);
          var destination=typeof result.location==='string'?result.location.trim():'';
          if ((result.location!=null&&typeof result.location!=='string') || (!destination && !(result.result === true && Number(result.status) === 1)) || /(?:^|\/)(?:login|license)(?:[?.#]|$)/i.test(destination)) throw new Error('O painel recusou a exclusão (código ' + result.status + ').');
          sent += batch.length;
          var removed = new Set(batch);markSelection(job.type,ids(job.type).filter(function (id) {return !removed.has(id);}));
          await delay(250);
        }
      }
      say('Limpeza concluída: ' + sent + ' conteúdos processados pelo painel.');
      jobs.forEach(function (job) {var jq=window.jQuery;if (jq && jq.fn.dataTable.isDataTable('#' + definitions[job.type].table)) jq('#' + definitions[job.type].table).DataTable().ajax.reload(null,false);});
    } catch (error) {say(error.message + (sent ? ' Já processados: ' + sent + '. A seleção restante foi mantida.' : ''),true);}
  }
  function setup() {
    var selectedMode = mode();
    if (!selectedMode || document.querySelector('[data-naxx-cleanup-panel]')) return;
    var types = selectedMode === 'all' ? ['channel','movie','series','episodes'] : selectedMode === 'series' ? ['series','episodes'] : [selectedMode];
    var forms = types.map(function (type) {return document.getElementById(definitions[type].form);}).filter(Boolean);
    if (!forms.length) return;
    var panel = document.createElement('div');panel.className='card';panel.dataset.naxxCleanupPanel='';
    panel.innerHTML='<div class="card-body"><h2 class="header-title">Limpeza de Conteúdo</h2><p class="text-muted">A limpeza inclui todo o conteúdo do tipo escolhido, em todas as páginas e categorias. Não é necessário selecionar linhas. Confira o total na confirmação.</p><div class="d-flex flex-wrap" style="gap:10px" data-cleanup-modes></div><div class="mt-3 d-flex flex-wrap" style="gap:10px"><button type="button" class="btn btn-danger" data-cleanup-delete-all>Deletar Tudo</button><button type="button" class="btn btn-light" data-cleanup-cancel hidden>Interromper após o lote atual</button></div><div role="status" aria-live="polite" data-cleanup-status></div></div>';
    Object.keys(labels).forEach(function (key) {var link=document.createElement('a');link.className='btn '+(key===selectedMode?'btn-primary':'btn-light');link.href=route(key,true);link.textContent=labels[key];link.dataset.naxxCleanupLink='';if (key===selectedMode) link.setAttribute('aria-current','page');panel.querySelector('[data-cleanup-modes]').appendChild(link);});
    var heading=document.querySelector('.page-title-box');if (heading) heading.after(panel);else forms[0].closest('.card').before(panel);
    active={mode:selectedMode,types:types,forms:forms,panel:panel};
    var pageTitle=document.querySelector('.page-title');if (pageTitle) pageTitle.textContent='Limpeza de Conteúdo';document.title='XUI NAXX | Limpeza de Conteúdo';
    document.querySelectorAll('.nav-pills a[href$="-selection"]').forEach(function (link) {var id=link.getAttribute('href').slice(1);link.closest('li').hidden=!types.some(function (type) {return definitions[type].pane===id;});});
    document.querySelectorAll('.tab-pane').forEach(function (pane) {if (/-selection$/.test(pane.id)) pane.hidden=!types.some(function (type) {return definitions[type].pane===pane.id;});});
    var first=document.querySelector('a[href="#'+definitions[types[0]].pane+'"]');if (first && window.jQuery && window.jQuery.fn.tab) window.jQuery(first).tab('show');
    panel.querySelector('[data-cleanup-delete-all]').textContent=labels[selectedMode];
    panel.querySelector('[data-cleanup-delete-all]').addEventListener('click',deleteAll);
    panel.querySelector('[data-cleanup-cancel]').addEventListener('click',function () {cancelled=true;if (readerController) readerController.abort();say(readerController?'Cancelando consulta…':'Interrompendo após a resposta do lote atual…');});
    var current=new URL(location.href);
    if (current.searchParams.get('naxx_cleanup_run')==='1') {
      current.searchParams.delete('naxx_cleanup_run');
      history.replaceState(history.state,'',current.pathname+current.search+current.hash);
      window.setTimeout(deleteAll,0);
    }
  }
  document.addEventListener('submit',function (event) {
    if (!active || !mode() || active.forms.indexOf(event.target) === -1) return;
    var type=active.types.find(function (key) {return definitions[key].form===event.target.id;});
    event.preventDefault();event.stopImmediatePropagation();
    // Usa o endpoint e os campos nativos, dividindo a seleção em lotes pequenos.
    deleteSelected(type);
  },true);
  document.addEventListener('click',function (event) {
    var anchor=event.target.closest('a[href]');
    if (busy && anchor && anchor.getAttribute('href').charAt(0)!=='#' && !/^javascript:/i.test(anchor.getAttribute('href'))) {
      event.preventDefault();event.stopImmediatePropagation();
      var target=new URL(anchor.href,location.href);
      if (/\/mass_delete(?:\.php)?$/.test(target.pathname)) say('Há uma limpeza em andamento. Aguarde ou interrompa a operação atual.');
      else window.open(anchor.href,'_blank','noopener');
      return;
    }
    var link=event.target.closest('[data-naxx-cleanup-link]');
    if (link && event.button===0 && !event.ctrlKey && !event.metaKey && !event.shiftKey && !event.altKey) {event.preventDefault();event.stopImmediatePropagation();window.location.assign(link.href);}
  },true);
  window.addEventListener('beforeunload',function (event) {if (busy) {event.preventDefault();event.returnValue='';}});
  function enhance() {addQuickTools();setup();}
  function ready() {
    enhance();var scheduled=false;
    new MutationObserver(function (changes) {if (scheduled || !changes.some(function (change) {return change.addedNodes.length;})) return;scheduled=true;window.requestAnimationFrame(function () {scheduled=false;enhance();});}).observe(document.body,{childList:true,subtree:true});
  }
  if (document.readyState==='complete') ready();else window.addEventListener('load',ready,{once:true});
}());
