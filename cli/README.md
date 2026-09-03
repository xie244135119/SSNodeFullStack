# create-ssnode-app

SSNodeFullStack 脚手架 —— 一条命令生成全栈 / 仅前端 / 仅后端项目。

```bash
npm create ssnode-app my-app
```

交互问答(目录 → 技术栈 → 展示名 → git init → install)后,生成一个可直接 `pnpm install && pnpm dev` 跑起来的项目,业务面自带一个端到端示例模块(column 栏目:后端 API + 签名大屏端点 + 后台 CRUD + mock 兜底),照着扩自己的业务。

## 用法

```bash
npm create ssnode-app my-app                                  # 交互式
npm create ssnode-app my-app -- --stack fullstack --yes       # 非交互(CI 可用)
```

```
--stack <fullstack|web|backend>  技术栈,指定后进入非交互模式
--yes                            非交互模式下跳过 git init / pnpm install 询问
-v, --version                    显示版本
-h, --help                       显示帮助
```

要求:Node ≥ 20.11(生成后用 pnpm 装依赖)。

## 交互示例

```text
$ npm create ssnode-app my-app

┌  create-ssnode-app · SSNodeFullStack 脚手架
│
◆  项目目录(相对路径,如 my-app):
│  my-app
│
◆  生成什么项目?
│  ● 全栈
│    web + backend monorepo(大屏 + 后台 + NestJS)
│  ○ 仅前端 web
│    Vite + React + AntD,大屏走 mock 兜底
│  ○ 仅后端 backend
│    NestJS + SQLite,管理走 Swagger
│
◆  项目展示名(后台顶栏/Swagger/登录页标题):
│  我的应用
│
◆  git init + 首次 commit?
│  ● Yes / ○ No
│
◇  组装模板 → 身份替换 → 密钥注入 → git 仓库已建立 → 生成完成
│
◇  项目已生成:/Users/you/my-app
│
●  超管账号(启动时 reconcile 入库,牢记):
│      dev : admin / xK9mP2qR8vTz4wL6
│      prod: admin / hF3nJ7cW5bYs2dQe
│
●  签名/JWT 密钥已写入 web/.env.* 与 backend/config/*.yaml(前后端已同值,无需手抄)
│
◆  现在执行 pnpm install?
│  ● Yes / ○ No
│
◇  接下来(脚手架搞不定的部分) ──────────────────────────────
│
│    cd my-app
│    pnpm install
│    pnpm dev          # web(6177)+ backend(3001)
│    → 部署前:配 SSH 凭证 web/scripts/server.config.json + backend/scripts/server.config.cjs(从 example 拷)
│    → 首次部署前:backend/ 下重生 package-lock.json(见 README「第 4 步」)
│
└  Happy hacking!
```

(超管密码每次随机生成;选 web 变体时无超管账号输出,改提示接后端时如何填签名密钥)

## 脚手架替你做了什么

生成过程自动完成,不需要手工改任何模板占位:

- **身份替换**:包名(子包派生 `<name>-web`/`<name>-backend`)、后台顶栏标题、Swagger 标题、SQLite 文件名、docker 镜像/容器名、systemd/pm2 服务名、服务器部署根目录、编排脚本 `--filter` 名——生成物零模板残留(CI 守卫每次发布前扫描断言)
- **密钥生成注入**:dev/prod 两套独立密钥(JWT secret、大屏签名 signKey、超管密码、AES cryptKey),前后端成对同值写入并回读校验;超管账号打印在控制台
- **git init + 首次 commit**、**pnpm install**(交互可选)

CLI 搞不定的两件事(生成结束会提示):部署前配 SSH 凭证(example 拷)、backend 首次部署前重生 `package-lock.json`。

## 仓库

模板与 CLI 同仓同版本,改模板即改脚手架:[github.com/xie244135119/SSNodeFullStack](https://github.com/xie244135119/SSNodeFullStack)

生成项目的完整文档(架构、必改清单、部署引擎)见源仓 README 与生成项目随附的 README/AGENTS.md。

## License

ISC
