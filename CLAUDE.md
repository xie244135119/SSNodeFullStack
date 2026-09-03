# CLAUDE.md

本仓库的通用工作指南在 [AGENTS.md](./AGENTS.md) —— **先读它**。本文件只补充 Claude Code 专属约定。

## 读取顺序

1. `AGENTS.md` — 命令、目录地图、硬约束(改模板 = 改脚手架,替换表同步等)
2. `README.md` — 脚手架用法与仓库结构
3. `templates/root/AGENTS.md` — 生成项目的工作指南(模板内代码细则在这份里)
4. 改到哪个域,再看对应文档:`docs/airtable/DESIGN.md`(后台 UI 规范)/ `docs/api-security.md`(鉴权)

## Claude Code 专属约定

- **方案先行**:非平凡改动(新功能/重构/修 bug)先给方案和根因分析,经用户确认再动手;贴错误栈或要求「接入/修复/调整」时同样适用。
- **改动后自查**:改模板跑 `pnpm build`;改 CLI 或 transforms 跑一次非交互生成(`node cli/index.js /tmp/x --stack fullstack --yes`)+ 残留 grep(`fullstack-template\|template\.(prod\|dev\|develop)\|__PKG_NAME__`)。
- **不要主动 publish**:发布/回滚走真实 SSH,只在用户明确说「发版/回滚」时执行。
- **web 模板是 JS 不是 TS**:在 `templates/web/` 下写代码用 JS + jsconfig 路径别名;`templates/backend/` 才是 TS。
- **git 提交**:只在用户要求时提交;type 前缀 + 中文描述(如 `feat: xxx`)。
