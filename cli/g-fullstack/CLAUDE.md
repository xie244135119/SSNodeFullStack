# CLAUDE.md

本仓库的通用工作指南在 [AGENTS.md](./AGENTS.md) —— **先读它**,硬约束(迁移注册、webpack mode、签名密钥、hall 枚举镜像等)都在那份里。本文件只补充 Claude Code 专属约定。

## 读取顺序

1. `AGENTS.md` — 命令、目录地图、硬约束、编码约定
2. `README.md` — 从模板起新项目的必改清单
3. 改到哪个域,再看对应文档:`docs/airtable/DESIGN.md`(后台 UI 规范)/ `docs/api-security.md`(鉴权)

## Claude Code 专属约定

- **方案先行**:非平凡改动(新功能/重构/修 bug)先给方案和根因分析,经用户确认再动手;贴错误栈或要求「接入/修复/调整」时同样适用。
- **改动后自查**:`pnpm lint` 过了不算完,后端改动跑一次 `pnpm --filter g-fullstack-backend build` 确认 webpack 单文件 bundle 能出(迁移显式注册的问题只有 build+prod 路径暴露)。
- **不要主动 publish**:发布/回滚走真实 SSH,只在用户明确说「发版/回滚」时执行。
- **web 是 JS 不是 TS**:在 `web/` 下写代码用 JS + jsconfig 路径别名,别顺手加 TS 语法;`backend/` 才是 TS。
- **git 提交**:只在用户要求时提交;type 前缀 + 中文描述(如 `feat: xxx`)。
