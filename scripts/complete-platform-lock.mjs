// Complete platform-specific optional packages from their parent manifests.
// An offline Windows npm cache can omit entries for other operating systems.
import { readFile,writeFile } from 'node:fs/promises';
const file='package-lock.json';const lock=JSON.parse(await readFile(file,'utf8'));
for(const [path,entry] of Object.entries(lock.packages)){
  if((entry.version && /^\d+\.\d+\.\d+$/.test(entry.version))||!entry.optional)continue;
  const split=path.lastIndexOf('/node_modules/');const parent=path.slice(0,split);const name=path.slice(split+'/node_modules/'.length);
  const version=name==='fsevents'?'2.3.3':lock.packages[parent]?.optionalDependencies?.[name];
  if(!version)throw new Error('Cannot determine optional package version: '+path);
  const short=name.split('/').at(-1);const parts=short.replace(/^rollup-/,'').replace(/^lzma-/,'').split('-');
  const os=parts[0];const cpu=parts[1];
  lock.packages[path]={version,resolved:`https://registry.npmjs.org/${name}/-/${short}-${version}.tgz`,dev:true,optional:true,os:name==='fsevents'?['darwin']:[os],...(name==='fsevents'?{}:{cpu:[cpu]})};
}
await writeFile(file,JSON.stringify(lock,null,2)+'\n');
console.log('Optional platform package entries completed.');
