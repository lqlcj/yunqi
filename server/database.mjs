import { DatabaseSync, backup } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { readdir, unlink } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { DEFAULT_SETTINGS, dayKey, validateRecord } from '../shared/domain.mjs';

export function openDatabase(path) {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000; PRAGMA foreign_keys=ON;
    CREATE TABLE IF NOT EXISTS records (id TEXT PRIMARY KEY, body TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS mutations (id TEXT PRIMARY KEY, applied_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS sessions (token TEXT PRIMARY KEY, expires INTEGER NOT NULL);
    PRAGMA user_version=1;`);
  const now = new Date().toISOString();
  db.prepare('INSERT OR IGNORE INTO records(id,body) VALUES (?,?)').run('settings', JSON.stringify({ id:'settings',kind:'settings',occurredAt:now,createdAt:now,updatedAt:now,deletedAt:null,payload:DEFAULT_SETTINGS }));
  return db;
}
export function allRecords(db) { return db.prepare('SELECT body FROM records').all().map(r=>JSON.parse(r.body)); }
export function applyMutations(db, mutations) {
  if (!Array.isArray(mutations) || mutations.length > 100) throw new Error('每次最多同步 100 条变更');
  // Validate the full batch before touching any existing data.
  for (const m of mutations) {
    if (!m || typeof m !== 'object' || Array.isArray(m) || typeof m.mutationId !== 'string' || !/^[\w-]{1,80}$/.test(m.mutationId)) throw new Error('变更编号无效');
    validateRecord(m.record);
  }
  db.exec('BEGIN IMMEDIATE');
  try {
    const seen = db.prepare('SELECT id FROM mutations WHERE id=?');
    const applied = db.prepare('INSERT INTO mutations(id,applied_at) VALUES (?,?)');
    const upsert = db.prepare('INSERT INTO records(id,body) VALUES (?,?) ON CONFLICT(id) DO UPDATE SET body=excluded.body');
    const lookup = db.prepare('SELECT body FROM records WHERE id=?');
    for (const m of mutations) {
      if (seen.get(m.mutationId)) continue;
      const previous = lookup.get(m.record.id);
      if (previous && JSON.parse(previous.body).kind !== m.record.kind) throw new Error('已有记录的类型不可修改');
      upsert.run(m.record.id, JSON.stringify(m.record));
      applied.run(m.mutationId, new Date().toISOString());
    }
    db.exec('COMMIT');
  } catch(e) { db.exec('ROLLBACK'); throw e; }
  return allRecords(db);
}
export async function dailyBackup(db, directory) {
  mkdirSync(directory, { recursive: true });
  const name = `journal-${dayKey()}.sqlite`;
  await backup(db, join(directory,name));
  const files = (await readdir(directory)).filter(n=>/^journal-\d{4}-\d{2}-\d{2}\.sqlite$/.test(n)).sort().reverse();
  for (const file of files.slice(30)) await unlink(join(directory,file));
  return join(directory,name);
}
