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
