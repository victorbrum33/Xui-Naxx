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
