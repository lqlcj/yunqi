import { randomBytes } from 'node:crypto';
import { writeFile,access } from 'node:fs/promises';
try{await access('.env');console.log('.env 已存在，未修改。');}catch{
  const password=randomBytes(18).toString('base64url');
  await writeFile('.env',`APP_PASSWORD=${password}\nAPP_ORIGIN=http://localhost:3000\nHOST=127.0.0.1\nPORT=3000\nDATA_DIR=./data\n`,{mode:0o600,flag:'wx'});
  console.log('已创建 .env，内含随机访问密码。请在本机打开该文件查看 APP_PASSWORD。');
}
