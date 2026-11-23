import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir,mkdtemp,readFile,writeFile,rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join,resolve } from 'node:path';
import { once } from 'node:events';
import { DatabaseSync } from 'node:sqlite';
import { openDatabase,allRecords } from '../server/database.mjs';
import { createApp } from '../server/app.mjs';
import { dayKey,shiftDay } from '../shared/domain.mjs';
import { monthFixture,parseCsv } from './fixtures/month.mjs';

const fixture=monthFixture();const {summary,records,dates}=fixture;
const out=resolve('test-results/month');await mkdir(out,{recursive:true});
const dir=await mkdtemp(join(tmpdir(),'qing-month-browser-'));
const backupDir=join(dir,'backups');await mkdir(backupDir);
const db=openDatabase(join(dir,'journal.sqlite'));const password='month-browser-test-only';
const port=3109;const origin=`http://127.0.0.1:${port}`;
const server=createApp({db,password,origin,staticDir:resolve('dist'),backupDir});server.listen(port,'127.0.0.1');await once(server,'listening');
const browser=await chromium.launch({executablePath:process.env.CHROME_PATH??'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
const context=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:1,isMobile:true,hasTouch:true,timezoneId:'America/Los_Angeles',acceptDownloads:true});
context.setDefaultTimeout(12000);
const page=await context.newPage();const errors=[];const checks=[];const batches=[];
context.on('page',p=>p.on('pageerror',e=>errors.push(e.message)));page.on('pageerror',e=>errors.push(e.message));
page.on('request',r=>{if(r.url().endsWith('/api/sync'))batches.push(r.postDataJSON()?.mutations?.length??-1);});
const pass=message=>{checks.push(message);console.log('PASS '+message);};
const localTime=(iso,seconds=false)=>new Date(Date.parse(iso)+8*3600000).toISOString().slice(0,seconds?19:16).replace('T',' ');
const localRows=()=>page.evaluate(()=>new Promise((resolve,reject)=>{const req=indexedDB.open('little-days-journal',1);req.onerror=()=>reject(req.error);req.onsuccess=()=>{const db=req.result;const get=db.transaction('records').objectStore('records').getAll();get.onsuccess=()=>{resolve(get.result);db.close();};get.onerror=()=>reject(get.error);};}));
const canonical=items=>[...items].sort((a,b)=>a.id.localeCompare(b.id));
async function nav(name){await page.locator('.bottom-nav').getByRole('button',{name,exact:true}).click();}
async function synced(){await page.waitForFunction(()=>document.querySelector('.sync-status')?.textContent==='已同步');}
async function importFile(value,expected){
  // Clear prior feedback so a stale toast cannot make this assertion pass.
  await page.reload();await page.getByRole('heading',{name:'数据与备份'}).waitFor();
  page.once('dialog',d=>d.accept());
  await page.locator('input[type=file]').setInputFiles({name:'synthetic-month.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(value))});
  await page.waitForFunction(text=>document.querySelector('.toast')?.textContent?.includes(text),expected);
}
async function reportRange(start,end){await page.getByLabel('报告开始日期').fill(start);await page.getByLabel('报告结束日期').fill(end);}
async function csvDownload(name){const event=page.waitForEvent('download');await page.getByRole('button',{name:'导出 CSV',exact:true}).click();const file=await event;assert.match(file.suggestedFilename(),/^青孕期健康记录_/);await file.saveAs(join(out,name));return parseCsv(await readFile(join(out,name),'utf8'));}
async function assertReport(start,end){
  const selected=records.filter(r=>dayKey(r.occurredAt)>=start&&dayKey(r.occurredAt)<=end);
  const days=[];for(let day=start;day<=end;day=shiftDay(day,1))days.push(day);
  const sections=page.locator('.report-section');
  for(const [i,kind] of ['glucose','pressure','contraction'].entries())assert.equal((await sections.nth(i).locator('.section-heading>.subtle').textContent()).trim(),`${selected.filter(r=>r.kind===kind).length} 次`);
  const table=page.locator('.glucose-table tbody tr');assert.equal(await table.count(),days.length);
  for(const [i,day] of days.entries()){
    assert.equal(await table.nth(i).locator('th').textContent(),day.slice(5).replace('-','/'));
    for(const [j,slot] of ['fasting','breakfast','lunch','dinner'].entries()){
      const expected=selected.filter(r=>r.kind==='glucose'&&dayKey(r.occurredAt)===day&&r.payload.slot===slot).sort((a,b)=>a.occurredAt.localeCompare(b.occurredAt));
      const cell=table.nth(i).locator('td').nth(j);assert.equal(await cell.locator('.cell-reading').count(),expected.length);
      for(const [k,r] of expected.entries()){
        const reading=cell.locator('.cell-reading').nth(k);const high=r.payload.value>=(slot==='fasting'?5.1:6.7);
        assert.equal(await reading.locator('strong').textContent(),r.payload.value.toFixed(1)+(high?' ↑':''));
        assert.equal(await reading.locator('small').first().textContent(),localTime(r.occurredAt).slice(11));
        assert.equal(await reading.locator('.cell-note').textContent(),r.payload.note);
      }
    }
  }
  const bps=selected.filter(r=>r.kind==='pressure').sort((a,b)=>a.occurredAt.localeCompare(b.occurredAt));
  const bpRows=sections.nth(1).locator('tbody tr');assert.equal(await bpRows.count(),bps.length);
  for(const [i,r] of bps.entries())assert.deepEqual(await bpRows.nth(i).locator('td').allTextContents(),[localTime(r.occurredAt),`${r.payload.systolic} / ${r.payload.diastolic}`,String(r.payload.pulse??'—'),r.payload.note||'—']);
  assert.equal(await sections.nth(0).locator('svg circle').count(),selected.filter(r=>r.kind==='glucose').length);
  assert.equal(await sections.nth(1).locator('svg circle').count(),bps.length*2);
  assert.equal(await sections.nth(2).locator('tbody tr').count(),selected.filter(r=>r.kind==='contraction').length);
}
async function editGlucose(id,value){await page.locator(`[data-record-id="${id}"]`).getByRole('button',{name:'编辑血糖记录'}).click();await page.getByLabel('血糖 mmol/L').fill(value);await page.getByRole('button',{name:'保存记录',exact:true}).click();await page.locator('dialog').waitFor({state:'detached'});}
try{
  await writeFile(join(out,'模拟数据_连续30天.json'),JSON.stringify(fixture.backup,null,2));
  await page.goto(origin);await page.getByRole('heading',{name:'青孕期健康记录',exact:true}).waitFor();
  await page.getByLabel('访问密码').fill(password);await page.getByRole('button',{name:'打开记录本'}).click();await synced();
  await page.evaluate(()=>navigator.serviceWorker.ready);await page.waitForFunction(()=>navigator.serviceWorker.controller!==null);
  assert.match(await page.title(),/青孕期健康记录.*2027年1月13日/);
  assert.equal(await page.locator('.welcome-banner').count(),0);assert.equal(await page.getByText('一份小小的安心',{exact:true}).count(),0);
  const manifest=await (await context.request.get(origin+'/manifest.webmanifest')).json();assert.equal(manifest.name,'青孕期健康记录');assert.equal(manifest.short_name,manifest.name);
  assert.equal(await page.locator('meta[name="apple-mobile-web-app-title"]').getAttribute('content'),'青孕期健康记录');
  pass('首页卡片已移除；页面、报告、iOS/PWA 安装名称统一');

  await nav('设置');await context.setOffline(true);await importFile(fixture.backup,`已恢复 ${summary.total} 条`);
  assert.deepEqual(canonical((await localRows()).filter(r=>r.kind!=='settings')),canonical(records));
  await page.reload();await page.getByText(`${summary.total} 条待同步`,{exact:true}).waitFor();
  assert.deepEqual(canonical((await localRows()).filter(r=>r.kind!=='settings')),canonical(records));
  assert.equal(allRecords(db).length,1);pass(`断网导入 ${summary.total} 条整月数据，刷新后内容完整、队列保留`);
  await context.setOffline(false);await page.locator('.sync-status').click();await synced();
  assert.deepEqual(canonical(allRecords(db).filter(r=>r.kind!=='settings')),canonical(records));
  assert.ok(batches.every(n=>n>=0&&n<=100));assert.equal(batches.filter(n=>n>0).reduce((a,b)=>a+b,0),summary.total);
  await page.locator('.sync-status').click();await synced();assert.equal(allRecords(db).length,summary.total+1);
  pass('联网后按最多 100 条分批同步；数据库逐字段一致，重复同步无新增');

  await nav('报告');await reportRange(summary.start,summary.end);await assertReport(summary.start,summary.end);
  await page.getByRole('heading',{name:'预产期：2027年1月13日'}).waitFor();
  assert.equal(await page.locator('.report-paper img').count(),0);
  pass(`30 天报告逐日逐时段核对：${summary.glucose} 次血糖、${summary.pressure} 次血压、${summary.contraction} 次宫缩；边界值和复测正确`);
  const csv=await csvDownload('整月报告.csv');assert.equal(csv.length,summary.total+3);assert.ok(csv.slice(3).every(r=>r.length===14));
  const sorted=[...records].sort((a,b)=>a.occurredAt.localeCompare(b.occurredAt));
  for(const [i,r] of sorted.entries()){
    const row=csv[i+3];assert.equal(row[1],localTime(r.occurredAt,r.kind==='contraction'));assert.equal(row[12],r.payload.note);
    if(r.kind==='glucose')assert.equal(Number(row[3]),r.payload.value);
    if(r.kind==='pressure'){assert.equal(Number(row[4]),r.payload.systolic);assert.equal(Number(row[5]),r.payload.diastolic);assert.equal(row[6],String(r.payload.pulse??''));}
    if(r.kind==='contraction'){assert.equal(Number(row[8]),(Date.parse(r.payload.endAt)-Date.parse(r.occurredAt))/1000);assert.equal(row[11],({none:'无痛',mild:'轻微',moderate:'中等',strong:'强烈'})[r.payload.pain]??'');}
  }
  pass('CSV 所有记录逐条核对：上海时间、读数、疼痛、跨行引号备注均完整');
  await page.screenshot({path:join(out,'mobile-month-report.png'),fullPage:true});
  await page.emulateMedia({media:'print'});await page.pdf({path:join(out,'整月看诊报告.pdf'),format:'A4',printBackground:true});await page.emulateMedia({media:'screen'});
  assert.ok((await readFile(join(out,'整月看诊报告.pdf'))).length>20000);pass('完整月报生成打印 PDF，并保存手机报告截图');

  await reportRange(fixture.next,fixture.next);const midnightRow=page.locator('.contraction-table tbody tr').first();
  assert.deepEqual((await midnightRow.locator('td').allTextContents()).slice(0,4),[`${fixture.next} 00:04:40`,'30秒','5分0秒','轻微']);
  const midnightCsv=await csvDownload('跨午夜筛选.csv');const midnight=midnightCsv.find(r=>r[1]===`${fixture.next} 00:04:40`);assert.equal(midnight[9],'300');assert.equal(midnight[10],'250');
  pass('跨午夜筛选保留前次宫缩，页面与 CSV 的间隔/休息时间一致');
  for(const n of [7,14,30]){await page.getByRole('button',{name:`近 ${n} 天`,exact:true}).click();assert.equal(await page.getByLabel('报告开始日期').inputValue(),shiftDay(dayKey(),1-n));await assertReport(shiftDay(dayKey(),1-n),dayKey());}
  await reportRange(shiftDay(summary.start,-1),shiftDay(summary.start,-1));await assertReport(shiftDay(summary.start,-1),shiftDay(summary.start,-1));assert.equal(await page.locator('.missing').count(),4);
  await reportRange(summary.end,summary.start);await page.getByText('请选择有效日期范围，单次报告最多 366 天。',{exact:true}).waitFor();assert.ok(await page.getByRole('button',{name:'导出 CSV',exact:true}).isDisabled());
  await reportRange(shiftDay(summary.end,-366),summary.end);assert.equal(await page.locator('.report-paper').count(),0);
  pass('7/14/30 天、自定义、无记录、反向日期及超长日期范围验证通过');

  for(const width of [320,375,390,768,1440]){
    await page.setViewportSize({width,height:900});
    for(const hash of ['today','history','report','settings','contractions']){
      await page.evaluate(hash=>{location.hash=hash;},hash);await page.locator(`.page-${hash}`).waitFor();
      if(hash==='report')await reportRange(summary.start,summary.end);
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false,`${width}px ${hash} overflow`);
      if(hash==='report')assert.equal(await page.locator('.glucose-table').evaluate(e=>e.scrollWidth>e.parentElement.clientWidth+1),false,`${width}px glucose table clipped`);
      if(hash==='today')await page.screenshot({path:join(out,`home-${width}.png`),fullPage:true});
    }
  }
  pass('320/375/390/768/1440 像素五种宽度检查全部页面；首页和血糖表无横向溢出');
  await page.setViewportSize({width:390,height:844});await nav('设置');
  await importFile(fixture.backup,'已恢复 0 条');await synced();assert.equal(allRecords(db).length,summary.total+1);
  const before=canonical(await localRows());
  for(const [payload,message] of [[null,'备份格式不支持'],[{...fixture.backup,records:[{...records[0],id:'atomic-new'}, {...records[1],payload:{value:0,slot:'fasting'}}]},'请填写有效的血糖数值'],[{...fixture.backup,records:[records[0],records[0]]},'备份包含重复记录'],[{...fixture.backup,records:[{...records[0],kind:'pressure',payload:{systolic:120,diastolic:80}}]},'已有记录的类型不可修改']]){
    await importFile(payload,message);assert.deepEqual(canonical(await localRows()),before);
  }
  pass('重复备份零新增；无效/重复编号/改类型备份整批拒绝，不污染现有数据或同步队列');

  await nav('历史');await editGlucose('mock-g-29-fasting','4.7');await synced();
  page.once('dialog',d=>d.accept());await page.locator('[data-record-id="mock-bp-29-0"]').getByRole('button',{name:'删除血压记录'}).click();await page.locator('[data-record-id="mock-bp-29-0"]').waitFor({state:'detached'});await synced();
  await nav('设置');await importFile(fixture.backup,'已恢复 0 条');await synced();await page.reload();await synced();
  assert.equal(allRecords(db).find(r=>r.id==='mock-g-29-fasting').payload.value,4.7);assert.ok(allRecords(db).find(r=>r.id==='mock-bp-29-0').deletedAt);
  pass('编辑和删除同步持久化；旧备份无法覆盖较新修改或复活删除记录');

  db.prepare('UPDATE sessions SET expires=0').run();await page.getByRole('button',{name:'立即同步',exact:true}).click();await page.getByRole('button',{name:'重新登录',exact:true}).waitFor();
  await nav('历史');await editGlucose('mock-g-28-fasting','4.9');assert.equal((await localRows()).find(r=>r.id==='mock-g-28-fasting').payload.value,4.9);
  await page.getByRole('button',{name:'重新登录',exact:true}).click();await page.getByLabel('访问密码').fill(password);await page.getByRole('button',{name:'打开记录本'}).click();await page.locator('dialog').waitFor({state:'detached'});await synced();
  assert.equal(allRecords(db).find(r=>r.id==='mock-g-28-fasting').payload.value,4.9);pass('会话过期仍可本机保存，重新登录后未同步修改完整上传');

  let release;const gate=new Promise(resolve=>release=resolve);let intercepted;const gotResponse=new Promise(resolve=>intercepted=resolve);let held=false;
  await page.route('**/api/sync',async route=>{
    if(!held&&route.request().postDataJSON().mutations.length){held=true;const response=await route.fetch();intercepted();await gate;await route.fulfill({response});}else await route.continue();
  });
  await editGlucose('mock-g-27-fasting','4.8');await gotResponse;await editGlucose('mock-g-27-fasting','4.9');
  release();await synced();await page.unroute('**/api/sync');
  assert.equal((await localRows()).find(r=>r.id==='mock-g-27-fasting').payload.value,4.9);assert.equal(allRecords(db).find(r=>r.id==='mock-g-27-fasting').payload.value,4.9);
  pass('上传响应延迟时再次编辑，旧响应不会覆盖新的读数');

  await nav('宫缩');const second=await context.newPage();await second.goto(origin+'/#contractions');await second.getByRole('button',{name:'开始宫缩',exact:true}).waitFor();
  // Queue both clicks in one event loop turn; the shared read/write transaction serializes them.
  await Promise.all([page.getByRole('button',{name:'开始宫缩',exact:true}).evaluate(e=>e.click()),second.getByRole('button',{name:'开始宫缩',exact:true}).evaluate(e=>e.click())]);
  await page.getByRole('button',{name:'结束宫缩',exact:true}).waitFor();await second.getByRole('button',{name:'结束宫缩',exact:true}).waitFor();
  assert.equal((await localRows()).filter(r=>r.kind==='contraction'&&!r.deletedAt&&!r.payload.endAt).length,1);
  await page.reload();await page.getByRole('button',{name:'结束宫缩',exact:true}).waitFor();await page.getByRole('button',{name:'结束宫缩',exact:true}).click();await page.getByRole('button',{name:'强烈',exact:true}).click();await page.getByRole('button',{name:'保存疼痛程度'}).click();await page.locator('dialog').waitFor({state:'detached'});await synced();
  await second.getByRole('button',{name:'开始宫缩',exact:true}).waitFor();await second.close();
  assert.equal(allRecords(db).filter(r=>r.kind==='contraction'&&!r.deletedAt&&!r.payload.endAt).length,0);pass('两个标签页同时开始仅产生一个宫缩计时；刷新恢复、结束和疼痛同步正确');

  await nav('设置');const download=page.waitForEvent('download');await page.getByRole('button',{name:'下载服务器数据库'}).click();const file=await download;assert.match(file.suggestedFilename(),new RegExp(dayKey()));await file.saveAs(join(out,'测试数据库.sqlite'));
  const copy=new DatabaseSync(join(out,'测试数据库.sqlite'),{readOnly:true});assert.equal(copy.prepare('PRAGMA integrity_check').get().integrity_check,'ok');assert.equal(copy.prepare('SELECT COUNT(*) AS n FROM records').get().n,allRecords(db).length);copy.close();
  pass('浏览器下载的 SQLite 备份完整性检查通过，记录数量一致，文件日期按上海时间');
  assert.deepEqual(errors,[]);pass('全程没有浏览器运行时异常');
  await writeFile(join(out,'verification.json'),JSON.stringify({passed:true,completedAt:new Date().toISOString(),summary,checks,batches,browser:await browser.version(),deviceTimezone:'America/Los_Angeles',errors},null,2));
  for(const name of ['failure.png','failure.html'])await rm(join(out,name),{force:true});
  console.log(JSON.stringify({summary,passed:checks.length,artifacts:out},null,2));
}catch(e){await writeFile(join(out,'verification.json'),JSON.stringify({passed:false,completedAt:new Date().toISOString(),summary,checks,error:e.message,errors},null,2));await page.screenshot({path:join(out,'failure.png'),fullPage:true}).catch(()=>{});await writeFile(join(out,'failure.html'),await page.content());console.error('Runtime errors:',errors);throw e;}
finally{await browser.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));db.close();await rm(dir,{recursive:true,force:true});}
