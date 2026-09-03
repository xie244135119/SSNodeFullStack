# AGENTS.md

面向 AI 编码代理(Claude Code / Codex / Cursor 等)与协作者的本仓库工作指南。
人类向完整文档见 [README.md](./README.md);本文只回答「在这个仓库怎么正确干活」。

## 仓库身份

个人全栈脚手架,pnpm monorepo(`web` + `backend` 两个 workspace,Node ≥ 20.11):

- **web/** — Vite + React18 + AntD5 + Recoil + Echarts,**纯 JS(jsconfig,非 TS)**,dev 端口 6177。双端界面:只读可视化大屏 + 后台管理系统。
- **backend/** — NestJS + SQLite(better-sqlite3)+ TypeORM + yaml 多环境,TS,dev 端口 3001,全局前缀 `/api`。

业务主线:**后台配置 → SQLite → 大屏消费**。自带唯一端到端示例业务:column 栏目模块(`backend/src/modules/column/` + `web/src/pages/{ScreenLanMu,Backend/Column}/`),照它扩新业务。

## 常用命令(仓库根执行)

| 命令 | 作用 |
|---|---|
| `pnpm dev` | 并行起 web(6177)+ backend(3001) |
| `pnpm build` / `pnpm lint` | 全量构建 / 全量 lint |
| `pnpm --filter web dev` / `pnpm --filter backend dev` | 单起一端 |
| `pnpm --filter backend migration:generate src/database/migrations/<name>` | 新增实体后生成迁移(必须,见硬约束 ①) |
| `pnpm publish` / `pnpm rollback` | 发布 / 回滚(`--only web\|backend` 单发);会 SSH 真实服务器,见「禁区」 |

dev 下 vite proxy 把 `/api`、`/ws`、`/static/uploads` 转给 `127.0.0.1:3001`,前端同源请求。

## 目录地图

```
web/config/             入口配置:router.config.ts(路由树/后台菜单)、screen.config.ts(大屏清单/分辨率)、project.config.ts(标题/品牌)
web/src/services/       api.ts(接口清单+契约拦截)、request.ts(后台 JWT 实例)、app-request.ts(大屏签名实例,二者禁止复用)
web/src/styles/         theme.ts(Airtable 风格后台主题 token)
backend/src/common/     guard / filter / interceptor(响应包装、双轨鉴权)
backend/src/modules/    业务模块:auth、user、column(示例)、ops、audit、upload、page-data、screen-config、websocket
backend/src/entities/   TypeORM 实体
backend/src/database/   migrations/ + sqlite.config.ts(显式 import 注册)
backend/config/         config.develop.yaml / config.prod.yaml
backend/ops/            服务器侧部署 shell(install.sh 为单一真相源)
scripts/                根级发布/回滚薄编排
```

## 硬约束(违反 = 线上直接坏,改前自查)

1. **迁移显式注册**:`sqlite.config.ts` 的 `migrations` 数组用显式 import(glob 在单文件 bundle 下落空 → prod 不建表)。新增迁移文件后**必须**手动加进数组。
2. **webpack 必须 `mode:'none'`**:production mode 会把 `process.env.NODE_ENV` 写死成 `"production"`,而应用按 `'prod'`/`'develop'` 选 yaml → 回退 develop、isProd 恒 false。
3. **签名密钥前后端逐字一致**:`web/.env.development|production` 的 `VITE_APP_SIGN_KEY` ↔ `backend/config/*.yaml` 的 `appSign.signKey`(HMAC,大屏鉴权全靠它)。
4. **hall 枚举两处镜像**:`web/src/config/column-hall.config.ts` ↔ `backend/src/modules/column/column-hall.ts`,改一处必须同步另一处。
5. **prod 建表只靠迁移**:`synchronize:false`;develop 是 `synchronize:true` 本地免迁移,别被它骗了。
6. **web 不引 TS**:web 是 jsconfig 工程,后端才是 TS;类型前后端各自声明,不建 `packages/shared`,不用 `workspace:*`。
7. **两个请求实例禁止复用**:`request.ts`(后台,带 Authorization)与 `app-request.ts`(大屏,三头签名)独立,复用会互相头污染。
8. **DB 文件名程序定死**:`template.prod.sqlite`/`template.dev.sqlite`,改名要同步 `sqlite.config.ts`、`configuration.ts`、`ops/sqlite/config.sh`、ops 探针四处。
9. **better-sqlite3 v13 无预编译二进制**:需 python3/make/g++ 源码编译(Dockerfile 已装齐);本地装依赖报 node-gyp 错先查这个。
10. **backend/package-lock.json 必须是真 npm lockfile**(Dockerfile `npm ci` 用;首次部署前按 README「第 4 步」重生,避开 pnpm 符号链污染)。

## 编码与接口约定

- **响应契约**:所有接口统一 `{ code, message, data }`(HTTP 200);前端按 `res.code !== 200` 判业务失败,401 跳登录。后端由 `transform.interceptor.ts` 统一包装,别在 controller 手拼。
- **双轨鉴权**:`/background` 后台走 JWT(`Authorization: Bearer`,8h);`/screen` 大屏走三头签名(`X-App-Ts`/`X-App-Nonce`/`X-App-Sign`,HMAC-SHA256,±300s 窗口 + nonce 去重)。新增大屏受保护接口 = controller 路由加 `@UseGuards(AppSignGuard)`。细节:`docs/api-security.md`。
- **主题边界**:Airtable 风格主题只套 `/background` 后台路由树(`theme.ts` → `Background.tsx` 的 ConfigProvider),大屏端不套。
- **风格**:prettier 单引号 / printWidth 100 / 无尾逗号;web 用 eslint airbnb;`pnpm lint` 自带 `--fix`。
- **密钥**:仓库内所有密钥是占位串 `*-change-me-*`,不要把真密钥提交进来;部署凭证文件(`web/scripts/server.config.json`、`backend/scripts/server.config.cjs`)已 gitignore。
- **commit**:type 前缀 + 中文描述(如 `feat: 新增xx模块`,参考 `git log`)。

## 禁区

- `pnpm publish` / `pnpm rollback` / 各子包 `publish` 会 SSH 到真实服务器执行部署/回滚——除非用户明确要求,不要运行。
- 不顺手删既有业务逻辑做「清理」;重构先出方案对齐。

## 深入文档

| 文档 | 内容 |
|---|---|
| `README.md` | 总览 + 从模板起新项目必改清单(包名/密钥/凭证/lockfile/业务面) |
| `DESIGN.md` | 后台 UI 设计系统(色彩/字体/组件规范);后期想换风格可整体删除并替换 `web/src/styles/theme.ts` |
| `docs/api-security.md` | 双轨鉴权与签名机制(本地文档,不入库) |
