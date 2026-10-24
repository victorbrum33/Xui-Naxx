/* Nomes dos controles e navegação por teclado sobre os componentes originais. */
(function(){
 'use strict';var bound=false;
 function find(root,selector){var list=Array.from(root.querySelectorAll(selector));if(root.nodeType===1&&root.matches(selector))list.unshift(root);return list;}
 function label(element,text){if(text&&!element.getAttribute('aria-label')&&!element.getAttribute('aria-labelledby'))element.setAttribute('aria-label',text);}
 function actionName(element){
  var action=element.getAttribute('onclick')||'',icon=element.querySelector('i'),classes=icon?icon.className:'',epg=/\/epgs(?:\.php)?$/.test(location.pathname);
  if(element.matches('.search-toggle'))return 'Pesquisar no painel';
  if(element.matches('.nav-user'))return 'Menu da conta';
  if(element.id==='scrollToTop')return 'Ir para o início da página';
  if(element.id==='scrollToBottom')return 'Ir para o fim da página';
  if(/clearFilters\(/.test(action))return 'Limpar filtros';
  if(/refreshTable\(/.test(action))return 'Atualizar lista';
  if(/showFailures\(/.test(action))return 'Ver estado e falhas do canal';
  if(/player\(/.test(action))return 'Reproduzir prévia do canal';
  if(element.matches('[data-toggle="dropdown"]'))return element.closest('table')?'Ações do item':'Mais opções desta página';
  if(element.matches('.page-link')){
   var item=element.parentElement;
   if(item.classList.contains('previous')||/chevron-left/.test(classes))return 'Página anterior';
   if(item.classList.contains('next')||/chevron-right/.test(classes))return 'Próxima página';
  }
  if(/['"]reload['"]/.test(action)||/mdi-refresh/.test(classes))return epg?'Atualizar guia de programação':'Atualizar item';
  if(/['"]delete['"]/.test(action)||/mdi-close|mdi-delete/.test(classes))return epg?'Excluir guia de programação':'Excluir item';
  if(/pencil/.test(classes))return epg?'Editar guia de programação':'Editar item';
  if(/fa-square/.test(classes)&&!action)return 'Estado da transmissão';
  return element.getAttribute('data-original-title')||'';
 }
 function enhance(root){
  root=root||document;
  var main=document.querySelector('.wrapper');
  if(main){
   main.setAttribute('role','main');if(!main.id)main.id='naxx-main-content';main.tabIndex=-1;
   if(!document.querySelector('.naxx-skip-link')){var skip=document.createElement('a');skip.className='naxx-skip-link';skip.href='#'+main.id;skip.textContent='Ir para o conteúdo';document.body.prepend(skip);}
  }
  var nav=document.getElementById('navigation');if(nav){nav.setAttribute('role','navigation');label(nav,'Navegação principal');}
  find(root,'button,a[href],[role="button"]').forEach(function(element){
   if(element.matches('[data-toggle="tab"],.nav-user'))label(element,element.textContent.trim()||actionName(element));
   else if(!element.textContent.trim())label(element,actionName(element));
   if(element.id==='scrollToTop'||element.id==='scrollToBottom'){
    label(element,actionName(element));element.setAttribute('role','button');
    var button=element.querySelector(':scope > button');if(button){var span=document.createElement('span');span.className=button.className;span.setAttribute('aria-hidden','true');while(button.firstChild)span.appendChild(button.firstChild);button.replaceWith(span);}
   }
   if(element.tagName==='A'){
    var child=element.querySelector(':scope > button');if(child&&!child.getAttribute('onclick')){label(element,actionName(child)||child.textContent.trim());if(element.getAttribute('aria-label')){child.tabIndex=-1;child.setAttribute('aria-hidden','true');}}
   }
  });
  find(root,'input[data-switchery="true"],.switchery').forEach(function(node){
   var input=node.tagName==='INPUT'?node:node.previousElementSibling,visual=input&&input.nextElementSibling;
   if(!input||input.type!=='checkbox'||!visual||!visual.classList.contains('switchery'))return;
   input.classList.add('naxx-switch-input');input.parentElement.classList.add('naxx-switch-field');visual.setAttribute('aria-hidden','true');
   if(!input.labels||!input.labels.length){var column=input.parentElement.previousElementSibling;if(column)label(input,column.textContent.replace(/\s+/g,' ').trim());}
  });
  [['minute','Minuto da rotina'],['hour','Hora da rotina'],['cache_thread_count','Quantidade de threads da rotina']].forEach(function(pair){var control=document.getElementById(pair[0]);if(control)label(control,pair[1]);});
  if(!bound){bound=true;document.addEventListener('click',function(event){var skip=event.target.closest('.naxx-skip-link');if(skip){var target=document.querySelector('.wrapper');if(target){event.preventDefault();target.focus();}}});document.addEventListener('keydown',function(event){if(event.key===' '&&event.target.matches('#scrollToTop,#scrollToBottom')){event.preventDefault();event.target.click();}});}
 }
 window.NaxxAccessibility={enhance:enhance};
 if(document.readyState!=='loading')enhance();
}());
