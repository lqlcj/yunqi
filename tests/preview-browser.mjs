import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { request as httpRequest } from 'node:http';
import { mkdir,writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

// Run against `npm run dev -- --host 0.0.0.0`; the records here are synthetic.
const origin=process.env.PREVIEW_ORIGIN??'http://127.0.0.1:5173';
const password='qing-demo-2027';const out=resolve('test-results/theme');await mkdir(out,{recursive:true});
const checks=[];const pass=s=>{checks.push(s);console.log('PASS '+s);};
function request(path,{host=new URL(origin).host,source,method='GET',body,cookie,headers={}}={}){
  return new Promise((resolve,reject)=>{
    const req=httpRequest(origin+path,{method,headers:{host,...headers,...(source?{Origin:source}:{}),...(cookie?{Cookie:cookie}:{}),...(body!==undefined?{'Content-Type':'application/json'}:{})}},res=>{
      const chunks=[];res.on('data',chunk=>chunks.push(chunk));res.on('end',()=>resolve({status:res.statusCode,headers:res.headers,body:Buffer.concat(chunks).toString('utf8')}));
    });req.on('error',reject);req.end(body===undefined?undefined:JSON.stringify(body));
  });
}
const tunnel='qing-preview-test.trycloudflare.com';
assert.equal((await request('/',{host:tunnel})).status,200);
assert.equal((await request('/',{host:'untrusted.example'})).status,403);
const login=await request('/api/login',{host:tunnel,source:`https://${tunnel}`,method:'POST',body:{password}});assert.equal(login.status,200,login.body);
const cookie=login.headers['set-cookie'][0];assert.match(cookie,/HttpOnly/);assert.match(cookie,/SameSite=Strict/);assert.match(cookie,/; Secure/);
const sync=await request('/api/sync',{host:tunnel,source:`https://${tunnel}`,method:'POST',body:{mutations:[]},cookie:cookie.split(';')[0]});assert.equal(sync.status,200);
const initial=JSON.parse(sync.body).records.filter(r=>r.kind!=='settings'&&!r.deletedAt);
assert.equal(initial.filter(r=>r.id.startsWith('mock-')).length,336);
pass(`Quick Tunnel Host/HTTPS Origin 模拟请求可登录并读取 336 条预置记录及 ${initial.length-336} 条追加记录，Cookie 带 Secure/HttpOnly/SameSite`);
for(const source of ['https://evil.example',`http://${tunnel}`,`https://${tunnel}.evil.example`])assert.equal((await request('/api/sync',{host:tunnel,source,method:'POST',body:{mutations:[]},cookie:cookie.split(';')[0]})).status,403);
assert.equal((await request('/api/login',{source:`https://${tunnel}`,method:'POST',body:{password},headers:{'X-Forwarded-Host':tunnel,'X-Forwarded-Proto':'https'}})).status,403);
for(const path of ['/.env','/test-results/vite-preview/journal.sqlite','/@fs/'+resolve('.env').replaceAll('\\','/')])assert.ok([403,404].includes((await request(path,{host:tunnel})).status),path);
pass('拒绝跨域写入及伪造转发头；预览不可读取 .env 和 SQLite 文件');

const browser=await chromium.launch({executablePath:process.env.CHROME_PATH??'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,colorScheme:'dark',timezoneId:'Asia/Shanghai'});
const page=await context.newPage();page.setDefaultTimeout(15000);const errors=[];page.on('pageerror',e=>errors.push(e.message));
const nav=async name=>page.locator('.bottom-nav').getByRole('button',{name,exact:true}).click();
const theme=async value=>page.waitForFunction(v=>document.documentElement.dataset.theme===v,value);
const clickTheme=async name=>page.getByRole('group',{name:'外观模式'}).getByRole('button',{name,exact:true}).click();
try{
  await page.goto(origin);await page.getByRole('heading',{name:'青孕期健康记录'}).waitFor();await theme('dark');
  assert.equal(await page.locator('meta[name="theme-color"]').getAttribute('content'),'#151c19');
  await page.screenshot({path:out+'/dark-login.png',fullPage:true});
  await clickTheme('浅色');await theme('light');await page.reload();await theme('light');
  await page.emulateMedia({colorScheme:'light'});await page.emulateMedia({colorScheme:'dark'});await theme('light');
  await clickTheme('跟随系统');await theme('dark');await page.emulateMedia({colorScheme:'light'});await theme('light');await page.emulateMedia({colorScheme:'dark'});await theme('dark');
  pass('首次跟随系统、系统实时切换、手动覆盖及刷新后主题记忆正确');
  await page.getByLabel('访问密码').fill(password);await page.getByRole('button',{name:'打开记录本'}).click();await page.waitForFunction(()=>document.querySelector('.sync-status')?.textContent==='已同步');
  assert.equal(await page.evaluate(()=>navigator.serviceWorker.controller),null);
  await page.getByRole('button',{name:'记录血糖',exact:true}).click();
  assert.equal(await page.locator('dialog').evaluate(e=>getComputedStyle(e).backgroundColor),'rgb(30, 40, 34)');
  assert.equal(await page.getByLabel('血糖 mmol/L').evaluate(e=>getComputedStyle(e).backgroundColor),'rgb(23, 32, 27)');
  await page.getByLabel('血糖 mmol/L').fill('4.8');await page.getByLabel('备注').fill('【模拟测试数据】夜间录入回归');
  await page.screenshot({path:out+'/dark-entry.png',fullPage:true});
  await page.getByRole('button',{name:'保存记录',exact:true}).click();await page.locator('dialog').waitFor({state:'detached'});await page.waitForFunction(()=>document.querySelector('.sync-status')?.textContent==='已同步');
  await nav('历史');const testRow=page.locator('.record-row').filter({hasText:'夜间录入回归'});await testRow.waitFor();page.once('dialog',d=>d.accept());await testRow.getByRole('button',{name:'删除血糖记录'}).click();await testRow.waitFor({state:'detached'});await page.waitForFunction(()=>document.querySelector('.sync-status')?.textContent==='已同步');
  pass('Vite 真实浏览器登录、深色输入弹窗、保存、同步、删除均正常；开发模式不注册离线缓存');
  for(const width of [320,390,1440]){
    await page.setViewportSize({width,height:900});
    for(const hash of ['today','history','report','contractions','settings']){
      await page.evaluate(hash=>{location.hash=hash;},hash);await page.locator(`.page-${hash}`).waitFor();
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false,`${hash} ${width}`);
      const panel=page.locator('.panel,.metric-card,.report-paper').first();assert.equal(await panel.evaluate(e=>getComputedStyle(e).backgroundColor),'rgb(30, 40, 34)');
      await page.screenshot({path:`${out}/dark-${hash}-${width}.png`,fullPage:hash!=='history',style:'.toast{visibility:hidden}'});
    }
  }
  pass('深色模式下全部五页、320/390/1440 宽度没有页面横向溢出，卡片背景一致');
  await page.setViewportSize({width:390,height:844});await nav('报告');
  assert.equal(await page.locator('.trend svg circle').first().evaluate(e=>getComputedStyle(e).fill),'rgb(154, 201, 177)');
  await page.emulateMedia({media:'print'});
  assert.equal(await page.locator('.report-paper').evaluate(e=>getComputedStyle(e).backgroundColor),'rgb(255, 255, 255)');
  assert.equal(await page.locator('.trend svg circle').first().evaluate(e=>getComputedStyle(e).fill),'rgb(48, 97, 77)');
  await page.pdf({path:out+'/dark-mode-print.pdf',format:'A4',printBackground:true});await page.emulateMedia({media:'screen'});
  pass('深色图表使用可见配色；打印自动恢复白底和浅色报告配色');
  await nav('设置');const second=await context.newPage();await second.goto(origin+'/#settings');await second.getByRole('heading',{name:'外观',exact:true}).waitFor();
  await clickTheme('浅色');await second.waitForFunction(()=>document.documentElement.dataset.theme==='light');
  assert.equal(await second.getByRole('button',{name:'浅色',exact:true}).getAttribute('aria-pressed'),'true');
  await clickTheme('深色');await page.reload();await theme('dark');await second.waitForFunction(()=>document.documentElement.dataset.theme==='dark');await second.close();
  pass('设置页主题选择与多标签页同步正确，重载后保留手动深色');
  const restricted=await browser.newContext({colorScheme:'dark'});await restricted.addInitScript(()=>{Storage.prototype.getItem=()=>{throw new DOMException('blocked','SecurityError');};Storage.prototype.setItem=()=>{throw new DOMException('blocked','SecurityError');};});
  const limited=await restricted.newPage();limited.on('pageerror',e=>errors.push(e.message));await limited.goto(origin);await limited.getByRole('heading',{name:'青孕期健康记录'}).waitFor();await limited.getByRole('button',{name:'浅色',exact:true}).click();await limited.waitForFunction(()=>document.documentElement.dataset.theme==='light');await restricted.close();
  assert.deepEqual(errors,[]);pass('主题存储不可用时仍可打开和切换，全程无浏览器运行时异常');
  await writeFile(out+'/verification.json',JSON.stringify({passed:true,checkedAt:new Date().toISOString(),checks,errors,actualTunnel:false},null,2));
}catch(e){await page.screenshot({path:out+'/failure.png',fullPage:true}).catch(()=>{});await writeFile(out+'/verification.json',JSON.stringify({passed:false,checks,error:e.message,errors},null,2));throw e;}
finally{await browser.close();}
