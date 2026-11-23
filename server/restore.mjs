import { DatabaseSync,backup } from 'node:sqlite';
import { resolve,join } from 'node:path';
import { mkdirSync,existsSync } from 'node:fs';
import { validateRecord } from '../shared/domain.mjs';
const source=process.argv[2];
if(!source || process.argv[3]!=='--server-stopped') throw new Error('先停止应用，再执行 npm run restore -- 备份路径 --server-stopped。目标目录必须为空。');
const dir=resolve(process.env.DATA_DIR??'data');const target=join(dir,'journal.sqlite');
if(existsSync(target) || existsSync(target+'-wal') || existsSync(target+'-shm')) throw new Error('为避免覆盖，恢复目标必须为空目录。请用 DATA_DIR 指定新目录。');
const db=new DatabaseSync(resolve(source),{readOnly:true});
try {
  const checks=db.prepare('PRAGMA integrity_check').all();
  if(checks.some(row=>Object.values(row)[0]!=='ok')) throw new Error('备份完整性检查失败');
  for(const r of db.prepare('SELECT body FROM records').all())validateRecord(JSON.parse(r.body));
  mkdirSync(dir,{recursive:true});await backup(db,target);
} finally {db.close();}
const restored=new DatabaseSync(target);restored.exec('DELETE FROM sessions');restored.close();
console.log('已恢复至 '+target+'，启动应用后请重新登录。');
