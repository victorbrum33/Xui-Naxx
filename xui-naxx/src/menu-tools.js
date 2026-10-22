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
