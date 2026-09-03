# __PKG_NAME__

> 个人全栈项目脚手架。从某全栈项目抽离公共框架而来:可视化大屏(只读)+ 后台管理系统(配置台)+ NestJS 后端(SQLite)。业务主线:**后台配置 → SQLite → 大屏消费**。

本项目由 `create-ssnode-app` 生成 —— 包名/标题/DB 名/密钥已自动替换注入,「必改清单」第 1、2 类已完成,只剩部署凭证与 lockfile 两项手工步骤。框架层(双轨鉴权、SQLite 加固、docker/systemd/pm2 部署引擎、Capistrano 回滚)开箱即用,业务面已收敛到最小示例。

---

## 技术栈

- **web**(`web/`)— Vite + React18 + AntD5 + Recoil + Echarts,dev 端口 6177。
- **backend**(`backend/`)— NestJS + SQLite(better-sqlite3)+ TypeORM + yaml 多环境,dev 端口 3001,全局前缀 `/api`。

根命令:`pnpm dev`(web+backend 并行)/ `pnpm build` / `pnpm lint` / `pnpm publish`(发 web+backend;`--only web|backend` 单发)/ `pnpm rollback`。

dev 时 vite proxy 把 `/api`、`/ws`、`/static/uploads` 转给 `localhost:3001`;前端同源请求,`web/public/env.config.js` 的 `requestBaseUrl` 留空。

## 必改清单(生成项目只做 3、4;1、2、5 已由脚手架完成)

若走 `cp -r` 老路手动拷模板,才需要按序改这 5 类:

### 1. 包名 / 标题(身份)— ✅ 已由脚手架完成
- 根 `package.json`:`name`、`description`
- `web/package.json`:`name`、`description`(同时影响 `pnpm --filter web` 与 `backend/scripts/build.cjs` 的 `safeName`)
- `backend/package.json`:`name`、`description`
- `web/config/project.config.ts`:`title`(后台顶栏 + 登录页品牌)
- `backend/src/main.ts`:Swagger `.setTitle(...)`
- 根 `scripts/publish.cjs`、`rollback.cjs`:若改了 web/backend 包名,同步改 `--filter` 名

### 2. 密钥(占位值,务必替换)— ✅ 已由脚手架生成并前后端成对注入
dev/prod 两套密钥已生成并写入下列位置(超管密码见生成时控制台输出):
- **大屏签名密钥** `appSign.signKey`(HMAC,前后端逐字一致):
  - `web/.env.development` + `web/.env.production` 的 `VITE_APP_SIGN_KEY`
  - `backend/config/config.develop.yaml` + `config.prod.yaml` 的 `appSign.signKey`
- **JWT secret**:backend 两份 yaml 的 `jwt.secret`
- **超管密码**:backend 两份 yaml 的 `admin.password`(启动 reconcile 到 DB)
- **docker 部署**:`backend/ops/docker/.env.example` 的 `JWT_SECRET`/`ADMIN_PASSWORD`/`APP_SIGN_KEY`(拷为服务器 `.env` 后改真值)

### 3. 部署凭证(本地、不入库)
- `web/scripts/server.config.json`:从 `server.config.example.json` 拷,填 SSH host/账号/密码/部署路径(已 `.gitignore`)
- `backend/scripts/server.config.cjs`:从 `server.config.example.cjs` 拷,填 SSH + `backendServiceDir`(已 `.gitignore`)

### 4. backend lockfile(首次部署前重生)
模板**未带** `backend/package-lock.json`(供 Dockerfile `npm ci` 的真 npm lockfile)。首次部署前在 `backend/` 下重生,避开 pnpm 符号链污染:
```bash
mkdir -p /tmp/be-lock && cp backend/package.json /tmp/be-lock/ \
  && (cd /tmp/be-lock && npm install --package-lock-only --omit=dev --legacy-peer-deps \
  && cp package-lock.json <repo>/backend/)
```
详见 `backend/scripts/build.cjs::validateLockfile`。

### 5. 业务面(按需替换示例)— 部分由脚手架保留,业务扩展仍手工
模板带 **1 个端到端示例**:column 栏目模块(后端 module + 签名 screen 端点 + 后台 CRUD + 大屏消费 + mock 兜底)。照它扩自己的业务:
- 大屏清单/分辨率:`web/config/screen.config.ts`(默认 1 屏 `lanmu` 1920×1080)
- 路由树/后台菜单:`web/config/router.config.ts`
- 分组枚举(前后端镜像,改要两处同步):`web/src/config/column-hall.config.ts` + `backend/src/modules/column/column-hall.ts`
- 新增后端模块:`backend/src/modules/<x>/` + `entities/` + 迁移 + `app.module.ts` 注册
- 新增大屏受保护接口:controller 路由加 `@UseGuards(AppSignGuard)`

---

## 核心架构(框架层,通常不用改)

### 响应契约
所有接口统一返回 `{ code, message, data }`(HTTP 200)。前端 `web/src/services/api.ts` 按 `res.code !== 200` 判业务失败,401 跳登录;`request.ts` 正常分支返回 `res.data`。后端 `backend/src/common/transform.interceptor.ts` 统一包装。

### 双轨鉴权
| 入口 | 机制 | 关键文件 |
|---|---|---|
| 后台 `/background` | JWT,`Authorization: Bearer`,8h | `backend/src/modules/auth/` + `JwtAuthGuard` |
| 大屏 `/screen` | 签名加密(无 token、无过期) | `backend/src/common/app-sign.guard.ts` |

大屏签名:三头 `X-App-Ts`/`X-App-Nonce`/`X-App-Sign`(HMAC-SHA256 hex)。后端校验 ts 窗口 ±300s + nonce LRU 去重 + `timingSafeEqual`。前端独立实例 `web/src/services/app-request.ts`(**不复用**后台 `request` 单例,避免 Authorization 头污染)。详见 `docs/api-security.md`。

### 数据库(TypeORM + SQLite)
- prod `synchronize:false`,靠迁移建表;develop `synchronize:true`。
- 迁移 `backend/src/database/migrations/*.ts`;`sqlite.config.ts` 的 `migrations` 用**显式 import**(非 glob——单文件 bundle 下 glob 落空致 prod 不建表)。
- 新增实体后 `pnpm --filter backend migration:generate src/database/migrations/xxxx`。
- WAL + PRAGMA 加固:`journal_mode=WAL / synchronous=NORMAL / busy_timeout=5000 / foreign_keys=ON`。
- DB 文件名程序定死:`template.prod.sqlite`/`template.dev.sqlite`(改名要同步 `sqlite.config.ts`、`configuration.ts`、`ops/sqlite/config.sh`、ops 探针)。

### 后台主题(Airtable 风格)
仅作用于 `/background` 后台路由树;大屏端不套此主题。入口:`web/src/styles/theme.ts`(`airtableTheme`)→ `Background.tsx` 的 `<ConfigProvider>`。
UI 规范见 `docs/airtable/DESIGN.md`;后期想换自己的风格:替换/修改 `theme.ts` 的 token 即可,该规范文档可删。

### backend 构建(单文件 bundle)
- `pnpm --filter backend build` = webpack 单文件打包 `src/main.ts` → `dist/main.js`,自动 bump version。
- `pnpm --filter backend buildops` = build 之后组装运维包到 `backend/release/`。
- **关键 gotcha**:webpack 必须 `mode:'none'`(非 production)。production mode 会把 `process.env.NODE_ENV` 替换成 `"production"`,而本应用按 `'prod'`/`'develop'` 选 yaml → 回退 develop、isProd 恒 false。
- **关键 gotcha**:`backend/package-lock.json` 必须是真 npm lockfile(见上方第 4 步)。
- **关键 gotcha**:better-sqlite3 v13 不发布预编译二进制,需 python3/make/g++ 源码编译;`node:22-slim` Dockerfile 已 `apt-get install python3 make g++`。

### 部署 + 发布/回滚
**职责下沉**:发布/回滚下沉到各服务;backend 把部署力学整体下沉到服务器侧纯 shell(`backend/ops/install.sh` 单一真相源)。
- 根 `scripts/publish.cjs`/`rollback.cjs`:薄编排,spawn 子服务,TTY 透传。
- **web**(`web/scripts/`):SSH 上传 dist + 版本备份链 `dist_bak`/`dist_last_bak.tar.gz`,配置 `web/scripts/server.config.json`(本地、不入库)。
- **backend**(`backend/scripts/` + `backend/ops/`):buildops → tar → scp → 触发 `install.sh`。服务器侧支持 docker/systemd/pm2 三模式,Capistrano 式 `releases/<ver>-<ts>` + `current` 软链原子切换,`versionswitch.sh` 可升可降。SQLite 定时备份由宿主 cron 调 `backend/ops/sqlite/backup.sh`。

### 运维监控(ops 模块)
后台 `/background/yunwei/ops` 只读展示 SQLite 备份状态,走 JWT 鉴权。`OpsProbe` 接口 + 探针数组注入,新增探针 = 新文件 + `ops.module.ts` providers 加一行,前端零改动。

---

## 常改文件速查
| 改什么 | 去哪 |
|---|---|
| 接口契约 / 请求拦截 | `web/src/services/api.ts`、`request.ts`、`app-request.ts` |
| 新增大屏受保护接口 | 对应 controller 路由加 `@UseGuards(AppSignGuard)` |
| 后台主题 token | `web/src/styles/theme.ts` |
| 大屏清单 / 分辨率 | `web/config/screen.config.ts` |
| 路由 | `web/config/router.config.ts` |
| 后端 yaml 配置 | `backend/config/config.{develop,prod}.yaml` |
| 发布/回滚编排 | `scripts/publish.cjs`、`rollback.cjs` |
| web 部署配置 | `web/scripts/server.config.json`(本地) |
| backend 部署配置 | `backend/scripts/server.config.cjs`(本地) |
| backend 部署力学(shell) | `backend/ops/install.sh` + `ops/<mode>/*.sh` |
| 数据库迁移 / 建表 | `backend/src/database/migrations/`、`scripts/data-source.ts` |
| 运维监控探针 | `backend/src/modules/ops/` |
| 示例业务模块(参照) | `backend/src/modules/column/` + `web/src/pages/{ScreenLanMu,Backend/Column}/` |

## 范围边界
- **不建 `packages/shared`**:前后端各自声明类型(如 hall 枚举两处镜像),不引 `workspace:*`。
- **后端不托管前端静态**:前后端分别部署 + nginx 转发。
