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
