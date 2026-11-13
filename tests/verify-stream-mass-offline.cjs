/* Edição em massa: contrato nativo sintético em JSDOM; sem HTTP nem salvamento real. */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
let JSDOM, VirtualConsole;
try {({JSDOM, VirtualConsole} = require(process.env.NAXX_JSDOM || 'jsdom'));}
catch (error) {throw new Error('Instale jsdom ou defina NAXX_JSDOM para executar esta verificação offline.', {cause:error});}
const source = fs.readFileSync(path.join(__dirname, '../xui-naxx/src/stream-mass-ui.js'), 'utf8');
function deferred() {let resolve,reject;const promise = new Promise((yes,no) => {resolve=yes;reject=no;});return {promise,resolve,reject};}
const pause = () => new Promise(resolve => setImmediate(resolve));
async function until(check, message) {for(let count=0;count<100;count++){if(check())return;await pause();}assert.fail(message);}
const ids = values => Array.from(values, String);
function fixture(options = {}) {
  const errors=[], events=[], requests=[], saved=[], data=new WeakMap();
  const virtualConsole=new VirtualConsole();virtualConsole.on('jsdomError',error=>errors.push(error.message));
  const dom=new JSDOM('<!doctype html><h1>Edição em massa <small id="selected_count"></small></h1><form action="#" method="POST"><input type="hidden" name="streams" id="streams" value="rascunho-anterior"><input type="hidden" name="server_tree_data" id="server_tree_data" value="[]"><input type="hidden" name="od_tree_data" id="od_tree_data" value="[]"><div id="stream-selection" class="tab-pane"><div class="row"><div><input id="stream_search" value="notícias & esportes"></div><div><select id="stream_server_id"><option value="1" selected>Servidor 1</option><option value="2">Servidor 2</option></select></div><div><select id="category_search"><option value="12" selected>Categoria 12</option><option value="13">Categoria 13</option></select></div><div><select id="stream_filter"><option value="5" selected>Sob demanda</option><option value="6">Direto</option></select></div><div><select id="show_entries"><option value="50">50</option><option value="250" selected>250</option><option value="1000">1000</option><option value="2500">2500</option><option value="5000">5000</option></select></div><div><button type="button" onclick="toggleStreams()" data-native-toggle>Alternar página</button></div></div><div class="dataTables_wrapper"><table id="datatable-mass"><thead><tr><th>ID</th><th>Ícone</th><th>Nome</th><th>Categoria</th><th>Servidor</th><th>Status</th></tr></thead><tbody></tbody></table></div></div><div id="stream-details"><input type="checkbox" name="c_bouquets" checked><select id="bouquets" name="bouquets[]" multiple><option value="77" selected>Destino</option></select><select name="bouquets_type"><option value="add" selected>Adicionar</option></select><input name="user_agent" value="Agente preservado"><input name="disabled_native" value="não enviar" disabled><input type="checkbox" name="restart_on_edit" checked><input name="submit_stream" type="submit" value="Editar canais"></div></form>', {url:'https://naxx.example.test'+(options.pathname||'/stream_mass'),runScripts:'outside-only',virtualConsole});
  const {window}=dom, document=window.document;
  Object.defineProperty(document,'readyState',{value:'complete',configurable:true});
  const originalRects=window.HTMLElement.prototype.getClientRects;
  window.HTMLElement.prototype.getClientRects=function(){for(let node=this;node&&node.nodeType===1;node=node.parentElement){if(node.hidden||node.style.display==='none'||node.style.visibility==='hidden')return [];}return this.isConnected?[{width:100,height:20}]:[];};
  window.requestAnimationFrame=callback=>window.setTimeout(()=>callback(window.performance.now()),0);
  window.cancelAnimationFrame=window.clearTimeout.bind(window);
  window.fetch=()=>{assert.fail('nenhuma requisição HTTP é permitida no teste');};
  const form=document.querySelector('form'), table=document.getElementById('datatable-mass'), body=table.tBodies[0], header=table.tHead.rows[0];
  const rows=[];let length=250,draws=0,initialized=true;
  window.rCurrentPage='stream_mass';window.rSelected=(options.selected||['900','2']).slice();
  const nativeRowCallback=function(row,rowData){if(window.rSelected.includes(rowData[0]))row.classList.add('selectedfilter','ui-selected','selected');};
  const settings={nTable:table,ajax:{url:'./table',data(params){params.id='stream_list';params.category=document.getElementById('category_search').value;params.server=document.getElementById('stream_server_id').value;params.filter=document.getElementById('stream_filter').value;}},aoRowCallback:[{fn:nativeRowCallback,sName:'user'}]};
  const params={draw:7,start:250,length:250,id:'stream_list',category:'12',server:'1',filter:'5',search:{value:'notícias & esportes',regex:false},order:[{column:0,dir:'desc'}],columns:Array.from({length:6},(_,index)=>({data:index,name:'',searchable:true,orderable:true,search:{value:'',regex:false}}))};
  const api={
    settings:()=>[settings],
    ajax:{params:()=>params,url:()=>settings.ajax.url,reload(_callback,reset){draws++;assert.equal(reset,false);emit('preXhr',table,settings,params);return api;}},
    page:Object.assign(()=>api,{info:()=>({recordsTotal:20,recordsDisplay:options.filteredCount??5,start:params.start,length}),len(value){if(value===undefined)return length;length=Number(value);params.length=length;return api;}}),
    search(value){if(value===undefined)return params.search.value;params.search.value=value;return api;},
    row(row){return {data:()=>data.get(typeof row==='string'?document.querySelector(row):row),node:()=>row};},
    rows(){return {nodes:()=>({toArray:()=>rows.slice(),each(callback){rows.forEach(callback);}}),data:()=>({toArray:()=>rows.map(row=>data.get(row))}),count:()=>rows.length,every(callback){for(const row of rows)callback.call({node:()=>row,data:()=>data.get(row)});}};},
    draw(reset){draws++;emit('preXhr',table,settings,params);for(const row of rows){if(data.has(row))for(const callback of settings.aoRowCallback)callback.fn(row,data.get(row));}emit('draw',table,settings);return api;}
  };
  let selectable={filter:'tr',selected(_event,ui){const row=ui.selected,key=row.cells[0]?.textContent||'';if(row.classList.contains('selectedfilter')){row.classList.remove('selectedfilter','ui-selected','selected');window.rSelected.splice(window.rSelected.indexOf(key),1);}else{row.classList.add('selectedfilter','ui-selected','selected');window.rSelected.push(key);}document.getElementById('selected_count').textContent=' - '+window.rSelected.length+' selected';}};
  const originalSelected=selectable.selected;
  function matchEvent(stored,name){return stored.split('.')[0]===name.split('.')[0];}
  function emit(name,target,...args){for(const entry of events.slice()){if(!entry.names.some(stored=>matchEvent(stored,name)))continue;if(entry.target!==target&&entry.target!==document)continue;if(entry.selector&&!target.matches(entry.selector))continue;entry.callback.call(target,{target,type:name.split('.')[0]},...args);}}
  function jq(value){
    const nodes=typeof value==='string'?[...document.querySelectorAll(value)]:[value];
    const result={
      0:nodes[0],length:nodes.length,
      on(names,selector,callback){if(typeof selector==='function'){callback=selector;selector=null;}for(const target of nodes)events.push({target,names:names.split(/\s+/),selector,callback});return result;},
      off(namespace){for(let at=events.length-1;at>=0;at--)if(nodes.includes(events[at].target)&&events[at].names.some(name=>name.includes(namespace)))events.splice(at,1);return result;},
      DataTable(){assert.equal(nodes[0],table);return api;},
      selectable(operation,key,value){assert.equal(nodes[0],table);if(operation==='instance')return {options:selectable};if(operation==='option'){if(typeof key==='object'){Object.assign(selectable,key);return result;}if(arguments.length===2)return selectable[key];selectable[key]=value;return result;}if(typeof operation==='object')Object.assign(selectable,operation);return result;},
      data(key){if(key==='ui-selectable')return {options:selectable};return undefined;},
      trigger(name,args=[]){for(const node of nodes)emit(name,node,...(Array.isArray(args)?args:[args]));return result;},
      each(callback){nodes.forEach((node,index)=>callback.call(node,index,node));return result;},
      addClass(names){for(const node of nodes)node.classList.add(...names.split(/\s+/));return result;},
      removeClass(names){for(const node of nodes)node.classList.remove(...names.split(/\s+/));return result;},
      hasClass(name){return Boolean(nodes[0]?.classList.contains(name));},
      text(value){if(value===undefined)return nodes[0]?.textContent;for(const node of nodes)node.textContent=value;return result;},
      val(value){if(value===undefined)return nodes[0]?.value;for(const node of nodes)node.value=value;return result;},
      prop(name,value){if(value===undefined)return nodes[0]?.[name];for(const node of nodes)node[name]=value;return result;}
    };return result;
  }
  jq.fn={dataTable:{isDataTable:node=>node===table&&initialized},selectable(){}};
  window.jQuery=window.$=jq;
  window.NaxxStreamSources={filteredIds:async (target,signal)=>{
    assert.equal(target,table,'consulta usa a tabela nativa de edição em massa');
    assert(signal instanceof window.AbortSignal,'consulta recebe cancelamento');
    assert.equal(params.id,'stream_list');
    const request={target,signal,params:JSON.parse(JSON.stringify(params))};requests.push(request);
    return options.collect?options.collect(request,requests.length,h):['1','2','3','4','5'];
  }};
  function addRow(key,options={}){
    const row=document.createElement('tr'),rowData=[String(key),'',options.name||'Canal '+key,'Categoria','Servidor','<button>ON</button>'];
    for(const value of rowData){const cell=document.createElement('td');cell.textContent=value;row.appendChild(cell);}body.appendChild(row);
    if(options.hidden)row.hidden=true;
    if(options.data!==false)data.set(row,rowData);
    rows.push(row);nativeRowCallback(row,rowData);return row;
  }
  addRow('1');addRow('2');addRow('3');addRow('4',{hidden:true});addRow('1');addRow('bad');addRow('0');addRow('777',{data:false});
  window.toggleStreams=function(){for(const row of table.rows){const key=row.cells[0]?.textContent||'';if(row.classList.contains('selected')){row.classList.remove('selected');if(key)window.rSelected.splice(window.rSelected.indexOf(key),1);}else{row.classList.add('selected');if(key)window.rSelected.push(key);}}};
  const nativeToggle=window.toggleStreams;
  document.querySelector('[data-native-toggle]').addEventListener('click',()=>window.toggleStreams());
  document.getElementById('show_entries').addEventListener('change',event=>api.page.len(event.target.value).draw());
  document.getElementById('stream_search').addEventListener('keyup',event=>api.search(event.target.value).draw());
  for(const id of ['category_search','stream_server_id','stream_filter'])document.getElementById(id).addEventListener('change',()=>{settings.ajax.data(params);api.ajax.reload(null,false);});
  form.addEventListener('submit',event=>{event.preventDefault();document.getElementById('server_tree_data').value=JSON.stringify([{id:'source',parent:'#'},{id:'1',parent:'source'}]);document.getElementById('streams').value=JSON.stringify(window.rSelected);if(window.rSelected.length)saved.push({action:window.rCurrentPage,data:new window.FormData(form)});});
  const h={window,document,dom,form,table,header,rows,api,params,settings,requests,saved,errors,addRow,emit,
    get selected(){return ids(window.rSelected);},get selectable(){return selectable;},originalSelected,nativeRowCallback,nativeToggle,
    button(name){const button=document.querySelector('[data-naxx-mass="'+name+'"]');assert(button,'controle de seleção '+name);return button;},
    click(name){this.button(name).click();},
    selectRow(row){selectable.selected({target:row},{selected:row});},
    setFilter(id,value,event='change'){const element=document.getElementById(id);element.value=value;element.dispatchEvent(new window.Event(event,{bubbles:true}));},
    redraw(){api.draw(false);},draws:()=>draws,
    replaceSelection(value){window.rSelected=value.slice();},
    close(){window.HTMLElement.prototype.getClientRects=originalRects;dom.window.close();assert.deepEqual(errors,[],'zero erros no DOM');}
  };
  window.eval(source);assert(window.NaxxStreamMass&&typeof window.NaxxStreamMass.enhance==='function');window.NaxxStreamMass.enhance();
  return h;
}

(async()=>{
  {
    const h=fixture();
    try{
      assert.equal(h.document.getElementById('show_entries').value,'250','não redefine a quantidade de entradas nativa');
      assert.equal(h.selectable.filter,'tbody tr','cabeçalho não participa da seleção jQuery UI');
      assert.notEqual(h.selectable.selected,h.originalSelected);
      assert.equal(h.settings.aoRowCallback[0].fn,h.nativeRowCallback,'preserva callback nativo de redesenho');
      for(const name of ['visible','all','clear','cancel'])assert.equal(h.button(name).type,'button');
      h.click('visible');assert.deepEqual(h.selected,['900','2','1','3'],'adiciona visíveis válidos uma vez e preserva seleção fora da página');
      assert.equal(h.header.classList.contains('selected'),false,'nunca marca cabeçalho');
      assert.equal(h.rows[3].classList.contains('selected'),false,'não inclui linha oculta');
      h.click('visible');assert.deepEqual(h.selected,['900','2','1','3'],'selecionar visíveis é explícito e idempotente');
      h.selectRow(h.header);h.selectRow(h.rows[5]);h.selectRow(h.rows[7]);assert.deepEqual(h.selected,['900','2','1','3'],'cabeçalho/ID inválido/linha sem dados não removem a última seleção');
      h.selectRow(h.rows[1]);assert.deepEqual(h.selected,['900','1','3'],'ação individual usa strings compatíveis com o formulário nativo');
      const redrawn=h.addRow('900');h.redraw();assert(redrawn.classList.contains('selected'),'rowCallback encontra ID string selecionado fora da página');
      h.window.NaxxStreamMass.enhance();h.window.NaxxStreamMass.enhance();
      assert.equal(h.document.querySelectorAll('[data-naxx-mass="visible"]').length,1,'enhance repetido não duplica controles');
      assert.notEqual(h.window.toggleStreams,h.nativeToggle);
      h.document.querySelector('[data-native-toggle]').click();
      assert.deepEqual(h.selected,['900','1','3','2'],'ícone nativo também adiciona visíveis sem inverter nem perder escolhas ocultas');
      assert.equal(h.header.classList.contains('selected'),false);
      h.click('clear');assert.deepEqual(h.selected,[],'limpar remove explicitamente inclusive seleções fora da página');
      assert.equal(h.header.classList.contains('selected'),false);assert.equal(h.saved.length,0,'selecionar e limpar não salvam o formulário');
    }finally{h.close();}
    console.log('Edição em massa: seleção visível explícita, IDs string, sem cabeçalho/duplicados/inválidos, escolhas ocultas preservadas e limpeza global.');
  }
  {
    const h=fixture();
    try{
      h.click('all');await until(()=>h.requests.length===1&&h.selected.includes('5'),'todos os filtrados deve concluir');
      assert.deepEqual(h.selected,['900','2','1','3','4','5']);
      assert.deepEqual(h.requests[0].params,{...h.params},'consulta mantém parâmetros nativos id=stream_list, categoria, servidor, filtro, busca e colunas');
      assert.equal(h.saved.length,0);assert.equal(h.document.getElementById('streams').value,'rascunho-anterior','não publica seleção no formulário antes de salvar');
      h.setFilter('show_entries','2500');assert.equal(h.api.page.len(),2500,'evento nativo show_entries continua funcionando');
      h.setFilter('category_search','13');h.setFilter('stream_server_id','2');h.setFilter('stream_filter','6');h.setFilter('stream_search','nova busca','keyup');
      assert.equal(h.params.category,'13');assert.equal(h.params.server,'2');assert.equal(h.params.filter,'6');assert.equal(h.params.search.value,'nova busca');
      h.form.dispatchEvent(new h.window.Event('submit',{bubbles:true,cancelable:true}));
      assert.equal(h.saved.length,1,'salvamento continua sob o submit nativo explícito');
      const saved=h.saved[0];assert.equal(saved.action,'stream_mass');assert.deepEqual(JSON.parse(saved.data.get('streams')),h.selected);
      assert.deepEqual(saved.data.getAll('bouquets[]'),['77']);assert.equal(saved.data.get('bouquets_type'),'add');assert.equal(saved.data.get('user_agent'),'Agente preservado');assert.equal(saved.data.get('restart_on_edit'),'on');assert.equal(saved.data.get('disabled_native'),null);
      assert(JSON.parse(saved.data.get('server_tree_data')).some(node=>node.id==='1'&&node.parent==='source'));
    }finally{h.close();}
    console.log('Todos filtrados: consulta usa o contrato stream_list; paginação/filtros e submit nativo com campos avançados permanecem intactos.');
  }
  {
    const result=deferred(),h=fixture({collect:()=>result.promise});
    try{
      h.click('all');await until(()=>h.requests.length===1,'consulta de todos deve começar');
      assert.deepEqual(h.selected,['900','2'],'consulta não publica seleção parcial');
      h.click('cancel');assert.equal(h.requests[0].signal.aborted,true,'cancelamento aborta a consulta');
      h.replaceSelection(['991']);result.resolve(['1','2','3']);await pause();await pause();
      assert.deepEqual(h.selected,['991'],'resposta tardia cancelada não sobrescreve nova seleção');assert.equal(h.saved.length,0);
      assert.equal(h.button('all').disabled,false,'consulta liberada após cancelar');assert.equal(h.button('cancel').hidden,true);
    }finally{result.resolve([]);h.close();}
    for(const reason of ['network','permission','native_page','catalog_changed']){
      const result=deferred(),h=fixture({collect:()=>result.promise});
      try{
        h.click('all');await until(()=>h.requests.length===1,'consulta deve começar antes do erro');
        h.replaceSelection(['992']);result.reject(new Error(reason));await pause();await pause();
        assert.deepEqual(h.selected,['992'],'erro '+reason+' não reverte seleção nova nem publica coleta parcial');assert.equal(h.saved.length,0);assert.equal(h.button('all').disabled,false);assert.equal(h.button('cancel').hidden,true);
      }finally{h.close();}
    }
    console.log('Cancelamento/erro: sem seleção parcial ou salvamento; respostas tardias preservam novas escolhas do usuário.');
  }
  {
    for(const invalid of [{ids:['1']},['1','0','3'],['1','inválido'],['1','9007199254740992']]){
      const h=fixture({collect:async()=>invalid});
      try{
        h.click('all');await until(()=>h.requests.length===1&&!h.button('all').disabled,'resposta inválida deve encerrar a consulta');
        assert.deepEqual(h.selected,['900','2'],'valida todo o resultado antes de alterar o rascunho');assert.equal(h.saved.length,0);
      }finally{h.close();}
    }
    for(const action of ['row','visible','clear']){
      const result=deferred(),h=fixture({collect:()=>result.promise});
      try{
        h.click('all');await until(()=>h.requests.length===1,'consulta deve começar antes da ação manual');
        if(action==='row')h.selectRow(h.rows[0]);else h.click(action);
        const after=h.selected;
        assert.equal(h.requests[0].signal.aborted,true,'ação '+action+' invalida a consulta anterior');
        result.resolve(['7','8']);await pause();await pause();
        assert.deepEqual(h.selected,after,'resposta antiga não desfaz a ação manual '+action);assert.equal(h.saved.length,0);
      }finally{result.resolve([]);h.close();}
    }
    console.log('Resultado inválido e ações manuais durante a consulta: aplicação atômica e descarte de respostas antigas.');
  }
  {
    const result=deferred(),h=fixture({collect:()=>result.promise});
    try{
      h.click('all');await until(()=>h.requests.length===1,'consulta deve começar');
      h.setFilter('category_search','13');h.replaceSelection(['993']);result.resolve(['1','2','3']);await pause();await pause();
      assert.deepEqual(h.selected,['993'],'mudança de filtro invalida resposta tardia sem sobrescrever seleção nova');
      assert.equal(h.saved.length,0);
    }finally{result.resolve([]);h.close();}
    console.log('Escopo alterado durante a coleta: resposta antiga é descartada, mantendo o rascunho atual.');
  }
  {
    const result=deferred(),h=fixture({collect:()=>result.promise});
    try{
      h.click('all');await until(()=>h.requests.length===1,'consulta deve começar antes de destruir a tabela');
      h.emit('destroy',h.table,h.settings);h.replaceSelection(['994']);result.resolve(['1','2']);await pause();await pause();
      assert.equal(h.requests[0].signal.aborted,true);assert.deepEqual(h.selected,['994']);
      assert.equal(h.document.querySelector('[data-naxx-mass="visible"]'),null);assert.equal(h.window.toggleStreams,h.nativeToggle,'restaura função nativa na desmontagem');
    }finally{result.resolve([]);h.close();}
    const other=fixture({pathname:'/streams'});
    try{
      assert.equal(other.document.querySelector('[data-naxx-mass]'),null,'não monta em outra página');
      assert.equal(other.window.toggleStreams,other.nativeToggle);assert.equal(other.selectable.selected,other.originalSelected);assert.deepEqual(other.selected,['900','2']);
    }finally{other.close();}
    console.log('Navegação/desmontagem: aborta coleta, restaura função nativa e não interfere em outras páginas.');
  }
  console.log('OK: edição em massa verificada offline; nenhuma requisição real ou POST.');
})().catch(error=>{console.error(error.stack);process.exitCode=1;});
