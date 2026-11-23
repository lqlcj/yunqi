import { resolve } from 'node:path';
import { openDatabase,dailyBackup } from './database.mjs';
const dataDir=resolve(process.env.DATA_DIR??'data');const db=openDatabase(resolve(dataDir,'journal.sqlite'));
try { console.log(await dailyBackup(db,resolve(dataDir,'backups'))); } finally { db.close(); }
