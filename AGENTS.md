# AGENTS.md

面向 AI 编码代理(Claude Code / Codex / Cursor 等)与协作者的本仓库工作指南。
本仓库是**脚手架源仓**:CLI(`cli/`)+ 模板(`templates/`),不是直接部署的业务项目。

## 仓库身份

- **cli/** — `create-ssnode-app` 脚手架:`pnpm create github:xie244135119/SSNodeFullStack my-app` 生成分层项目的 CLI。
- **templates/root/** — 生成项目的根胶水(workspace 骨架、scripts/publish+rollback、.gitignore、AGENTS/CLAUDE、README)。
- **templates/web/** — web 模板(Vite + React18 + AntD5,**纯 JS**,dev 端口 6177)。
- **templates/backend/** — backend 模板(NestJS + SQLite + TypeORM,TS,dev 端口 3001,全局前缀 `/api`)。

业务主线(模板内):后台配置 → SQLite → 大屏消费;column 栏目模块是端到端示例业务。

## 常用命令(仓库根执行)

| 命令 | 作用 |
|---|---|
| `pnpm cli` | 直接跑 CLI(等价 `node cli/index.js`) |
| `pnpm dev` | web(6177)+ backend(3001)并行(演示模板可运行) |
| `pnpm build` / `pnpm lint` | 全量构建 / 全量 lint |
| `pnpm test` | CLI 纯函数测试 |
| `node cli/index.js /tmp/x --stack fullstack\|web\|backend --yes` | 非交互生成,改完模板后快速验证 |

## 硬约束(改模板前自查)

1. **改模板 = 改脚手架**:templates/ 下任何身份串变更(fullstack-template、template.*.sqlite、<模板项目>、__PKG_NAME__ 等)必须同步 `cli/transforms.js` 替换表,否则生成物残留模板身份。改完跑一次非交互生成 + 残留 grep 验证。
2. **密钥占位**:模板里密钥一律空值锚点(`VITE_APP_SIGN_KEY=`、`field: ''`),`cli/secrets.js` 按锚点注入;改 yaml 字段名会破坏注入,需同步 secrets.js。
3. **`--filter` 派生名**:生成项目子包名是 `<name>-web`/`<name>-backend`(index.js ⑤b 结构化改写),编排脚本与文档里的 `--filter web|backend` 由 transforms 全局规则替换;新增引用子包名的地方要进替换表。
4. **webpack 必须 `mode:'none'`**(模板硬约束,原因见 templates/backend/webpack.pack.cjs 注释)。
5. **迁移显式注册**:模板 backend 的 migrations 数组用显式 import;新增迁移模板文件必须同步注册。
6. **hall 枚举两处镜像**:`templates/web/src/config/column-hall.config.ts` ↔ `templates/backend/src/modules/column/column-hall.ts`。
7. **web 模板是 JS 不是 TS**;两包间不建 `workspace:*` 依赖。
8. **publish/rollback 走真实 SSH**:只在用户明确要求「发版/回滚」时执行。

## 编码与接口约定(模板内代码)

响应契约 `{code,message,data}`、双轨鉴权(JWT 后台 / 签名大屏)、Airtable 主题只套后台路由树、prettier 单引号/100 宽 —— 细则见 `templates/root/AGENTS.md`(即生成项目里的 AGENTS.md)。

## 禁区

- 不顺手删模板既有业务逻辑做「清理」;重构先出方案对齐。
- templates/ 下的文件**不要加 `templates/` 前缀的引用**(它们在生成物里的路径没有这层)。

## 深入文档

| 文档 | 内容 |
|---|---|
| `README.md` | 脚手架用法、仓库结构、CI 守卫 |
| `templates/root/README.md` | 生成项目视角的完整文档(必改清单/架构/速查) |
| `docs/airtable/DESIGN.md` | 后台 UI 设计系统 |
| `docs/api-security.md` | 双轨鉴权与签名机制 |
