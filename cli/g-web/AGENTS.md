# AGENTS.md

面向 AI 编码代理(Claude Code / Codex / Cursor 等)与协作者的工作指南。

> 本项目由 create-ssnode-app 生成(web 单包变体)。响应契约 {code,message,data}、双轨鉴权、
> 密钥占位约定等完整规范见源仓 templates/root/AGENTS.md(脚手架源仓)。

## 本变体要点(web-only)

- **免登录模式**:public/env.config.js 的 checkToken=false(无后端,AuthLayout 直接放行);大屏数据走 src/services/mock.ts 兜底。
- **接后端时**:checkToken 改回 true + .env.development/.env.production 填 VITE_APP_SIGN_KEY(与后端 yaml appSign.signKey 逐字一致)+ vite.config.js proxy 指向后端。
- **纯 JS 工程**:jsconfig,不写 TS;eslint airbnb;prettier 单引号/100 宽。
- `pnpm dev` 端口 6177;`pnpm build` 产物 dist/;`pnpm lint` 带 --fix。
