import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp,mkdir,readFile,rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join,resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { once } from 'node:events';
import { openDatabase,allRecords,applyMutations,dailyBackup } from '../server/database.mjs';
import { createApp } from '../server/app.mjs';
const password='test-only-long-random-password';
const now='2026-11-22T16:00:00.000Z';
const record=(id='sugar-1',value=4.8)=>({id,kind:'glucose',occurredAt:now,createdAt:now,updatedAt:now,deletedAt:null,payload:{value,slot:'fasting'}});
test('SQLite mutations are atomic, repeat-safe and preserve tombstones and remeasurements',()=>{
  const db=openDatabase(':memory:');
  const m={mutationId:'m1',record:record()};applyMutations(db,[m]);
  applyMutations(db,[{mutationId:'m2',record:record('sugar-1',5.2)}]);
  applyMutations(db,[m]);assert.equal(allRecords(db).find(r=>r.id==='sugar-1').payload.value,5.2);
  applyMutations(db,[{mutationId:'m3',record:record('sugar-2',5.0)}]);
  assert.equal(allRecords(db).filter(r=>r.kind==='glucose').length,2);
  assert.throws(()=>applyMutations(db,[{mutationId:'m4',record:record('sugar-3')},{mutationId:'m5',record:{...record('bad'),payload:{slot:'fasting',value:0}}}]));
  assert.equal(allRecords(db).some(r=>r.id==='sugar-3'),false);
  applyMutations(db,[{mutationId:'m6',record:{...record(),deletedAt:now}}]);
  assert.equal(allRecords(db).find(r=>r.id==='sugar-1').deletedAt,now);db.close();
});
test('online SQLite backup is readable and contains complete records',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'little-days-backup-'));const db=openDatabase(join(dir,'journal.sqlite'));
  try{applyMutations(db,[{mutationId:'backup-m',record:record()}]);const file=await dailyBackup(db,join(dir,'backups'));const copy=new DatabaseSync(file,{readOnly:true});assert.equal(copy.prepare('PRAGMA integrity_check').get().integrity_check,'ok');assert.equal(copy.prepare('SELECT count(*) AS n FROM records').get().n,2);copy.close();}finally{db.close();await rm(dir,{recursive:true,force:true});}
});
test('HTTP auth, CSRF protection, sync, private backup and logout work together',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'little-days-api-'));await mkdir(join(dir,'backups'));const db=openDatabase(join(dir,'journal.sqlite'));
  const origin='http://localhost:3000';const app=createApp({db,password,origin,staticDir:resolve('dist'),backupDir:join(dir,'backups'),logger:{error(){}}});
  app.listen(0,'127.0.0.1');await once(app,'listening');const base=`http://127.0.0.1:${app.address().port}`;
  const post=(path,body,cookie='',site=origin)=>fetch(base+path,{method:'POST',headers:{'Content-Type':'application/json',Origin:site,Cookie:cookie},body:JSON.stringify(body)});
  try{
    let r=await post('/api/sync',{mutations:[]});assert.equal(r.status,401);
    r=await fetch(base+'/api/backup');assert.equal(r.status,401);
    r=await post('/api/login',{password},'','https://evil.example');assert.equal(r.status,403);
    r=await post('/api/login',{password:'wrong'});assert.equal(r.status,401);
    r=await post('/api/login',{password});assert.equal(r.status,200);
    const setCookie=r.headers.get('set-cookie');assert.match(setCookie,/HttpOnly/);assert.match(setCookie,/SameSite=Strict/);const cookie=setCookie.split(';')[0];
    r=await post('/api/sync',{mutations:[{mutationId:'http-m',record:record()}]},cookie);assert.equal(r.status,200);const body=await r.json();assert.equal(body.records.length,2);assert.deepEqual(body.acknowledged,['http-m']);
    r=await post('/api/sync',{mutations:[{mutationId:'http-bad',record:{...record(),payload:{slot:'fasting',value:-1}}}]},cookie);assert.equal(r.status,400);
    r=await fetch(base+'/api/backup',{headers:{Cookie:cookie}});assert.equal(r.status,200);const bytes=Buffer.from(await r.arrayBuffer());assert.equal(bytes.subarray(0,15).toString(),'SQLite format 3');
    r=await fetch(base+'/');assert.equal(r.status,200);assert.match(r.headers.get('content-security-policy'),/frame-ancestors 'none'/);assert.match(await r.text(),/青孕期健康记录/);
    r=await fetch(base+'/.env');assert.equal(r.status,404);
    r=await post('/api/logout',{},cookie);assert.equal(r.status,200);
    r=await post('/api/sync',{mutations:[]},cookie);assert.equal(r.status,401);
  }finally{app.closeAllConnections();await new Promise(resolve=>app.close(resolve));db.close();await rm(dir,{recursive:true,force:true});}
});
