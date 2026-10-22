/* Agrupa os indicadores mantendo os mesmos nós usados pela atualização nativa. */
(function(){
 'use strict';
 function combine(firstSelector,secondSelector,title,key){
  if(document.querySelector('[data-naxx-stat-group="'+key+'"]'))return;
  var first=document.querySelector(firstSelector),second=document.querySelector(secondSelector);if(!first||!second)return;
  var firstCard=first.closest('.card'),secondCard=second.closest('.card');if(!firstCard||!secondCard||firstCard===secondCard)return;
  var firstLink=firstCard.parentElement.tagName==='A'?firstCard.parentElement:null,secondLink=secondCard.parentElement.tagName==='A'?secondCard.parentElement:null;
  var firstRoot=firstLink||firstCard,secondRoot=secondLink||secondCard,firstColumn=firstRoot.parentElement,secondColumn=secondRoot.parentElement;
  if(firstColumn.parentElement!==secondColumn.parentElement)return;
  firstColumn.parentElement.classList.add('naxx-dashboard-stat-grid');
  var card=document.createElement('div');card.className='card cta-box naxx-joined-stat-card';card.dataset.naxxStatGroup=key;
  var heading=document.createElement('h5');heading.textContent=title;card.appendChild(heading);
  var grid=document.createElement('div');grid.className='naxx-joined-stats';card.appendChild(grid);firstRoot.before(card);
  [[first,firstCard,firstLink],[second,secondCard,secondLink]].forEach(function(parts){var body=parts[0],oldCard=parts[1],link=parts[2];if(link){link.replaceChildren(body);grid.appendChild(link);}else{var item=document.createElement('div');item.appendChild(body);grid.appendChild(item);oldCard.remove();}});
  var labels=key==='channels'?['Ao vivo','Indisponíveis']:key==='network'?['Saída','Entrada']:['Conexões ativas','Contas ativas'];
  first.querySelector('p').textContent=labels[0];second.querySelector('p').textContent=labels[1];
  Array.from(firstColumn.classList).forEach(function(name){var match=name.match(/^(col-(?:(?:sm|md|lg|xl)-)?)(\d+)$/);if(match&&secondColumn.classList.contains(name))firstColumn.classList.replace(name,match[1]+Math.min(12,+match[2]*2));});
  if(!secondColumn.children.length&&!secondColumn.textContent.trim())secondColumn.remove();
 }
 window.NaxxDashboard={enhance:function(){combine('.card-body.active-connections','.card-body.online-users','Acessos','access');combine('.card-body.output-flow','.card-body.input-flow','Tráfego de rede','network');combine('.card-body.active-streams','.card-body.offline-streams','Canais','channels');}};
}());
