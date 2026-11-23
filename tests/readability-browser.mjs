import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir,mkdtemp,rm,writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join,resolve } from 'node:path';
import { once } from 'node:events';
import { openDatabase,applyMutations,allRecords } from '../server/database.mjs';
import { createApp } from '../server/app.mjs';
import { fromShanghai } from '../shared/domain.mjs';
import { monthFixture } from './fixtures/month.mjs';

const dir=await mkdtemp(join(tmpdir(),'qing-readability-'));await mkdir(join(dir,'backups'));
const out=resolve('test-results/readability');await mkdir(out,{recursive:true});
const db=openDatabase(join(dir,'journal.sqlite'));
const fixture=monthFixture('2026-11-22');
const settings=allRecords(db)[0];applyMutations(db,[{mutationId:'past-settings',record:{...settings,occurredAt:fixture.records[0].occurredAt}}]);
for(let i=0;i<fixture.records.length;i+=100)applyMutations(db,fixture.records.slice(i,i+100).map(record=>({mutationId:record.id,record})));
const origin='http://127.0.0.1:3111',password='readability-test-only';
const server=createApp({db,password,origin,staticDir:resolve('dist'),backupDir:join(dir,'backups')});server.listen(3111,'127.0.0.1');await once(server,'listening');
const browser=await chromium.launch({executablePath:process.env.CHROME_PATH??'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
const context=await browser.newContext({viewport:{width:390,height:844},timezoneId:'America/Los_Angeles',colorScheme:'light'});
const page=await context.newPage();page.setDefaultTimeout(12000);
const checks=[],errors=[],contrast=[];page.on('pageerror',e=>errors.push(e.message));
const pass=s=>{checks.push(s);console.log('PASS '+s);};
const base=Date.parse(fromShanghai('2026-11-23T00:04:40'));
const nav=async hash=>{await page.evaluate(hash=>{location.hash=hash;},hash);await page.locator(`.page-${hash}`).waitFor();};
const synced=()=>page.waitForFunction(()=>document.querySelector('.sync-status')?.textContent==='已同步');
async function audit(label,root='body'){
  const result=await page.locator(root).evaluate(root=>{
    const rgba=s=>{const a=s.match(/[\d.]+/g)?.map(Number)??[0,0,0,0];return [...a.slice(0,3),a[3]??1];};
    const blend=(fg,bg)=>fg.slice(0,3).map((c,i)=>c*fg[3]+bg[i]*(1-fg[3]));
    const luminance=rgb=>rgb.map(c=>{c/=255;return c<=.04045?c/12.92:((c+.055)/1.055)**2.4;}).reduce((s,v,i)=>s+v*[.2126,.7152,.0722][i],0);
    function background(el){const stack=[];for(let e=el;e;e=e.parentElement)stack.unshift(rgba(getComputedStyle(e).backgroundColor));return stack.reduce((bg,fg)=>blend(fg,bg),[255,255,255]);}
    const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);const results=[];let node;
    while(node=walker.nextNode()){
      if(!node.textContent.trim())continue;const el=node.parentElement;
      if(el.closest('script,style,title,option,[aria-hidden=true]')||!el.getClientRects().length)continue;
      const style=getComputedStyle(el);if(style.visibility!=='visible'||style.display==='none'||el.closest('button:disabled'))continue;
      const bg=background(el),fg=blend(rgba(el instanceof SVGElement?style.fill:style.color),bg);
      const a=luminance(fg),b=luminance(bg),ratio=(Math.max(a,b)+.05)/(Math.min(a,b)+.05);
      results.push({text:node.textContent.trim().slice(0,55),selector:el.tagName+'.'+el.className,ratio:Math.round(ratio*100)/100,color:style.color,background:bg});
    }
    return {count:results.length,min:Math.min(...results.map(r=>r.ratio)),failures:results.filter(r=>r.ratio<4.5)};
  });
  contrast.push({label,...result});
  assert.deepEqual(result.failures,[],label+' contrast: '+JSON.stringify(result.failures.slice(0,12)));
}
function record(id,start,end=start+45000){const at=new Date(start).toISOString();return {id,kind:'contraction',occurredAt:at,createdAt:at,updatedAt:at,deletedAt:null,payload:{endAt:end===null?null:new Date(end).toISOString(),pain:'mild'}};}
try{
  await page.clock.setFixedTime(new Date(base));
  await page.goto(origin);await page.getByLabel('访问密码').waitFor();await audit('light-login');
  await page.getByLabel('访问密码').fill(password);await page.getByRole('button',{name:'打开记录本'}).click();await page.waitForFunction(()=>document.querySelectorAll('.record-row').length===5);await synced();
  for(const hash of ['today','contractions','history','report','settings']){
    await nav(hash);await audit('light-'+hash);
    for(const width of [320,390,1440]){
      await page.setViewportSize({width,height:900});
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false,hash+' '+width);
    }
    await page.setViewportSize({width:390,height:844});
    if(hash==='today'||hash==='contractions')await page.screenshot({path:join(out,`light-${hash}.png`),fullPage:true});
  }
  await nav('today');await page.getByRole('button',{name:'记录血糖',exact:true}).click();await page.locator('dialog').waitFor();await audit('light-glucose-form','dialog');await page.getByRole('button',{name:'关闭',exact:true}).click();
  await nav('contractions');await page.getByRole('button',{name:'手动补记'}).click();await audit('light-contraction-form','dialog');await page.getByRole('button',{name:'关闭',exact:true}).click();
  pass('浅色登录、五页与两类表单的所有可见文字对比度 ≥ 4.5:1；320/390/1440 无横向溢出');

  await nav('report');await page.getByLabel('报告开始日期').fill(fixture.summary.start);await page.getByLabel('报告结束日期').fill(fixture.summary.end);
  assert.equal(await page.locator('.contraction-table tbody tr').count(),152);
  assert.deepEqual(await page.locator('.contraction-table thead th').allTextContents(),['开始时间','持续时长','间隔时长','疼痛','备注']);
  await page.setViewportSize({width:1440,height:1000});await page.screenshot({path:join(out,'light-report.png')});
  await page.emulateMedia({media:'print'});await audit('light-print','.report-paper');
  await page.pdf({path:join(out,'month-light.pdf'),format:'A4',printBackground:true});
  await page.emulateMedia({media:'screen'});await nav('settings');await page.getByRole('button',{name:'深色',exact:true}).click();
  await nav('report');await page.getByLabel('报告开始日期').fill(fixture.summary.start);await page.getByLabel('报告结束日期').fill(fixture.summary.end);
  await page.emulateMedia({media:'print'});await audit('dark-print','.report-paper');
  await page.pdf({path:join(out,'month-dark.pdf'),format:'A4',printBackground:false});await page.emulateMedia({media:'screen'});
  pass('完整 336 条记录报告、三项宫缩表头正确；浅色/深色均导出高对比白底 PDF（含关闭背景打印）');
  await nav('settings');await page.getByRole('button',{name:'浅色',exact:true}).click();await page.setViewportSize({width:390,height:844});

  // Seed a measurement before Shanghai midnight, then use the real timer across midnight.
  const previous=record('reminder-previous',base-300000);
  applyMutations(db,[{mutationId:previous.id,record:previous}]);
  await nav('contractions');await page.reload();await synced();
  assert.equal(await page.locator('.contraction-alert').count(),0,'old monthly records must not cause a current alert');
  await page.getByRole('button',{name:'开始宫缩',exact:true}).click();await page.getByRole('button',{name:'结束宫缩',exact:true}).waitFor();
  await page.getByRole('alert',{name:'宫缩记录提醒'}).waitFor();assert.match(await page.locator('.contraction-alert').textContent(),/5分0秒/);
  assert.deepEqual(await page.locator('.timer-fields dt').allTextContents(),['开始时间','持续时长','间隔时长']);
  assert.deepEqual(await page.locator('.timer-fields dd').allTextContents(),['2026-11-23 00:04:40','0秒','5分0秒']);
  await audit('interval-reminder');await page.screenshot({path:join(out,'interval-reminder.png'),fullPage:true});
  await nav('today');await page.getByRole('alert',{name:'宫缩记录提醒'}).waitFor();await nav('contractions');
  await page.clock.setFixedTime(new Date(base+45000));await page.reload();await synced();
  assert.equal(await page.locator('.timer-fields dd').nth(1).textContent(),'45秒');assert.match(await page.locator('.contraction-alert').textContent(),/5分0秒/);
  await page.getByRole('button',{name:'结束宫缩',exact:true}).click();await page.getByRole('button',{name:'强烈',exact:true}).click();await page.getByRole('button',{name:'保存疼痛程度',exact:true}).click();
  // Saving finishes when the dialog closes; the prior sync status may still be visible immediately after a click.
  await page.locator('dialog').waitFor({state:'detached'});await synced();
  const current=page.locator('.record-contraction').first();assert.match(await current.textContent(),/45秒/);assert.match(await current.textContent(),/疼痛：强烈/);
  const currentId=await current.getAttribute('data-record-id');assert.equal(allRecords(db).find(r=>r.id===currentId).payload.pain,'strong');
  pass('跨午夜 300 秒间隔立即提醒；首页可见，刷新恢复持续时长与提醒，疼痛保存正确');

  await current.getByRole('button',{name:'编辑宫缩记录'}).click();await page.getByLabel('开始时间', {exact:true}).fill('2026-11-23T00:04:41');await page.getByRole('button',{name:'保存记录',exact:true}).click();await page.locator('dialog').waitFor({state:'detached'});await synced();
  assert.equal(await page.locator('.contraction-alert').count(),0,'301 seconds must stop short interval alert');
  assert.equal(await page.locator('.timer-fields dd').nth(2).textContent(),'5分1秒');
  await nav('history');await page.getByLabel('历史开始日期').fill('2026-11-22');
  page.once('dialog',d=>d.accept());await page.locator('[data-record-id="reminder-previous"]').getByRole('button',{name:'删除宫缩记录'}).click();
  await page.locator('[data-record-id="reminder-previous"]').waitFor({state:'detached'});await synced();
  await nav('contractions');assert.equal(await page.locator('.timer-fields dd').nth(2).textContent(),'—');
  pass('编辑到 301 秒即取消短间隔提醒；删除前次记录后间隔正确重算');

  await page.clock.setFixedTime(new Date(base+900000));await page.reload();await synced();
  await page.getByRole('button',{name:'开始宫缩',exact:true}).click();await page.getByRole('button',{name:'结束宫缩',exact:true}).waitFor();
  await page.clock.setFixedTime(new Date(base+1020000));await page.reload();await synced();assert.equal(await page.locator('.contraction-alert').count(),0);
  await page.clock.setFixedTime(new Date(base+1020001));await page.reload();await synced();assert.match(await page.locator('.contraction-alert').textContent(),/超过 2 分钟/);
  await audit('long-contraction-reminder');await page.getByRole('button',{name:'结束宫缩',exact:true}).click();await page.getByRole('button',{name:'暂不填写',exact:true}).click();await synced();
  await page.clock.setFixedTime(new Date(base+1620002));await page.reload();await synced();assert.equal(await page.locator('.contraction-alert').count(),0);
  pass('持续 120 秒不触发超时提醒，120001 毫秒触发；结束后超过展示窗口不再将旧记录弹为当前提醒');

  const time=base+3000000;await page.clock.setFixedTime(new Date(time));
  const frequent=Array.from({length:6},(_,i)=>record('frequent-'+i,time-i*120000,time-i*120000+1000));
  applyMutations(db,frequent.map(record=>({mutationId:record.id,record})));
  await page.reload();await synced();assert.match(await page.locator('.contraction-alert').textContent(),/最近 10 分钟已记录 6 次/);await audit('frequent-contractions');
  await nav('settings');await page.getByRole('button',{name:'深色',exact:true}).click();await nav('contractions');await audit('dark-alert','.contraction-alert');
  assert.deepEqual(errors,[]);pass('10 分钟 6 次触发联系产科提醒；深色提醒可读，全程无浏览器运行时异常');
  await writeFile(join(out,'verification.json'),JSON.stringify({passed:true,checks,contrast,errors},null,2));
}catch(e){await page.screenshot({path:join(out,'failure.png'),fullPage:true}).catch(()=>{});await writeFile(join(out,'verification.json'),JSON.stringify({passed:false,error:e.message,checks,contrast,errors},null,2));throw e;}
finally{await browser.close();server.closeAllConnections();await new Promise(r=>server.close(r));db.close();await rm(dir,{recursive:true,force:true});}
