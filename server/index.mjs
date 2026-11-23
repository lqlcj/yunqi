import { resolve } from 'node:path';
import { mkdirSync } from 'node:fs';
import { openDatabase, dailyBackup } from './database.mjs';
import { createApp } from './app.mjs';

const dataDir=resolve(process.env.DATA_DIR??'data');
const backupDir=resolve(dataDir,'backups');mkdirSync(backupDir,{recursive:true});
const db=openDatabase(resolve(dataDir,'journal.sqlite'));
const app=createApp({db,password:process.env.APP_PASSWORD,origin:process.env.APP_ORIGIN??'http://localhost:3000',staticDir:resolve('dist'),backupDir});
let backingUp=false;
async function runBackup() { if(backingUp)return;backingUp=true;try { await dailyBackup(db,backupDir); }catch(e){console.error('Backup failed:',e.message);}finally{backingUp=false;} }
const timer=setInterval(runBackup,6*3600000);timer.unref();
app.listen(Number(process.env.PORT??3000),process.env.HOST??'127.0.0.1',()=>{
  console.log(`青孕期健康记录 running on ${process.env.APP_ORIGIN??'http://localhost:3000'}`);
  void runBackup();
});
let closing=false;
async function shutdown(){if(closing)return;closing=true;clearInterval(timer);app.close(async()=>{await runBackup();db.close();process.exit(0);});}
process.on('SIGTERM',shutdown);process.on('SIGINT',shutdown);
