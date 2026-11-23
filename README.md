# 青孕期健康记录

为一位使用 iPhone 的家庭成员设计的记录本：血糖、血压、宫缩计时与疼痛程度、历史记录、看诊报告。应用与报告标题默认显示 **预产期：2027年1月13日**，全部日期按 **Asia/Shanghai（UTC+8）** 处理。

## 已实现

- 血糖单位 mmol/L：空腹目标 `< 5.1`，早餐、午餐、晚餐后两小时目标 `< 6.7`。等于目标也标记，复测单独保存；目标可按医嘱修改，历史标记采用当前目标。
- 血压记录高压、低压、可选心率、实际测量时间和备注。每日次数不限，默认提示每天 1～2 次，提示可编辑。
- 宫缩一键开始、结束；开始时间立即保存，刷新或重新打开可恢复。支持无痛、轻微、中等、强烈四级疼痛，选填且可修改。页面展示开始时间、持续时长、间隔时长，CSV 额外保留休息秒数。
- 宫缩间隔时长按两次开始计算；超过两小时不连接为连续计时。这是应用的分段规则，不是就医阈值。提醒阈值采用 NHS 联系建议，《正常分娩指南》作为背景资料，链接在宫缩页。
- 按日期和类型查看历史，补记、编辑、删除。
- 看诊报告包含日期范围、预产期、单位、上海时区、每次原始读数、疼痛与备注。支持手机截图、CSV、浏览器打印／保存为 PDF。
- 单账号密码登录，HttpOnly / SameSite 会话；HTTP API 需要认证，不缓存到 Service Worker。
- IndexedDB 本地保存 + 持久待上传队列；联网并打开应用时同步到 VPS SQLite。操作 ID 去重，响应不会覆盖上传期间新做的本机修改；删除使用墓碑记录防止旧数据复活。
- PWA 应用壳离线缓存、主屏幕图标、新版本提示；有正在进行的宫缩或录入表单时延后更新提示。
- JSON 完整备份与合并恢复；SQLite 在线备份与下载，保留最近 30 个备份日期。
- 登录页和设置页提供跟随系统、浅色、深色三种外观。选择保存在当前设备，自动跟随系统变化；打印报告始终使用白底。

## 技术与目录

采用 **React + TypeScript + Vite**、**Node.js 24 内置 HTTP 与 SQLite**、原生 IndexedDB 和 Service Worker。后端运行时无需安装 npm 依赖。

```text
src/              手机与桌面界面、本地数据与同步
shared/           上海时间、医嘱目标、宫缩计算、验证与导出
server/           登录、同步接口、SQLite、备份与恢复
public/           PWA manifest 与应用图标
scripts/          开发启动、首次配置、离线缓存构建
tests/            数据/API 测试和浏览器端到端测试
compose.yaml      应用 + Caddy 部署
```

## 本机启动

首次上传此工作目录到 `lqlcj/yunqi` 可运行 `node scripts/publish.mjs`。后续提交、Docker 部署和更新见 [部署与更新说明](docs/deployment.md)。

需要 Node.js **24.15 或更高的 24.x**。

```sh
npm ci
node scripts/setup.mjs
npm run build
npm start
```

Windows PowerShell 若禁止执行 `npm.ps1`，使用 `npm.cmd`。打开 `http://localhost:3000`，登录密码在本机生成的 `.env` 的 `APP_PASSWORD` 项。首次配置会生成随机密码，已有 `.env` 不会覆盖。

### Vite 模拟预览与 Quick Tunnel

```sh
npm run dev -- --host 0.0.0.0
```

打开 `http://localhost:5173`，测试密码 **`qing-demo-2027`**。该命令同时启动 Vite 与专用模拟 API，首次生成完整 30 天的 336 条模拟记录。模拟库位于 `test-results/vite-preview/`，修改会保存且重启后保留；正式应用继续使用 `npm start` 及 `.env` 配置的数据目录。

自行启动 Quick Tunnel 时，将目标设为 `http://localhost:5173`：

```sh
cloudflared tunnel --url http://localhost:5173
```

Vite 已允许 `*.trycloudflare.com` 预览域名；API 在验证请求来自当前访问地址后转发，因此不需要每次修改 `APP_ORIGIN`。Tunnel 的 HTTPS 访问使用 Secure 会话 Cookie。测试密码只用于模拟预览。

端口固定为 5173，已被占用时会明确报错。Windows PowerShell 如拦截 `npm.ps1`，把命令中的 `npm` 换成 `npm.cmd`。开发模式不注册 Service Worker，完整 PWA 离线能力使用生产构建验证。

## VPS 部署（Linux + Docker Compose）

**从 Git 仓库部署：**

```sh
git clone https://github.com/lqlcj/yunqi.git
cd yunqi
cp .env.example .env
# 编辑 .env，设置真实密码、APP_ORIGIN 与 DOMAIN
docker compose up -d --build
```

Git 仓库不包含 `dist/`，普通 Dockerfile 会自动构建。后续更新、备份和已有反向代理接入见 [部署与更新说明](docs/deployment.md)。版本变更见 [CHANGELOG.md](CHANGELOG.md)。

**已有成品包时推荐这一方式：** 上传 `release/qing-pregnancy-v1.0.3.zip` 到 VPS 并解压，进入 `qing-pregnancy` 目录。包内包含已经构建并测试的 `dist/`，不含访问密码或个人记录。按下面说明配置 `.env` 后启动：

```sh
docker compose -f compose.yaml -f compose.prebuilt.yaml up -d --build
```

这一路径只需要拉取 Node/Caddy 基础镜像，不需要在 VPS 安装 npm 依赖。下面的普通 Compose 命令则会从源码构建。选择预构建方式后，更新、查看日志等命令也建议保持同一组 `-f` 参数。

1. 将项目上传 VPS，不上传 `.env`、`data`、`.cache`、`node_modules`、`test-results`。
2. 域名 A / AAAA 解析到该 VPS，开放 80 / 443；已有网站占用这两个端口时，使用现有反向代理接入应用。
3. 复制配置并设置真实域名与随机密码：

```sh
cp .env.example .env
```

```dotenv
APP_PASSWORD=请替换为至少12字符的随机密码
APP_ORIGIN=https://baby.your-domain.com
DOMAIN=baby.your-domain.com
```

`APP_ORIGIN` 必须与访问地址的协议、域名和端口完全一致，不带路径。不要把密码放在前端构建变量中。

```sh
docker compose up -d --build
docker compose logs --tail=80 app caddy
```

浏览器打开上述 HTTPS 域名。Caddy 自动申请证书，应用端口只在容器网络内开放。数据库与备份保存到 `journal-data` 命名卷，镜像更新不会覆盖数据。当前执行环境没有 Docker，容器启动和证书签发尚未在 VPS 实测。

更新：

```sh
docker compose exec app node server/backup.mjs
git pull --ff-only origin main
docker compose up -d --build
```

**不要使用 `docker compose down -v` 清理应用**，它会删除数据库卷。

如已有 Nginx/Caddy，可仅部署 `app`，通过额外 Compose override 将应用映射到 `127.0.0.1:3000`，由现有代理终止 HTTPS；保留正确的 `APP_ORIGIN`。

## iPhone 使用

在 Safari 打开 HTTPS 域名，登录后使用“分享 → 添加到主屏幕”。从主屏幕联网打开一次后即可缓存页面。浏览器标签页与主屏幕应用的本地存储可能分开，**添加到桌面前先确保记录已同步；在桌面应用重新登录并同步一次**。

记录首先保存到手机，随后同步。顶部明确显示已同步或待同步数量。iPhone 后台不保证执行上传，回到应用前台且有网络时会重试。宫缩根据保存的时间戳计算，不依赖后台计时器持续运行；长时间未结束会提示核对。

离线访问使用之前已经登录的本机记录。会话过期后仍能离线记录，重新登录后同步；仅在私人设备使用。退出前必须完成同步并结束宫缩；退出会清除本机数据，服务器已保存记录保留。

CSV 可保存到“文件”并用表格应用打开。打印页面仅显示报告；iPhone 的打印／PDF 分享入口依系统版本可能不同，也可以直接截图。

## 备份与恢复

**日常推荐：设置 → 导出完整备份。** JSON 包含本机记录、设置和删除标记，可以从设置页恢复。恢复采用合并方式，相同编号以较新的记录为准，不清空原数据；修改后的导入文件会先整体校验。

服务器启动时与之后每 6 小时生成／更新上海日期对应的备份，保留最近 30 个备份日期。应用停止期间不会执行定时任务。同一天的自动备份会覆盖此前同一天的快照。

```sh
docker compose exec app node server/backup.mjs
docker compose cp app:/app/data/backups ./server-backups
```

备份请另存电脑或其他存储；与数据库同盘的备份不能防止 VPS 整盘丢失。SQLite 完整下载包含会话表，不要公开分享。

SQLite 恢复提供 `server/restore.mjs`，要求停止应用，并恢复到**空目录**，避免覆盖唯一原件：

```sh
# 在装有 Node.js 24 的机器上，先停掉使用目标目录的服务
DATA_DIR=./restored-data node server/restore.mjs ./journal-backup.sqlite --server-stopped
```

脚本检查数据库完整性与记录格式后恢复，并清除旧登录会话。确认恢复结果后再把部署的数据目录切换到恢复目录。Docker 部署建议优先通过应用内 JSON 合并恢复；需要整库替换时先备份整个卷，停止服务后再操作。

## 验证

```sh
npm run build
npm test
npm run test:e2e
npm run test:month
npm run test:readability
```

浏览器测试使用独立临时数据库，不会向真实记录写入示例数据。默认使用 Windows 已安装的 Chrome；其他环境通过 `CHROME_PATH` 指定 Chrome / Chromium 路径。

浏览器测试覆盖登录、血糖边界、血压录入、宫缩刷新恢复与疼痛、离线记录后重载与重连去重、编辑、报告和 CSV/PDF、JSON 备份恢复、删除、手机／桌面排版。测试将浏览器时区设为美国洛杉矶以验证界面仍按上海时间运行。

`test:month` 生成截至昨天的连续 30 个完整上海日：126 次血糖（含六次复测）、58 次血压（含单日四次）、152 次宫缩（含跨午夜），共 336 条模拟记录。浏览器实际操作验证断网导入与重载、100 条分批同步、完整报告/CSV、7/14/30 天筛选、边界值、无效备份整批拒绝、修改/删除后的旧备份恢复、会话过期、同步响应延迟、双标签页计时和 SQLite 下载。另用固定 00:30 时钟验证最近一小时宫缩跨日统计。手机/平板/桌面宽度覆盖 320、375、390、768、1440 像素。

验证产物保存在 `test-results/month/`：模拟 JSON、CSV、PDF、截图和 `verification.json`。模拟读数仅用于软件测试。

Vite 预览启动后运行 `npm run test:preview`，验证三种主题、系统自动切换、刷新记忆、标签页同步、深色录入、五页手机/桌面排版、白底打印、模拟 Quick Tunnel 域名的登录/同步、同源校验与文件访问限制。结果和截图在 `test-results/theme/`。测试模拟 Tunnel 请求头，未创建实际公网 Tunnel。

需要在浏览器查看整月示例时，构建后运行 `npm run demo`，打开 `http://127.0.0.1:3108`，测试密码 `qing-demo-2027`。每次启动都会在 `test-results/mock-preview/` 下建立独立测试库，只监听本机地址，不读取 `.env` 或修改正式 `data/`。这组固定密码仅用于本机模拟预览。

1.0.1 已移除首页介绍卡片并统一应用名称。保留旧版本的 IndexedDB 名称、缓存前缀和 JSON 格式标识，以兼容已有本机记录和备份。

自动化浏览器模拟不能替代 iPhone 真机验证。正式积累数据前，请在实际 Safari 和主屏幕应用中各验证一次：登录、锁屏后宫缩恢复、断网保存与重新联网、截图／导出、备份恢复。

## 使用边界

### 宫缩时间与提醒（1.0.3）

页面、历史和报告统一展示 **开始时间、持续时长、间隔时长**；间隔按两次开始时间计算。首页和宫缩页根据近期记录提醒：间隔 ≤ 5 分钟提示关注，持续 > 2 分钟或最近 10 分钟 ≥ 6 次提示立即联系产科。单次短间隔不能确认临产，早产征兆及破水、出血、胎动减少不应等待阈值。资料来源、展示窗口及后台限制见 [宫缩记录与提醒依据](docs/contractions.md)，应用的“参考资料与提醒规则”中也可查看。

浅色界面已提高正文与说明文字对比度；打印使用深色文字、白底及较大字号，不受当前深色主题影响。`test:readability` 使用独立整月模拟库，检查可见文本对比度、两种主题的 PDF、宫缩阈值边界、跨日、刷新恢复、修改和删除。产物在 `test-results/readability/`。

这是记录和展示工具，血糖目标来自家庭提供的医嘱。应用不自动诊断高血压，不判断是否临产或预计多久分娩。血压目标未提供，因此不擅自设置阈值。

同步按单人使用设计；同一浏览器标签页之间通过本地事务和锁协调。多台设备同时编辑同一条记录时，以服务器最后收到的操作为准，没有多人冲突合并界面。
