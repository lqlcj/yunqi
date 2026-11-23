import { createServer } from 'node:http';
import { randomBytes, scryptSync, timingSafeEqual, createHash } from 'node:crypto';
import { readFile, stat, unlink } from 'node:fs/promises';
import { join, resolve, extname, sep } from 'node:path';
import { backup } from 'node:sqlite';
import { applyMutations } from './database.mjs';

const hash = s=>createHash('sha256').update(s).digest('hex');
const mime = { '.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.webmanifest':'application/manifest+json','.json':'application/json','.woff2':'font/woff2' };
export function createApp({ db, password, origin, staticDir, backupDir, logger = console }) {
  if (!password || password.length < 12) throw new Error('APP_PASSWORD 至少需要 12 个字符，请在 .env 中设置');
  const publicUrl = new URL(origin);
  const secure = publicUrl.protocol === 'https:';
  if (!secure && !['localhost','127.0.0.1','[::1]'].includes(publicUrl.hostname)) throw new Error('公网 APP_ORIGIN 必须使用 HTTPS');
  const salt = randomBytes(32); const expected = scryptSync(password,salt,64);
  const attempts = new Map(); const expiresMs = 30 * 86400000;
  const cookie = token=>`journal_session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${expiresMs/1000}${secure ? '; Secure' : ''}`;
  const json = (res,status,data)=> { res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(data)); };
  async function readJson(req) {
    if (!req.headers['content-type']?.startsWith('application/json')) throw Object.assign(new Error('请使用 JSON 请求'),{status:415});
    let total=0; const chunks=[];
    for await (const c of req) { total+=c.length; if(total>2_000_000) throw Object.assign(new Error('请求过大'),{status:413}); chunks.push(c); }
    let body;
    try { body = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { throw Object.assign(new Error('JSON 格式错误'),{status:400}); }
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw Object.assign(new Error('JSON 请求内容应为对象'),{status:400});
    return body;
  }
  return createServer(async(req,res)=>{
    res.setHeader('X-Content-Type-Options','nosniff'); res.setHeader('X-Frame-Options','DENY');
    res.setHeader('Referrer-Policy','same-origin');
    res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'; font-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'");
    try {
      const url = new URL(req.url,'http://localhost'); const path=url.pathname;
      if(path === '/api/health' && req.method === 'GET') return json(res,200,{ok:true});
      if(path.startsWith('/api/')) {
        if(req.method !== 'GET' && req.headers.origin !== publicUrl.origin) return json(res,403,{error:'请求来源不匹配，请检查 APP_ORIGIN'});
        const token = req.headers.cookie?.split(';').map(x=>x.trim()).find(x=>x.startsWith('journal_session='))?.slice(16);
        const tokenHash=token ? hash(token) : null;
        const session=tokenHash ? db.prepare('SELECT expires FROM sessions WHERE token=?').get(tokenHash) : null;
        const authenticated = Boolean(session && session.expires > Date.now());
        if(path === '/api/session' && req.method === 'GET') return json(res,200,{authenticated});
        if(path === '/api/login' && req.method === 'POST') {
          const now=Date.now(); const ip=req.socket.remoteAddress ?? 'unknown';
          for(const [key,value] of attempts) if(value.until<now) attempts.delete(key);
          const limit=attempts.get(ip) ?? {count:0,until:now+900000};
          if(limit.count>=10) return json(res,429,{error:'尝试次数过多，请 15 分钟后再试'});
          const body=await readJson(req);
          if(typeof body.password!=='string' || body.password.length>256) return json(res,400,{error:'密码格式无效'});
          limit.count++;attempts.set(ip,limit);
          const actual=scryptSync(body.password,salt,64);
          if(!timingSafeEqual(actual,expected)) return json(res,401,{error:'密码不正确'});
          attempts.delete(ip);
          db.prepare('DELETE FROM sessions WHERE expires < ?').run(now);
          if(tokenHash) db.prepare('DELETE FROM sessions WHERE token=?').run(tokenHash);
          const fresh=randomBytes(32).toString('hex');
          db.prepare('INSERT INTO sessions(token,expires) VALUES (?,?)').run(hash(fresh),now+expiresMs);
          res.setHeader('Set-Cookie',cookie(fresh)); return json(res,200,{ok:true});
        }
        if(!authenticated) return json(res,401,{error:'请重新登录后同步，本机记录仍然保留'});
        if(path==='/api/logout' && req.method==='POST') {
          db.prepare('DELETE FROM sessions WHERE token=?').run(tokenHash);
          res.setHeader('Set-Cookie',`journal_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0${secure?'; Secure':''}`);
          return json(res,200,{ok:true});
        }
        if(path==='/api/sync' && req.method==='POST') {
          const body=await readJson(req);
          try { return json(res,200,{records:applyMutations(db,body.mutations),acknowledged:body.mutations.map(m=>m.mutationId)}); }
          catch(e) { return json(res,400,{error:e.message}); }
        }
        if(path==='/api/backup' && req.method==='GET') {
          const file=join(backupDir,`download-${randomBytes(8).toString('hex')}.sqlite`);
          try {
            await backup(db,file);
            const bytes=await readFile(file);
            res.writeHead(200,{'Content-Type':'application/vnd.sqlite3','Content-Disposition':'attachment; filename="journal-backup.sqlite"','Cache-Control':'no-store'});res.end(bytes);
          } finally { await unlink(file).catch(()=>{}); }
          return;
        }
        return json(res,404,{error:'接口不存在'});
      }
      if(!['GET','HEAD'].includes(req.method)) return json(res,405,{error:'请求方式不支持'});
      const root=resolve(staticDir); const decoded=decodeURIComponent(path);
      if(decoded.split('/').some(part=>part.startsWith('.')))return json(res,404,{error:'文件不存在'});
      let file=resolve(root,'.'+decoded);
      if(!file.startsWith(root+sep) && file!==root) return json(res,403,{error:'路径无效'});
      let info=await stat(file).catch(()=>null);
      if(!info?.isFile()) {
        if(extname(file)) return json(res,404,{error:'文件不存在'});
        file=join(root,'index.html');info=await stat(file).catch(()=>null);
      }
      if(!info) return json(res,503,{error:'请先运行 npm run build'});
      res.writeHead(200,{'Content-Type':mime[extname(file)]??'application/octet-stream','Cache-Control':path.startsWith('/assets/')?'public, max-age=31536000, immutable':'no-cache'});
      res.end(req.method==='HEAD'?undefined:await readFile(file));
    } catch(e) {
      logger.error('Request failed:',e.message);
      if(!res.headersSent) json(res,e.status??500,{error:e.status?e.message:'服务器暂时无法完成操作，请稍后重试'});
      else res.end();
    }
  });
}
