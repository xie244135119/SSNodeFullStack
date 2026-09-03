# AGENTS.md

面向 AI 编码代理(Claude Code / Codex / Cursor 等)与协作者的工作指南。

> 本项目由 create-ssnode-app 生成(backend 单包变体)。响应契约 {code,message,data}、双轨鉴权、
> 密钥占位约定等完整规范见源仓 templates/root/AGENTS.md(脚手架源仓)。

## 本变体要点(backend-only)

- **管理走 Swagger**:dev 起动后 /api/docs;超管账号见 config.*.yaml 的 admin(password 已由脚手架生成,启动 reconcile 入库)。
- **迁移显式注册**:新增迁移必须手动加进 src/database/sqlite.config.ts 的 migrations 数组(glob 在单文件 bundle 下落空 → prod 不建表)。
- **webpack 必须 mode:'none'**;better-sqlite3 v13 需 python3/make/g++ 源码编译。
- **DB 文件名程序定死**:<name>.prod.sqlite / <name>.dev.sqlite(已随生成物改名,四处同步见 sqlite.config.ts)。
- `pnpm dev` 端口 3001;`pnpm build` = webpack 单文件 dist/main.js。
