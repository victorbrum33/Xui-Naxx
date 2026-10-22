/* Interface autenticada para o atualizador do Xui Naxx; nenhuma credencial do GitHub no navegador. */
(function () {
  'use strict';
  var copy = {
    idle: ['Pronto para verificar', 'Consulte o canal de atualizações para saber se há uma nova versão.'],
    checking: ['Verificando atualizações', 'O andamento será atualizado automaticamente nesta tela.'],
    installing: ['Instalando atualização', 'Aguarde a conclusão. O andamento será atualizado automaticamente nesta tela.'],
    restoring: ['Restaurando versão anterior', 'Aguarde a conclusão da restauração dos arquivos.'],
    up_to_date: ['Seu painel está atualizado', 'A versão publicada já está instalada neste painel.'],
    available: ['Atualização disponível', 'Você pode instalar agora ou ativar a instalação automática.'],
    error: ['A atualização não foi concluída', 'Confira o motivo abaixo. Você pode verificar novamente quando o problema for resolvido.']
  };
  function text(node, value) {value = String(value);if (node.textContent !== value) node.textContent = value;}
  function validState(value) {return value && typeof value === 'object' && !Array.isArray(value) && typeof value.busy === 'boolean' && typeof value.automatic === 'boolean' && typeof value.status === 'string';}
  function version(value) {return typeof value === 'string' && value.trim() ? value.slice(0, 100) : 'Não identificada';}
  function date(value) {
    if (typeof value !== 'string' || !value) return 'Ainda não realizada';
    var parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return 'Data indisponível';
    return new Intl.DateTimeFormat('pt-BR', {day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'}).format(parsed);
  }
  function mount(root, options) {
    if (!root || root.dataset.naxxUpdateMounted) return;
    root.dataset.naxxUpdateMounted = '1';root.classList.add('naxx-update-root');
    options = options || {};
    var endpoint = options.endpoint || 'naxx-update.php', state = null, csrf = '', pending = false, unavailable = false, poll = null, controller = null, destroyed = false;
    root.innerHTML = '<header class="naxx-update-heading"><div><h1>Atualização do painel</h1><p>Mantenha o Xui Naxx atualizado.</p></div><button type="button" class="btn btn-light" data-update-check>Verificar agora</button></header>' +
      '<div class="naxx-update-notice" data-update-notice role="status" aria-live="polite" hidden></div><div class="naxx-update-layout">' +
      '<section class="card"><div class="card-body"><h2 class="header-title">Versão do painel</h2><dl class="naxx-update-versions"><div><dt>Instalada</dt><dd data-update-installed>—</dd><small>Neste servidor</small></div><div><dt>Disponível</dt><dd data-update-available>—</dd><small data-update-available-help>Aguardando verificação</small></div></dl>' +
      '<div class="naxx-update-state" data-update-state role="status" aria-live="polite" data-state="idle"><span class="naxx-update-state-dot" aria-hidden="true"></span><div><strong data-update-status>Carregando informações</strong><p data-update-status-help>Consultando o serviço de atualização.</p></div></div>' +
      '<p class="naxx-update-error" data-update-error role="alert" hidden></p><div class="naxx-update-actions"><button type="button" class="btn btn-primary" data-update-install disabled>Instalar atualização</button></div><p class="naxx-update-last-check">Última verificação: <span data-update-checked>Ainda não realizada</span></p></div></section>' +
      '<section class="card naxx-update-automatic"><div class="card-body"><h2 class="header-title">Atualização automática</h2><label class="naxx-update-switch"><input type="checkbox" role="switch" data-update-automatic disabled><span>Instalar atualizações automaticamente</span></label><p>Quando ativada, o painel verifica diariamente e instala as atualizações disponíveis. Você também pode atualizar manualmente.</p><p class="naxx-update-source">Canal de atualizações<a data-update-repository target="_blank" rel="noopener noreferrer" hidden></a><span data-update-source-loading>Carregando canal…</span></p></div></section>' +
      '<section class="card naxx-update-history"><div class="card-body"><div class="naxx-update-history-heading"><h2 class="header-title">Atualizações recentes</h2><button type="button" class="btn btn-light" data-update-rollback disabled>Restaurar versão anterior</button></div><ol class="naxx-update-history-list" data-update-history></ol><p class="naxx-update-history-empty" data-update-history-empty>As instalações concluídas aparecerão aqui.</p></div></section></div>';
    function query(selector) {return root.querySelector(selector);}
    function notice(value, error) {var node=query('[data-update-notice]');node.hidden=!value;node.dataset.tone=error?'error':'info';text(node,value||'');}
    function stopPoll() {if (poll) window.clearTimeout(poll);poll=null;}
    function dispose() {destroyed=true;stopPoll();if(controller)controller.abort();document.removeEventListener('visibilitychange',visibility);}
    function connected() {if (destroyed) return false;if(!root.isConnected){dispose();return false;}return true;}
    function schedule(delay) {stopPoll();if(connected()&&state&&state.busy&&!document.hidden)poll=window.setTimeout(loadStatus,delay||2000);}
    function controls() {
      var busy=!!(state&&state.busy), ready=!!state&&!!csrf&&!unavailable;
      query('[data-update-check]').disabled=pending;
      text(query('[data-update-check]'),pending?'Aguarde…':unavailable?'Reconectar':busy?'Atualizar status':'Verificar agora');
      query('[data-update-install]').disabled=pending||busy||!ready||state.status!=='available'||!state.available;
      query('[data-update-automatic]').disabled=pending||busy||!ready;
      query('[data-update-rollback]').disabled=pending||busy||!ready||!Array.isArray(state.history)||!state.history.length;
      root.setAttribute('aria-busy',String(pending||busy));
    }
    function render(next) {
      state=next;
      text(query('[data-update-installed]'),version(state.installed));
      text(query('[data-update-available]'),state.available?version(state.available):'—');
      text(query('[data-update-available-help]'),state.status==='available'&&state.available===state.installed?'Nova revisão disponível':state.status==='up_to_date'?'Versão atual':state.available?'No canal de atualizações':'Aguardando verificação');
      var status=copy[state.status]||['Estado indisponível','Verifique novamente para consultar o andamento.'];
      query('[data-update-state]').dataset.state=Object.prototype.hasOwnProperty.call(copy,state.status)?state.status:'idle';
      text(query('[data-update-status]'),status[0]);text(query('[data-update-status-help]'),status[1]);
      var error=typeof state.error==='string'?state.error.slice(0,2000):'';
      query('[data-update-error]').hidden=!error;text(query('[data-update-error]'),error);
      text(query('[data-update-checked]'),date(state.checkedAt));
      query('[data-update-automatic]').checked=state.automatic;
      var repository=typeof state.repository==='string'?state.repository:'';
      var validRepository=/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository);
      query('[data-update-repository]').hidden=!validRepository;query('[data-update-source-loading]').hidden=validRepository;
      if(validRepository){query('[data-update-repository]').href='https://github.com/'+repository;text(query('[data-update-repository]'),repository);}
      else text(query('[data-update-source-loading]'),'Canal indisponível');
      var entries=Array.isArray(state.history)?state.history.slice(0,5):[],list=query('[data-update-history]');
      // Dados de versão e histórico são texto; nunca são interpretados como HTML.
      list.replaceChildren();
      entries.forEach(function(entry){if(!entry||typeof entry!=='object')return;var item=document.createElement('li'),label=document.createElement('strong'),time=document.createElement('time');text(label,'Versão '+version(entry.version));text(time,date(entry.installedAt));if(typeof entry.installedAt==='string'&&!Number.isNaN(Date.parse(entry.installedAt)))time.dateTime=entry.installedAt;item.append(label,time);list.appendChild(item);});
      query('[data-update-history-empty]').hidden=!!list.children.length;
      controls();
    }
    async function request(action, extra) {
      controller=new AbortController();var current=controller,timeout=window.setTimeout(function(){current.abort();},20000);
      try{
        var init={method:action?'POST':'GET',credentials:'same-origin',cache:'no-store',signal:current.signal,headers:{'Accept':'application/json','X-Requested-With':'XMLHttpRequest'}};
        if(action){init.headers['Content-Type']='application/json';init.body=JSON.stringify(Object.assign({action:action,csrf:csrf},extra||{}));}
        var response=await fetch(endpoint,init);
        if(response.redirected||/\/(?:login|license)(?:[/?#.]|$)/i.test(response.url))throw new Error('Sua sessão expirou. Entre novamente no painel.');
        var raw=await response.text(),result;
        if(!raw.trim())throw new Error('O serviço retornou uma resposta vazia. Clique em Reconectar para consultar o resultado antes de tentar novamente.');
        try{result=JSON.parse(raw);}catch(_){throw new Error('O serviço retornou uma resposta inválida. Clique em Reconectar para consultar o resultado antes de tentar novamente.');}
        if(!result||typeof result!=='object'||Array.isArray(result))throw new Error('Não foi possível confirmar o estado da atualização. Clique em Reconectar.');
        if(!response.ok||result.ok!==true)throw new Error(typeof result.message==='string'?result.message:typeof result.error==='string'?result.error:response.status===403?'Sua sessão expirou ou seu usuário não tem permissão para atualizar. Entre novamente no painel.':'Não foi possível concluir a solicitação (HTTP '+response.status+').');
        if(!validState(result.state))throw new Error('O serviço retornou um estado inválido. Clique em Reconectar.');
        if(!action&&(typeof result.csrf!=='string'||!result.csrf))throw new Error('Não foi possível validar sua sessão. Entre novamente no painel para atualizar.');
        if(typeof result.csrf==='string'&&result.csrf)csrf=result.csrf;
        return result.state;
      }catch(error){if(error.name==='AbortError')throw new Error('O serviço demorou para responder. Reconecte para consultar o resultado antes de enviar outra solicitação.');if(error instanceof TypeError)throw new Error('A conexão com o painel foi interrompida. Reconecte para acompanhar a atualização.');throw error;}
      finally{window.clearTimeout(timeout);if(controller===current)controller=null;}
    }
    async function loadStatus() {
      if(!connected()||pending)return;
      stopPoll();pending=true;controls();
      try{var next=await request();if(!connected())return;unavailable=false;render(next);notice('');}
      catch(error){if(connected()){unavailable=true;notice(error.message,true);}}
      finally{pending=false;if(connected()){controls();schedule(unavailable?8000:2000);}}
    }
    async function perform(action, extra) {
      if(!connected()||pending||!state||state.busy||!csrf||unavailable)return;
      stopPoll();pending=true;controls();notice('');
      try{var next=await request(action,extra);if(!connected())return;unavailable=false;render(next);if(action==='automatic')notice(next.automatic?'Atualização automática ativada.':'Atualização automática desativada.');}
      catch(error){if(connected()){unavailable=true;notice(error.message,true);if(state)render(state);}}
      finally{pending=false;if(connected()){controls();schedule(unavailable?8000:2000);}}
    }
    query('[data-update-check]').addEventListener('click',function(){if(!state||!csrf||state.busy||unavailable)loadStatus();else perform('check');});
    query('[data-update-install]').addEventListener('click',function(){if(state&&state.status==='available')perform('install');});
    query('[data-update-automatic]').addEventListener('change',function(event){var enabled=event.target.checked;event.target.checked=!!(state&&state.automatic);perform('automatic',{enabled:enabled});});
    query('[data-update-rollback]').addEventListener('click',function(){if(window.confirm('Restaurar os arquivos da versão anterior? A restauração usa o último backup da atualização.'))perform('rollback');});
    function visibility(){if(document.hidden)stopPoll();else if(state&&state.busy)loadStatus();}
    document.addEventListener('visibilitychange',visibility);window.addEventListener('pagehide',dispose,{once:true});
    controls();loadStatus();
    return {refresh:loadStatus,destroy:dispose};
  }
  function start() {
    var isPage=/\/naxx-update-page(?:\.php)?$/.test(location.pathname),query=new URLSearchParams(location.search);
    if(!isPage&&!(/\/settings(?:\.php)?$/.test(location.pathname)&&query.get('naxx_update')==='1'))return;
    if(document.getElementById('naxx-update-root'))return;
    var container=document.querySelector('.wrapper > .container-fluid')||document.querySelector('.wrapper .container-fluid');
    var nativeForm=container&&container.querySelector(':scope > form');
    if(!container||!nativeForm)return;
    nativeForm.hidden=true;var root=document.createElement('div');root.id='naxx-update-root';container.insertBefore(root,nativeForm);
    document.title='Xui Naxx | Atualização';mount(root);
  }
  window.NaxxUpdateUI={mount:mount,start:start};
  if(document.readyState==='complete')start();else window.addEventListener('load',start,{once:true});
}());
