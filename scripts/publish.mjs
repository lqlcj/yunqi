/** Run on the developer's own machine: node scripts/publish.mjs */
import { spawnSync } from 'node:child_process';
import { existsSync,readFileSync } from 'node:fs';
import { resolve,dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
// The initial .git may be owned by CodexSandboxOffline. Trust only this exact
// project for these Git processes; do not change the user's global configuration.
const gitOptions=['-c',`safe.directory=${root.replaceAll('\\','/')}`];
const repository='https://github.com/lqlcj/yunqi.git';
const sourcePaths=[
  '.dockerignore','.env.example','.gitattributes','.github','.gitignore',
  'Caddyfile','CHANGELOG.md','Dockerfile','Dockerfile.prebuilt','Dockerfile.prebuilt.dockerignore',
  'README.md','VERIFICATION.md','compose.yaml','compose.prebuilt.yaml','docs','index.html',
  'package.json','package-lock.json','public','scripts','server','shared','src','tests','tsconfig.json','vite.config.ts',
];
function git(args,{capture=false,allowFailure=false}={}){
  const result=spawnSync('git',[...gitOptions,...args],{cwd:root,encoding:'utf8',stdio:capture?['inherit','pipe','pipe']:'inherit'});
  if(result.error)throw result.error;
  if(result.status!==0&&!allowFailure)throw new Error(capture?(result.stderr.trim()||`git ${args[0]} 失败`):`git ${args[0]} 失败；已停止，未强制覆盖远端。`);
  return capture?{status:result.status,text:result.stdout??''}:result;
}
function output(args){return git(args,{capture:true}).text.trim();}
try{
  if(!existsSync(resolve(root,'.git')))git(['init','-b','main']);
  if(resolve(output(['rev-parse','--show-toplevel'])).toLowerCase()!==root.toLowerCase())throw new Error('请在本项目自己的 Git 仓库内运行。');
  if(output(['diff','--name-only','--diff-filter=U']))throw new Error('存在未解决的合并冲突，请先运行 git status 并解决冲突。');
  const current=git(['remote','get-url','origin'],{capture:true,allowFailure:true});
  if(current.status!==0)git(['remote','add','origin',repository]);
  else if(!['https://github.com/lqlcj/yunqi','https://github.com/lqlcj/yunqi.git','git@github.com:lqlcj/yunqi.git'].includes(current.text.trim()))throw new Error('origin 指向其他仓库；已停止，请核对 git remote -v。');

  // Establish connectivity before changing the index. Git handles authentication normally.
  const remote=output(['ls-remote','--symref','origin','HEAD']);
  const target=remote.match(/^ref: refs\/heads\/(.+)\s+HEAD$/m)?.[1]??'main';
  git(['check-ref-format',`refs/heads/${target}`]);
  git(['fetch','origin']);
  git(['add','--',...sourcePaths.filter(p=>existsSync(resolve(root,p)))]);
  git(['diff','--cached','--check']);

  const files=git(['diff','--cached','--name-only','--diff-filter=ACMR','-z'],{capture:true}).text.split('\0').filter(Boolean);
  const blocked=files.filter(p=>/(^|\/)(?:data|backups|test-results|node_modules|dist|release|\.cache|\.aws|\.codex|\.agents)(\/|$)/.test(p)||/(^|\/)\.env(?:$|\.(?!example$))/.test(p)||/\.(?:sqlite(?:3)?(?:-(?:wal|shm))?|db(?:-(?:wal|shm))?|pem|key|p12|pfx)$/i.test(p));
  if(blocked.length)throw new Error('待提交列表包含本机数据或凭据文件：'+blocked.join(', '));
  const envPath=resolve(root,'.env');
  const secrets=existsSync(envPath)?readFileSync(envPath,'utf8').split(/\r?\n/).flatMap(line=>{
    const match=line.match(/^\s*(\w+)\s*=\s*(.*)$/);
    if(!match||!/PASSWORD|TOKEN|SECRET|PRIVATE_KEY|API_KEY/i.test(match[1]))return [];
    const value=match[2].trim().replace(/^(['"])(.*)\1$/,'$2');return value.length>=8?[value]:[];
  }):[];
  for(const path of files){
    const content=git(['show',`:${path}`],{capture:true}).text;
    if(secrets.some(secret=>content.includes(secret)))throw new Error(`检测到 .env 中的敏感值出现在待提交文件 ${path}，请移除后重试。`);
  }
  const changes=git(['diff','--cached','--quiet'],{allowFailure:true});
  if(changes.status===1)git(['commit','-m',process.argv[2]??'Initialize Qing pregnancy health journal v1.0.3']);
  else if(changes.status!==0)throw new Error('无法检查暂存区，已停止。');

  const ref=`refs/remotes/origin/${target}`;
  if(git(['rev-parse','--verify',ref],{capture:true,allowFailure:true}).status===0){
    // A README created on GitHub may have independent history. Preserve both histories; conflicts stop normally.
    git(['merge','--allow-unrelated-histories','--no-edit',ref]);
  }
  git(['push','-u','origin',`HEAD:refs/heads/${target}`]);
  const head=output(['rev-parse','HEAD']);
  const uploaded=output(['ls-remote','origin',`refs/heads/${target}`]).split(/\s+/)[0];
  if(head!==uploaded)throw new Error('远端提交与本地不一致，请检查远端是否有同时更新。');
  console.log(`上传成功：lqlcj/yunqi，分支 ${target}，提交 ${head.slice(0,12)}。`);
}catch(error){console.error(error.message);process.exitCode=1;}
