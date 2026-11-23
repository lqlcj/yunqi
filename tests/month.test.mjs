import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp,mkdir,readFile,rm,writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join,resolve } from 'node:path';
import { once } from 'node:events';
import { DatabaseSync } from 'node:sqlite';
import { spawnSync } from 'node:child_process';
import { openDatabase,applyMutations,allRecords,dailyBackup } from '../server/database.mjs';
import { createApp } from '../server/app.mjs';
import { dayKey,validateRecord,recordsCsv,contractionMetrics,DEFAULT_SETTINGS } from '../shared/domain.mjs';
import { monthFixture,parseCsv } from './fixtures/month.mjs';
const fixture=monthFixture();
const mutations=fixture.records.map(record=>({mutationId:`insert-${record.id}`,record}));
function insertMonth(db){for(let i=0;i<mutations.length;i+=100)applyMutations(db,mutations.slice(i,i+100));}

test('30 complete days: four glucose slots, unlimited BP, all pain levels, remeasurements',()=>{
  assert.equal(fixture.dates.length,30);assert.ok(fixture.records.length>300);
  for(const day of fixture.dates){const rows=fixture.records.filter(r=>dayKey(r.occurredAt)===day);assert.deepEqual(new Set(rows.filter(r=>r.kind==='glucose').map(r=>r.payload.slot)),new Set(['fasting','breakfast','lunch','dinner']));assert.ok(rows.some(r=>r.kind==='pressure'));assert.ok(rows.some(r=>r.kind==='contraction'));}
  assert.deepEqual(new Set(fixture.records.filter(r=>r.kind==='contraction').map(r=>r.payload.pain)),new Set([null,'none','mild','moderate','strong']));
  assert.ok(fixture.dates.some(day=>fixture.records.filter(r=>r.kind==='pressure'&&dayKey(r.occurredAt)===day).length===4));
  fixture.records.forEach(r=>assert.doesNotThrow(()=>validateRecord(r)));
});
test('entire month survives replayed batches, server reopen, SQLite backup and empty-directory restore',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'qing-month-db-'));const file=join(dir,'journal.sqlite');let db=openDatabase(file);
  try{
    insertMonth(db);insertMonth(db);assert.equal(allRecords(db).filter(r=>r.kind!=='settings').length,fixture.summary.total);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM mutations').get().n,fixture.summary.total);
    const backup=await dailyBackup(db,join(dir,'backups'));db.close();db=openDatabase(file);
    assert.deepEqual(allRecords(db).filter(r=>r.kind!=='settings'),fixture.records);
    const restored=join(dir,'restored');const result=spawnSync(process.execPath,['server/restore.mjs',backup,'--server-stopped'],{cwd:resolve('.'),env:{...process.env,DATA_DIR:restored},encoding:'utf8'});
    assert.equal(result.status,0,result.stderr);const copy=new DatabaseSync(join(restored,'journal.sqlite'),{readOnly:true});assert.equal(copy.prepare('SELECT COUNT(*) AS n FROM records').get().n,fixture.summary.total+1);assert.equal(copy.prepare('PRAGMA integrity_check').get().integrity_check,'ok');copy.close();
    const again=spawnSync(process.execPath,['server/restore.mjs',backup,'--server-stopped'],{cwd:resolve('.'),env:{...process.env,DATA_DIR:restored},encoding:'utf8'});assert.notEqual(again.status,0,'Restoring onto existing data must refuse');
  }finally{db.close();await rm(dir,{recursive:true,force:true});}
});
test('month CSV preserves row count, remeasurements, quoted multiline notes and injection escaping',()=>{
  const csv=recordsCsv(fixture.records);const rows=parseCsv(csv);assert.equal(rows.length,fixture.summary.total+3);assert.ok(rows.slice(3).every(row=>row.length===14));
  assert.match(csv,/青孕期健康记录/);assert.match(csv,/2027-01-13/);assert.ok(rows.some(r=>r[12]?.includes('"引号"\n第二行')));
  assert.equal(rows.filter(r=>r[0]==='血糖').length,fixture.summary.glucose);assert.equal(rows.filter(r=>r[0]==='血压').length,fixture.summary.pressure);
  const bare={...fixture.records[0],payload:{...fixture.records[0].payload,note:'  =SUM(1,2)'}};
  assert.equal(parseCsv(recordsCsv([bare])).at(-1)[12],"'  =SUM(1,2)");
});
test('filtered CSV retains preceding midnight contraction just like the on-screen report',()=>{
  const next=fixture.records.find(r=>r.id==='mock-midnight-after');const metrics=contractionMetrics(fixture.records).get(next.id);
  assert.equal(metrics.duration,30000);assert.equal(metrics.interval,300000);assert.equal(metrics.rest,250000);
  const row=parseCsv(recordsCsv([next],DEFAULT_SETTINGS,fixture.records)).at(-1);
  assert.equal(row[9],'300');assert.equal(row[10],'250');
});
test('malformed timestamps, numeric IDs and reserved settings IDs cannot enter records',()=>{
  const base=fixture.records[0];
  for(const patch of [{id:123},{id:'settings'},{occurredAt:'2026-02-30T01:00:00.000Z'},{occurredAt:'2026-01-01T08:00:00'},{occurredAt:'2026-01-01T08:00:00+08:00'}])assert.throws(()=>validateRecord({...base,...patch}),JSON.stringify(patch));
});
test('failed record-type conflict rolls back earlier writes and deduplication markers in the same batch',()=>{
  const db=openDatabase(':memory:');try{insertMonth(db);const prior=fixture.records[0];const changed={...prior,payload:{...prior.payload,value:9.9}};const conflict={...prior,kind:'pressure',payload:{systolic:118,diastolic:76}};
    assert.throws(()=>applyMutations(db,[{mutationId:'rollback-good',record:changed},{mutationId:'rollback-conflict',record:conflict}]));
    assert.equal(allRecords(db).find(r=>r.id===prior.id).payload.value,prior.payload.value);assert.equal(db.prepare('SELECT id FROM mutations WHERE id=?').get('rollback-good'),undefined);
  }finally{db.close();}
});
test('malformed JSON values return 400 and full month HTTP upload uses protected endpoints',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'qing-month-api-'));const db=openDatabase(join(dir,'db.sqlite'));await mkdir(join(dir,'backups'));
  const origin='http://localhost:3000';const password='month-api-test-password';const app=createApp({db,password,origin,staticDir:resolve('dist'),backupDir:join(dir,'backups'),logger:{error(){}}});app.listen(0,'127.0.0.1');await once(app,'listening');const base=`http://127.0.0.1:${app.address().port}`;
  const post=(path,value,cookie='')=>fetch(base+path,{method:'POST',headers:{'Content-Type':'application/json',Origin:origin,Cookie:cookie},body:JSON.stringify(value)});
  try{
    for(const value of [null,[],42,'text'])assert.equal((await post('/api/login',value)).status,400);
    const login=await post('/api/login',{password});const cookie=login.headers.get('set-cookie').split(';')[0];
    for(let i=0;i<mutations.length;i+=100){const r=await post('/api/sync',{mutations:mutations.slice(i,i+100)},cookie);assert.equal(r.status,200);assert.equal((await r.json()).acknowledged.length,Math.min(100,mutations.length-i));}
    assert.equal(allRecords(db).length,fixture.summary.total+1);
    for(const value of [null,[],42])assert.equal((await post('/api/sync',value,cookie)).status,400);
    assert.equal((await post('/api/sync',{mutations:mutations.slice(0,101)},cookie)).status,400);
    assert.equal((await fetch(base+'/api/backup')).status,401);
    const cookiesHeader=login.headers.get('set-cookie');assert.match(cookiesHeader,/HttpOnly/);assert.match(cookiesHeader,/SameSite=Strict/);
  }finally{app.closeAllConnections();await new Promise(resolve=>app.close(resolve));db.close();await rm(dir,{recursive:true,force:true});}
});
