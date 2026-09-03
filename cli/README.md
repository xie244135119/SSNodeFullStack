# create-ssnode-app

SSNodeFullStack 脚手架 —— 一条命令生成**全栈 / 仅前端 / 仅后端**项目。

```bash
npm create ssnode-app my-app
```

从模板生成项目时自动完成包名/标题/DB 名/容器名替换与 dev/prod 两套密钥注入(前后端成对同值),生成后 `pnpm install && pnpm dev` 直接跑。框架层(双轨鉴权、SQLite 加固、docker/systemd/pm2 部署引擎、Capistrano 式回滚)开箱即用,业务面收敛到最小示例(column 栏目模块端到端:后端 API + 签名大屏端点 + 后台 CRUD + mock 兜底),照着扩自己的业务。

## 变体

| 变体 | 生成物 | 说明 |
|---|---|---|
| **fullstack** | monorepo(web + backend) | 完整形态:大屏 + 后台管理 + NestJS,含发布/回滚编排 |
| **web** | 单包工程 | `checkToken=false` 免登录,大屏走 mock 兜底;接后端时再开 |
| **backend** | 单包工程 | 管理走 Swagger(`/docs`,根路径不带 /api 前缀) |

## 快速开始

```bash
npm create ssnode-app my-app          # 交互式(目录 → 技术栈 → 展示名 → git init → install)
node cli/index.js /tmp/demo --stack fullstack --yes   # 源仓内非交互(CI 可用)
```

要求:Node ≥ 20.11(生成后用 pnpm 装依赖)。

## 脚手架替你做了什么

- **身份替换**:根/子包包名(派生 `<name>-web`/`<name>-backend`)、后台顶栏标题、Swagger 标题、SQLite 文件名、docker 镜像/容器名、systemd/pm2 服务名、服务器部署根目录、编排脚本 `--filter` 名 —— 全量实测替换,生成物零模板残留
- **密钥生成注入**:dev/prod 两套(JWT secret、大屏签名 signKey、超管密码、AES cryptKey),前后端成对同值写入并回读校验;超管账号打印在控制台(启动时 reconcile 入库)
- **git init + 首次 commit**、**pnpm install**(均可选)

剩余手工步骤(CLI 输出会提示):
- 部署前配 SSH 凭证(`web/scripts/server.config.json`、`backend/scripts/server.config.cjs`,从 example 拷,不入库)
- backend 首次部署前按 README 重生 `package-lock.json`(供 Dockerfile `npm ci`)

## 生成项目里有什么

**web**(Vite + React18 + AntD5 + Recoil + Echarts)
- 双端界面:只读可视化大屏(1920×1080 基准)+ 后台管理系统(Airtable 风格主题)
- 纯 JS 工程(jsconfig + 路径别名),eslint airbnb + stylelint + prettier

**backend**(NestJS + SQLite + TypeORM + yaml 多环境)
- 双轨鉴权:后台 JWT(8h)/ 大屏三头签名(HMAC-SHA256,±300s 窗口 + nonce 去重),互不污染的两套请求实例
- SQLite 加固:WAL + PRAGMA、prod 靠迁移建表(`synchronize:false`)、迁移显式注册
- 构建 = `nest build`(tsc 全量类型检查)+ **terser 混淆**(部署产物防看;运维包剥离 `.js.map`/`.d.ts`)
- 运维监控:ops 模块只读展示 SQLite 备份状态,探针可插拔
- 全局响应契约 `{ code, message, data }`

**部署引擎**(框架层,通常不用改)
- 三模式:docker / systemd / pm2,服务器侧纯 shell(`install.sh` 单一真相源)
- Capistrano 式 `releases/<ver>-<ts>` + `current` 软链原子切换,`versionswitch.sh` 可升可降
- SQLite 定时备份(宿主 cron + 脚本)

**文档随行**:生成项目自带 README(必改清单剩余项)、AGENTS.md/CLAUDE.md(AI 编码代理工作指南)、`docs/api-security.md`(鉴权细节)、`docs/airtable/DESIGN.md`(后台 UI 设计规范,换风格可删)。

## CLI 选项

```
--stack <fullstack|web|backend>  技术栈;指定后进入非交互模式(CI 可用)
--yes                            非交互模式下跳过 git init / pnpm install 询问
-v, --version                    显示版本
-h, --help                       显示帮助
```

不带选项直接运行 = 交互模式。

## 仓库

源仓(模板 + CLI 同仓同版本,改模板即改脚手架):[github.com/xie244135119/SSNodeFullStack](https://github.com/xie244135119/SSNodeFullStack)

CI 守卫:每次模板/CLI 变更跑三变体矩阵(生成 → 残留扫描 → install → build → fullstack 冒烟),改坏当场红。

## License

ISC
