import { readdir,readFile,writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join } from 'node:path';

async function files(dir,prefix=''){
  const result=[];
  for(const item of await readdir(dir,{withFileTypes:true})){
    if(item.name==='sw.js')continue;
    const path=prefix+'/'+item.name;
    if(item.isDirectory())result.push(...await files(join(dir,item.name),path));else result.push(path);
  }return result;
}
const assets=await files('dist');
const digest=createHash('sha256');for(const file of assets)digest.update(await readFile('dist'+file));
const version=digest.digest('hex').slice(0,12);
const worker=`const CACHE='little-days-${version}';
const ASSETS=${JSON.stringify(assets)};
self.addEventListener('install',event=>{event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(ASSETS)));});
self.addEventListener('activate',event=>{event.waitUntil((async()=>{for(const key of await caches.keys())if(key.startsWith('little-days-')&&key!==CACHE)await caches.delete(key);await self.clients.claim();})());});
self.addEventListener('message',event=>{if(event.data?.type==='SKIP_WAITING')self.skipWaiting();});
self.addEventListener('fetch',event=>{
  const url=new URL(event.request.url);
  if(event.request.method!=='GET'||url.origin!==self.location.origin||url.pathname.startsWith('/api/'))return;
  if(event.request.mode==='navigate'){
    // Keep the shell and its hashed assets on one version until the user accepts an update.
    event.respondWith(caches.open(CACHE).then(cache=>cache.match('/index.html')).then(hit=>hit||fetch(event.request)));return;
  }
  if(ASSETS.includes(url.pathname))event.respondWith(caches.open(CACHE).then(cache=>cache.match(event.request)).then(hit=>hit||fetch(event.request)));
});
`;
await writeFile('dist/sw.js',worker);console.log(`Offline shell ${version}: ${assets.length} assets cached; API responses are never cached.`);
