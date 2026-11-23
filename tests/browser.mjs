import { chromium } from 'playwright';
import { mkdir,mkdtemp,readFile,writeFile,rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join,resolve } from 'node:path';
import { once } from 'node:events';
import assert from 'node:assert/strict';
import { openDatabase,allRecords } from '../server/database.mjs';
import { createApp } from '../server/app.mjs';

const dir=await mkdtemp(join(tmpdir(),'little-days-browser-'));const backupDir=join(dir,'backups');await mkdir(backupDir);await mkdir('test-results',{recursive:true});
const db=openDatabase(join(dir,'journal.sqlite'));const password='browser-test-password-only';
const port=3107;const origin=`http://127.0.0.1:${port}`;
const server=createApp({db,password,origin,staticDir:resolve('dist'),backupDir});server.listen(port,'127.0.0.1');await once(server,'listening');
const browser=await chromium.launch({executablePath:process.env.CHROME_PATH??'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
const context=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:1,isMobile:true,hasTouch:true,timezoneId:'America/Los_Angeles',acceptDownloads:true});
const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
const log=s=>console.log('PASS '+s);
async function pageNav(name){await page.locator('.bottom-nav').getByRole('button',{name,exact:true}).click();}
async function waitSynced(){await page.waitForFunction(()=>document.querySelector('.sync-status')?.textContent==='已同步');}
async function saveGlucose(value){await page.getByRole('button',{name:'记录血糖',exact:true}).click();await page.getByLabel('血糖 mmol/L').fill(value);await page.getByRole('button',{name:'保存记录',exact:true}).click();await page.locator('dialog').waitFor({state:'detached'});}
try{
  await page.goto(origin);await page.getByLabel('访问密码').fill(password);await page.getByRole('button',{name:'打开记录本'}).click();await waitSynced();
  await page.evaluate(()=>navigator.serviceWorker.ready);await page.waitForFunction(()=>navigator.serviceWorker.controller!==null);
  await page.screenshot({path:'test-results/mobile-empty.png',fullPage:true});log('login and installed offline shell');
  await saveGlucose('5.1');await waitSynced();assert.equal(allRecords(db).filter(r=>r.kind==='glucose').length,1);assert.ok(await page.getByText('达到 / 超过目标',{exact:true}).count());log('fasting equality flags as above target');
  await page.getByRole('button',{name:'记录血压',exact:true}).click();await page.getByLabel('高压（收缩压）').fill('118');await page.getByLabel('低压（舒张压）').fill('76');await page.getByLabel('心率（选填）').fill('82');await page.getByRole('button',{name:'保存记录',exact:true}).click();await page.locator('dialog').waitFor({state:'detached'});await waitSynced();log('blood pressure stored independently');
  await pageNav('宫缩');await page.getByRole('button',{name:'开始宫缩',exact:true}).click();await page.getByRole('button',{name:'结束宫缩',exact:true}).waitFor();await page.reload();await page.getByRole('button',{name:'结束宫缩',exact:true}).waitFor();await page.getByRole('button',{name:'结束宫缩',exact:true}).click();await page.getByRole('button',{name:'中等',exact:true}).click();await page.getByRole('button',{name:'保存疼痛程度'}).click();await page.locator('dialog').waitFor({state:'detached'});await waitSynced();assert.equal(allRecords(db).find(r=>r.kind==='contraction').payload.pain,'moderate');log('contraction reload recovery and pain selection');
  await pageNav('今天');await context.setOffline(true);await saveGlucose('4.8');await page.reload();await page.getByRole('heading',{name:'今天，也好好照顾自己。'}).waitFor();assert.ok(await page.getByText('1 条待同步',{exact:true}).count());assert.ok(await page.getByText('4.8',{exact:true}).count());log('offline capture survives page reload');
  await context.setOffline(false);await page.locator('.sync-status').click();await waitSynced();assert.equal(allRecords(db).filter(r=>r.kind==='glucose').length,2);await page.locator('.sync-status').click();await waitSynced();assert.equal(allRecords(db).filter(r=>r.kind==='glucose').length,2);log('reconnection sync creates no duplicates');
  await pageNav('历史');await page.getByRole('button',{name:'编辑血糖记录'}).first().click();await page.getByLabel('血糖 mmol/L').fill('4.9');await page.getByRole('button',{name:'保存记录',exact:true}).click();await page.locator('dialog').waitFor({state:'detached'});await waitSynced();log('editing a saved reading');
  await pageNav('报告');await page.getByRole('heading',{name:'预产期：2027年1月13日'}).waitFor();assert.ok(await page.getByText('中等',{exact:true}).count());
  const downloadEvent=page.waitForEvent('download');await page.getByRole('button',{name:'导出 CSV',exact:true}).click();const download=await downloadEvent;await download.saveAs('test-results/report.csv');const csv=await readFile('test-results/report.csv','utf8');assert.match(csv,/2027-01-13/);assert.match(csv,/中等/);assert.match(csv,/4.9/);log('report and CSV contain due date, pain, readings');
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);await page.screenshot({path:'test-results/mobile-report.png',fullPage:true});
  await page.emulateMedia({media:'print'});await page.pdf({path:'test-results/report.pdf',format:'A4',printBackground:true});await page.emulateMedia({media:'screen'});log('mobile report layout and printable PDF');
  await pageNav('设置');const backupEvent=page.waitForEvent('download');await page.getByRole('button',{name:'导出完整备份'}).click();const backup=await backupEvent;await backup.saveAs('test-results/backup.json');
  const backupObj=JSON.parse(await readFile('test-results/backup.json','utf8'));assert.equal(backupObj.app,'little-days');
  const unique={...backupObj.records.find(r=>r.kind==='glucose'),id:'restored-browser-entry',updatedAt:new Date().toISOString()};backupObj.records.push(unique);await writeFile('test-results/import.json',JSON.stringify(backupObj));
  page.once('dialog',d=>d.accept());await page.locator('input[type=file]').setInputFiles('test-results/import.json');await waitSynced();await page.waitForFunction(()=>document.querySelector('.toast')?.textContent?.includes('已恢复'));assert.ok(allRecords(db).some(r=>r.id==='restored-browser-entry'));log('JSON backup and non-destructive restore');
  await pageNav('历史');page.once('dialog',d=>d.accept());await page.getByRole('button',{name:'删除血糖记录'}).first().click();await waitSynced();await page.waitForFunction(()=>document.querySelector('.toast')?.textContent?.includes('已删除'));assert.ok(allRecords(db).some(r=>r.deletedAt));log('deletion is persisted as a tombstone');
  await pageNav('设置');await page.getByRole('button',{name:'深色',exact:true}).click();await context.setOffline(true);await page.reload();
  await page.getByRole('heading',{name:'外观',exact:true}).waitFor();assert.equal(await page.locator('html').getAttribute('data-theme'),'dark');
  assert.equal(await page.locator('.panel').first().evaluate(e=>getComputedStyle(e).backgroundColor),'rgb(30, 40, 34)');
  await context.setOffline(false);await page.getByRole('button',{name:'浅色',exact:true}).click();await page.locator('.sync-status').click();await waitSynced();log('production offline shell preserves theme script and saved dark appearance');
  await pageNav('今天');await page.screenshot({path:'test-results/mobile-today.png',fullPage:true});
  await page.setViewportSize({width:1440,height:1000});await page.screenshot({path:'test-results/desktop-today.png',fullPage:true});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);log('desktop and mobile viewport have no document overflow');
  assert.deepEqual(errors,[]);console.log('All browser scenarios passed. Screenshots and exports: test-results/');
}catch(e){await page.screenshot({path:'test-results/failure.png',fullPage:true}).catch(()=>{});await writeFile('test-results/failure.html',await page.content());console.error('Browser errors:',errors);throw e;}
finally{await browser.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));db.close();await rm(dir,{recursive:true,force:true});}
