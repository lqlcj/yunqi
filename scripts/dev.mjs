import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { once } from 'node:events';
import { openDatabase, allRecords, applyMutations } from '../server/database.mjs';
import { createApp } from '../server/app.mjs';
import { monthFixture } from '../tests/fixtures/month.mjs';
import { DEV_API_ORIGIN } from './dev-proxy.mjs';

// The requested dev command always runs synthetic data and never reads .env.
const dataDir=resolve('test-results/vite-preview');
const backupDir=join(dataDir,'backups');await mkdir(backupDir,{recursive:true});
const db=openDatabase(join(dataDir,'journal.sqlite'));
if(allRecords(db).length===1 && db.prepare('SELECT COUNT(*) AS n FROM mutations').get().n===0){
  const fixture=monthFixture();
  for(let i=0;i<fixture.records.length;i+=100)applyMutations(db,fixture.records.slice(i,i+100).map(record=>({mutationId:`seed-${record.id}`,record})));
  await writeFile(join(dataDir,'模拟数据_连续30天.json'),JSON.stringify(fixture.backup,null,2));
}
const password='qing-demo-2027';
const api=createApp({db,password,origin:DEV_API_ORIGIN,staticDir:resolve('dist'),backupDir});
api.listen(0,'127.0.0.1');await once(api,'listening');
console.log(`模拟预览 · 已载入 ${allRecords(db).filter(r=>r.kind!=='settings'&&!r.deletedAt).length} 条记录\n测试密码：${password}\n模拟记录保存在 test-results/vite-preview/，重启后保留。`);
const vite=spawn(process.execPath,['node_modules/vite/bin/vite.js','--configLoader','native',...process.argv.slice(2)],{
  stdio:'inherit',env:{...process.env,QING_DEV_API_URL:`http://127.0.0.1:${api.address().port}`},
});
let stopping=false;
function stop(code=0){
  if(stopping)return;stopping=true;vite.kill();api.closeAllConnections();
  api.close(()=>{db.close();process.exit(code);});
}
vite.on('error',error=>{console.error(error.message);stop(1);});
vite.on('exit',code=>stop(code??0));
process.on('SIGINT',()=>stop());process.on('SIGTERM',()=>stop());
