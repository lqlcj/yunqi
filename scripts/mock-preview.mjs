/** Local-only synthetic demo. Never opens .env or the real data directory. */
import { mkdirSync } from 'node:fs';
import { mkdtemp,writeFile } from 'node:fs/promises';
import { resolve,join } from 'node:path';
import { openDatabase,applyMutations } from '../server/database.mjs';
import { createApp } from '../server/app.mjs';
import { monthFixture } from '../tests/fixtures/month.mjs';

const root=resolve('test-results/mock-preview');mkdirSync(root,{recursive:true});
const dir=await mkdtemp(join(root,'session-'));const backupDir=join(dir,'backups');mkdirSync(backupDir);
const fixture=monthFixture();const db=openDatabase(join(dir,'journal.sqlite'));
for(let i=0;i<fixture.records.length;i+=100)applyMutations(db,fixture.records.slice(i,i+100).map(record=>({mutationId:`seed-${record.id}`,record})));
await writeFile(join(root,'模拟数据_连续30天.json'),JSON.stringify(fixture.backup,null,2));
const origin='http://127.0.0.1:3108';const password='qing-demo-2027';
const app=createApp({db,password,origin,staticDir:resolve('dist'),backupDir});
app.listen(3108,'127.0.0.1',()=>console.log(`模拟数据预览：${origin}\n测试密码：${password}\n${fixture.summary.start} 至 ${fixture.summary.end}，共 ${fixture.summary.total} 条模拟记录。\n独立数据库：${dir}\n每次启动新建测试库，不读取或修改正式 data/。`));
let closing=false;
function shutdown(){if(closing)return;closing=true;app.close(()=>{db.close();process.exit(0);});app.closeIdleConnections();}
process.on('SIGINT',shutdown);process.on('SIGTERM',shutdown);
