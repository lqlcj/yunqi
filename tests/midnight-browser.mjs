import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdtemp,mkdir,rm,writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join,resolve } from 'node:path';
import { once } from 'node:events';
import { openDatabase,applyMutations,allRecords } from '../server/database.mjs';
import { createApp } from '../server/app.mjs';
import { monthFixture } from './fixtures/month.mjs';
import { fromShanghai } from '../shared/domain.mjs';

const fixture=monthFixture();const rows=fixture.records.filter(r=>r.id.startsWith('mock-midnight-'));
const dir=await mkdtemp(join(tmpdir(),'qing-midnight-'));await mkdir(join(dir,'backups'));
const db=openDatabase(join(dir,'journal.sqlite'));const settings=allRecords(db)[0];
applyMutations(db,[{mutationId:'past-settings',record:{...settings,occurredAt:rows[0].occurredAt}},...rows.map(record=>({mutationId:record.id,record}))]);
const port=3110;const origin=`http://127.0.0.1:${port}`;const password='midnight-test-password';
const app=createApp({db,password,origin,staticDir:resolve('dist'),backupDir:join(dir,'backups')});app.listen(port,'127.0.0.1');await once(app,'listening');
const browser=await chromium.launch({executablePath:process.env.CHROME_PATH??'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
const context=await browser.newContext({viewport:{width:390,height:844},timezoneId:'America/Los_Angeles'});
const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(10000);
try{
  // A fixed Shanghai 00:30 tests the same recent-hour window across midnight on both screens.
  await page.clock.setFixedTime(new Date(fromShanghai(`${fixture.next}T00:30:00`)));
  await page.goto(origin);
  // Hold the storage permission request so first-login synchronization cannot race the assertions.
  await page.evaluate(()=>{
    navigator.storage.persist=()=>new Promise(resolve=>{window.finishStorageRequest=()=>resolve(false);});
  });
  await page.getByLabel('访问密码').fill(password);await page.getByRole('button',{name:'打开记录本'}).click();
  await page.waitForFunction(()=>typeof window.finishStorageRequest==='function');
  assert.equal(await page.locator('.sync-status').textContent(),'正在同步','first login must not report success before downloading records');
  await page.evaluate(()=>window.finishStorageRequest());
  await page.waitForFunction(()=>document.querySelector('.sync-status')?.textContent==='已同步');
  assert.equal((await page.locator('.contraction-reading').textContent()).replace(/\s/g,''),'2次');
  await page.locator('.bottom-nav').getByRole('button',{name:'宫缩',exact:true}).click();
  assert.deepEqual(await page.locator('.timer-stats strong').allTextContents(),['2','40秒'],'recent-hour count/average must include yesterday 23:59');
  assert.equal(await page.locator('.record-contraction').count(),1,'today list must still exclude yesterday');
  await page.clock.setFixedTime(new Date(fromShanghai(`${fixture.next}T01:10:00`)));await page.reload();
  await page.getByRole('heading',{name:'宫缩计时',exact:true}).waitFor();assert.deepEqual(await page.locator('.timer-stats strong').allTextContents(),['0','—']);
  await page.locator('.bottom-nav').getByRole('button',{name:'今天',exact:true}).click();assert.equal((await page.locator('.contraction-reading').textContent()).replace(/\s/g,''),'0次');
  assert.deepEqual(errors,[]);await mkdir('test-results/month',{recursive:true});await writeFile('test-results/month/midnight-verification.json',JSON.stringify({passed:true,checks:['00:30 recent-hour window spans midnight on both screens','average 40 seconds includes both contractions','today list contains only today','01:10 window expires both records'],errors},null,2));
  console.log('PASS 上海凌晨最近 1 小时跨日统计、平均持续时间、当日列表和窗口到期');
}finally{await browser.close();app.closeAllConnections();await new Promise(resolve=>app.close(resolve));db.close();await rm(dir,{recursive:true,force:true});}
