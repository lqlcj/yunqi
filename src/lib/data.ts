import { useSyncExternalStore } from 'react';
import { DEFAULT_SETTINGS, validateRecord, dayKey } from '../../shared/domain.mjs';
import type { Entry,Mutation,Settings } from '../types';

interface State {
  rows:Entry[]; pending:number; loaded:boolean; authorized:boolean;
  session:'checking'|'connected'|'offline'|'expired'|'error'; syncing:boolean;
  error:string; lastSync:string|null; storagePersistent:boolean;
}
let state:State={rows:[],pending:0,loaded:false,authorized:false,session:'checking',syncing:false,error:'',lastSync:null,storagePersistent:false};
const listeners=new Set<()=>void>();
function update(p:Partial<State>){state={...state,...p};listeners.forEach(l=>l());}
export function useJournal(){return useSyncExternalStore(cb=>{listeners.add(cb);return()=>listeners.delete(cb);},()=>state);}
export function settingsOf(rows:Entry[]):Settings{return (rows.find(r=>r.kind==='settings')?.payload??DEFAULT_SETTINGS) as Settings;}
let opening:Promise<IDBDatabase>|null=null;
function database(){
  if(!opening)opening=new Promise<IDBDatabase>((resolve,reject)=>{
    const req=indexedDB.open('little-days-journal',1);
    req.onupgradeneeded=()=>{
      req.result.createObjectStore('records',{keyPath:'id'});
      req.result.createObjectStore('outbox',{keyPath:'seq',autoIncrement:true});
      req.result.createObjectStore('meta',{keyPath:'key'});
    };
    req.onsuccess=()=>{req.result.onversionchange=()=>req.result.close();resolve(req.result);};req.onerror=()=>reject(req.error);
    req.onblocked=()=>reject(new Error('请关闭旧页面后再打开应用'));
  });return opening;
}
const request=<T>(req:IDBRequest<T>)=>new Promise<T>((resolve,reject)=>{req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);});
const complete=(tx:IDBTransaction)=>new Promise<void>((resolve,reject)=>{tx.oncomplete=()=>resolve();tx.onabort=tx.onerror=()=>reject(tx.error??new Error('本机保存失败，请检查存储空间'));});
async function getMeta(key:string){const db=await database();return (await request(db.transaction('meta').objectStore('meta').get(key)))?.value;}
async function setMeta(key:string,value:unknown){const db=await database();const tx=db.transaction('meta','readwrite');const done=complete(tx);tx.objectStore('meta').put({key,value});await done;}
const channel=typeof BroadcastChannel!=='undefined'?new BroadcastChannel('little-days-changes'):null;
channel?.addEventListener('message',()=>{void refresh();});
export async function refresh(){
  const db=await database();const tx=db.transaction(['records','outbox','meta']);
  const [rows,pending,access]=await Promise.all([request(tx.objectStore('records').getAll()) as Promise<Entry[]>,request(tx.objectStore('outbox').count()),request(tx.objectStore('meta').get('authorized'))]);
  update({rows,pending,authorized:Boolean(access?.value)});
}
function storageMessage(e:unknown){return e instanceof DOMException && e.name==='QuotaExceededError'?'手机存储空间不足，本次未保存。请释放空间后重试。':e instanceof Error?e.message:'保存失败，请重试';}
export async function saveRecord(record:Entry){
  validateRecord(record);
  try {
    const db=await database();const tx=db.transaction(['records','outbox'],'readwrite');const done=complete(tx);
    tx.objectStore('records').put(record);
    tx.objectStore('outbox').add({mutationId:crypto.randomUUID(),recordId:record.id,record} satisfies Mutation);
    await done;await refresh();channel?.postMessage('changed');void sync();
  }catch(e){throw new Error(storageMessage(e));}
}
export function newRecord(kind:Entry['kind'],payload:Entry['payload'],occurredAt=new Date().toISOString()):Entry {
  const now=new Date().toISOString();return{id:kind==='settings'?'settings':crypto.randomUUID(),kind,payload,occurredAt,createdAt:now,updatedAt:now,deletedAt:null};
}
export async function startContraction(){
  const db=await database();const tx=db.transaction(['records','outbox'],'readwrite');const done=complete(tx);
  const rows=await request(tx.objectStore('records').getAll()) as Entry[];
  const active=rows.find(r=>r.kind==='contraction'&&!r.deletedAt&&!r.payload.endAt);
  if(!active){const record=newRecord('contraction',{endAt:null,pain:null,note:''});tx.objectStore('records').put(record);tx.objectStore('outbox').add({mutationId:crypto.randomUUID(),recordId:record.id,record});}
  await done;await refresh();channel?.postMessage('changed');void sync();
}
export async function removeRecord(record:Entry){await saveRecord({...record,updatedAt:new Date().toISOString(),deletedAt:new Date().toISOString()});}
class ApiError extends Error{constructor(message:string,public status:number){super(message);}}
export async function api<T>(path:string,body?:unknown):Promise<T>{
  const controller=new AbortController();const timeout=setTimeout(()=>controller.abort(),15000);
  try {
    const response=await fetch(path,{method:body===undefined?'GET':'POST',credentials:'same-origin',headers:body===undefined?{}:{'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body),signal:controller.signal,cache:'no-store'});
    const data=await response.json();if(!response.ok)throw new ApiError(data.error??'请求失败',response.status);return data;
  }finally{clearTimeout(timeout);}
}
let syncing:Promise<void>|null=null;
async function performSync(){
  if(!state.authorized || !navigator.onLine){if(state.authorized)update({session:'offline'});return;}
  update({syncing:true,error:''});
  try{
    do{
      const db=await database();
      const queued=(await request(db.transaction('outbox').objectStore('outbox').getAll()) as Mutation[]).slice(0,100);
      const result=await api<{records:Entry[];acknowledged:string[]}>('/api/sync',{mutations:queued.map(({mutationId,record})=>({mutationId,record}))});
      for(const r of result.records)validateRecord(r);
      const tx=db.transaction(['records','outbox'],'readwrite');const done=complete(tx);
      const store=tx.objectStore('outbox');
      const acks=new Set(result.acknowledged);
      for(const q of queued)if(acks.has(q.mutationId) && q.seq!==undefined)store.delete(q.seq);
      // Read remaining queued edits in the same transaction; a response must never overwrite an edit made while uploading.
      const remaining=await request(store.getAll()) as Mutation[];
      const pendingIds=new Set(remaining.map(m=>m.recordId));
      for(const row of result.records)if(!pendingIds.has(row.id))tx.objectStore('records').put(row);
      await done;await refresh();
      const now=new Date().toISOString();await setMeta('lastSync',now);
      update({session:'connected',lastSync:now});channel?.postMessage('changed');
      if(!state.pending)break;
    }while(navigator.onLine);
  }catch(e){
    update({session:e instanceof ApiError?(e.status===401?'expired':'error'):'offline',error:e instanceof ApiError?e.message:''});
  }finally{update({syncing:false});}
}
export function sync(){
  if(syncing)return syncing;
  syncing=(async()=>{if(navigator.locks)await navigator.locks.request('little-days-sync',performSync);else await performSync();})().finally(()=>{syncing=null;});
  return syncing;
}
let initialized=false;
export async function initialize(){
  if(initialized)return;initialized=true;
  try{
    await refresh();const authorized=Boolean(await getMeta('authorized'));
    update({authorized,lastSync:await getMeta('lastSync')??null,loaded:true});
    try{
      const session=await api<{authenticated:boolean}>('/api/session');
      if(session.authenticated){await setMeta('authorized',true);update({authorized:true,session:'connected'});await sync();}
      else update({session:'expired'});
    }catch{update({session:'offline'});}
    update({storagePersistent:await navigator.storage?.persisted?.()??false});
  }catch(e){update({loaded:true,error:storageMessage(e)});}
  window.addEventListener('online',()=>void sync());
  window.addEventListener('offline',()=>update({session:'offline'}));
  document.addEventListener('visibilitychange',()=>{if(!document.hidden){void refresh();void sync();}});
  setInterval(()=>{if(!document.hidden && state.authorized)void sync();},60000);
}
export async function login(password:string){
  await api('/api/login',{password});await setMeta('authorized',true);update({authorized:true,session:'connected',error:''});
  try{update({storagePersistent:await navigator.storage?.persist?.()??false});}catch{}
  await sync();
}
export async function logout(){
  await sync();await refresh();
  if(state.pending)throw new Error('还有记录未同步，请联网完成同步后再退出');
  if(state.rows.some(r=>!r.deletedAt && r.kind==='contraction' && !r.payload.endAt))throw new Error('请先结束正在进行的宫缩计时');
  await api('/api/logout',{});
  const db=await database();const tx=db.transaction(['records','outbox','meta'],'readwrite');const done=complete(tx);
  for(const name of ['records','outbox','meta'])tx.objectStore(name).clear();await done;
  update({rows:[],pending:0,authorized:false,session:'expired',lastSync:null});channel?.postMessage('changed');
}
export async function importBackup(text:string){
  let backup;try{backup=JSON.parse(text);}catch{throw new Error('文件不是有效的 JSON 备份');}
  if(!backup || typeof backup!=='object' || backup.version!==1 || backup.app!=='little-days' || !Array.isArray(backup.records) || backup.records.length>50000)throw new Error('备份格式不支持');
  const ids=new Set();for(const r of backup.records){validateRecord(r);if(ids.has(r.id))throw new Error('备份包含重复记录');ids.add(r.id);}
  const db=await database();const tx=db.transaction(['records','outbox'],'readwrite');const done=complete(tx);
  const existing=await request(tx.objectStore('records').getAll()) as Entry[];
  const map=new Map(existing.map(r=>[r.id,r]));
  if((backup.records as Entry[]).some(r=>map.has(r.id)&&map.get(r.id)!.kind!==r.kind)){
    tx.abort();await done.catch(()=>{});throw new Error('已有记录的类型不可修改');
  }
  // Restore merges older files safely: a backup cannot undo a newer edit or deletion.
  const incoming=(backup.records as Entry[]).filter(r=>!map.has(r.id) || Date.parse(r.updatedAt)>Date.parse(map.get(r.id)!.updatedAt));
  for(const record of incoming){tx.objectStore('records').put(record);tx.objectStore('outbox').add({mutationId:crypto.randomUUID(),recordId:record.id,record});}
  await done;await refresh();channel?.postMessage('changed');void sync();return incoming.length;
}
export function download(content:BlobPart,name:string,type:string){
  const url=URL.createObjectURL(new Blob([content],{type}));const link=document.createElement('a');link.href=url;link.download=name;document.body.appendChild(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);
}
export async function downloadServerBackup(){
  const response=await fetch('/api/backup',{credentials:'same-origin',cache:'no-store'});
  if(!response.ok){const error=await response.json();throw new Error(error.error??'下载失败，请重试');}
  download(await response.blob(),`青孕期健康记录服务器备份_${dayKey()}.sqlite`,'application/vnd.sqlite3');
}
