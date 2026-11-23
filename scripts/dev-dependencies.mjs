import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import { dirname, resolve, sep } from 'node:path';

export const previewDependencies=['react','react-dom/client','react/jsx-dev-runtime','react/jsx-runtime'];
/** Resolve only this app's React dependencies without esbuild traversing Windows parent directories. */
export function workspaceDependencies(){
  const require=createRequire(import.meta.url);
  const entries=new Map(previewDependencies.map(id=>[id.replaceAll('/','_'),require.resolve(id)]));
  const root=resolve('node_modules')+sep;
  return {name:'workspace-react-dependencies',setup(build){
    build.onResolve({filter:/.*/},args=>{
      let path;
      if(args.kind==='entry-point')path=entries.get(args.path);
      else if(args.namespace==='workspace-dependency')path=createRequire(args.importer).resolve(args.path);
      if(!path)return;
      if(!resolve(path).startsWith(root))throw new Error('开发依赖必须位于项目 node_modules 内');
      return {path,namespace:'workspace-dependency'};
    });
    build.onLoad({filter:/.*/,namespace:'workspace-dependency'},async args=>({contents:await readFile(args.path,'utf8'),loader:'js',resolveDir:dirname(args.path)}));
  }};
}
