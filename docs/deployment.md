# 从 Git 部署与更新

仓库：`https://github.com/lqlcj/yunqi`

源码、锁定依赖、Docker 配置和测试由 Git 管理。`.env`、SQLite、备份、测试输出、`node_modules`、`dist` 和本地发布包不进入仓库。测试中的合成数据可保留用于回归，生产启动不会导入它们。

## 首次部署

VPS 需安装 Git、Docker Engine 和 Docker Compose 插件；有一个已解析到 VPS 的域名。默认配置由 Caddy 使用 80/443 提供 HTTPS。已有反向代理时按下面的说明接入。

```sh
git clone https://github.com/lqlcj/yunqi.git
cd yunqi
cp .env.example .env
```

在 VPS 编辑 `.env`，至少填写：

```dotenv
APP_PASSWORD=请替换为至少12字符的随机密码
APP_ORIGIN=https://baby.your-domain.com
DOMAIN=baby.your-domain.com
```

密码使用随机值；不要使用预览密码 `qing-demo-2027`。`APP_ORIGIN` 与访问地址的协议、域名及端口一致，不带路径。

```sh
docker compose config --quiet
docker compose up -d --build
docker compose ps
docker compose logs --tail=80 app caddy
```

`Dockerfile` 在构建阶段安装依赖并编译前端，运行阶段仅包含产物和服务端，使用非 root 用户。SQLite 放在 `journal-data` 命名卷中。Compose 项目名固定为 `yunqi`，正常创建的数据库卷名称为 `yunqi_journal-data`，避免因项目目录改名切换到另一个空卷。

如果 VPS 已经部署过旧配置并写入数据，先确认原来的卷名并备份，再迁移；不要直接把旧数据卷当成空库。应用已做自动备份，但请另存一份到 VPS 之外。

## 更新已有部署

在同一目录内执行，先备份再更新：

```sh
docker compose exec app node server/backup.mjs
git pull --ff-only origin main
docker compose up -d --build
docker compose ps
```

`.env` 不在 Git 中，正常拉取代码不会覆盖它；重建应用容器保留命名卷。**不要运行 `docker compose down -v`**，它会删除数据库及 Caddy 的持久卷。PWA 打开后会出现新版本提示，点击更新。

`--ff-only` 遇到 VPS 本地代码修改会停下，避免自动产生未检查的合并。只把环境配置留在 `.env`，源码修改在开发机提交。

## 已有 Nginx 或 Caddy

创建本机专用的 `compose.override.yaml`（已被 Git 忽略），将应用仅映射到回环地址：

```yaml
services:
  app:
    ports:
      - "127.0.0.1:3000:3000"
```

只启动应用，由已有代理将 HTTPS 请求转发到 `http://127.0.0.1:3000`：

```sh
docker compose up -d --build app
```

保留真实的 HTTPS `APP_ORIGIN`；`DOMAIN` 可以填相同域名供 Compose 校验。无需启动本项目的 `caddy` 服务。

## 开发机继续迭代

当前项目首次上传可在项目目录运行：

```sh
node scripts/publish.mjs
```

脚本检查仓库地址与待提交文件，排除本机数据并检查实际 `.env` 的敏感值是否误写入源码，再提交和推送；已有远端历史会保留。如果 GitHub 提示登录，通过本机 Git 的凭据登录流程操作。发生合并冲突时会停止，不会强制推送；运行 `git status` 查看并解决冲突后重试。脚本最后比较远端与本地提交编号，确认上传结果。

如果最初的 `.git` 由 `CodexSandboxOffline` 创建，脚本会在当前 Git 命令中仅将本项目绝对路径加入 `safe.directory`，处理仓库所有者不同导致的 `dubious ownership`，不会修改全局 Git 配置或信任全部目录。该设置不改变文件系统权限，运行脚本的账号仍需能够写入 `.git` 并连接 GitHub。

以后修改可使用以下常规 Git 流程：

```sh
npm run build
git status
git add src shared server public scripts docs README.md
git diff --cached
git commit -m "描述这次修改"
git push origin main
```

按实际变动添加配置文件。版本号在 `package.json` 与 `package-lock.json` 保持一致；功能更新记录在 `CHANGELOG.md`。不要求每次修改都创建版本标签，确定发布时再打标签。

GitHub Actions 配置会在提交后执行构建、Compose 配置校验、Docker 镜像构建和容器健康/登录/同步检查。它使用测试密码和临时数据，不会自动部署 VPS 或发布镜像。Actions 是否通过应以仓库中的实际执行结果为准。

## 预构建包

Git 仓库不包含 `dist/`。从 Git 克隆后使用普通 `docker compose up -d --build`，不需要手动构建前端。

`compose.prebuilt.yaml` 只用于包含 `dist/` 的发布 ZIP，或在本机先执行 `npm ci && npm run build` 的目录；不能直接对刚克隆的仓库使用它。

Docker 配置以 Docker 官方 Compose 文档为依据：
https://docs.docker.com/compose/how-tos/environment-variables/variable-interpolation/
