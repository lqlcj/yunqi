import { spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { once } from 'node:events';
import { openDatabase } from '../server/database.mjs';
import { createApp } from '../server/app.mjs';
import { DEV_API_ORIGIN } from './dev-proxy.mjs';

// Development keeps its own empty database and never reads production .env.
const dataDir=resolve('.cache/dev-preview');
const backupDir=join(dataDir,'backups');await mkdir(backupDir,{recursive:true});
const db=openDatabase(join(dataDir,'journal.sqlite'));
const password='qing-demo-2027';
const api=createApp({db,password,origin:DEV_API_ORIGIN,staticDir:resolve('dist'),backupDir});
api.listen(0,'127.0.0.1');await once(api,'listening');
console.log(`开发预览\n开发密码：${password}\n开发记录保存在 .cache/dev-preview/，重启后保留。`);
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
