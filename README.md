# SSNodeFullStack(脚手架源仓)

> 个人全栈脚手架。`npm create` 一条命令生成**全栈 / 仅前端 / 仅后端**三种项目,
> 自动完成包名/标题/DB 名/容器名替换与密钥生成注入 —— 原来手抄 5 类必改项,CLI 吃掉 3 类。

框架层(双轨鉴权、SQLite 加固、docker/systemd/pm2 部署引擎、Capistrano 回滚)开箱即用,
业务面收敛到最小示例(column 栏目模块端到端:后端 module + 签名 screen 端点 + 后台 CRUD + 大屏消费 + mock 兜底)。

## 用法(生成新项目)

```bash
# 从 npm(正式分发渠道,版本 = npm 包版本)
npm create ssnode-cli my-app

# 本地源仓直接跑(开发模板时)
node cli/index.js my-app
```

交互问答:项目目录 → **技术栈**(全栈 / 仅 web / 仅 backend)→ 展示名 → git init → pnpm install。

CI/脚本场景跳过交互:`node cli/index.js my-app --stack fullstack|web|backend --yes`

### 三种变体

| 变体 | 生成物 | 说明 |
|---|---|---|
| **fullstack** | monorepo(web + backend + 根胶水) | 即本仓库模板原样,含发布/回滚编排 |
| **web** | 单包工程 | `checkToken=false` 免登录,大屏走 mock 兜底;接后端时再开回 |
| **backend** | 单包工程 | 管理走 Swagger `/api/docs` |

CLI 自动完成:
- **身份替换**:包名(根/web/backend)、Swagger 标题、后台顶栏标题、SQLite 文件名、docker 镜像/容器名、systemd/pm2 服务名、服务器部署根目录、`--filter` 子包名 —— 全部实测 grep 建表(`cli/transforms.js`),生成后零残留
- **密钥注入**:dev/prod 两套(JWT secret、signKey、admin 密码、cryptKey),前后端成对同值写入并回读校验 —— 消灭「改了一端忘另一端」
- **git init + 首次 commit**(可选)

生成后剩余手工步骤(CLI 输出会提示):配 SSH 部署凭证(不入库)、backend 部署前重生 package-lock.json(见生成项目 README「第 4 步」)。

## 仓库结构

```
cli/                    create-ssnode-cli CLI(交互/拷贝/替换/密钥)
  index.js              主体流程
  transforms.js         确定性替换表(纯数据,每条规则注明实测出处)
  secrets.js            密钥生成与注入(纯函数)
templates/
  root/                 生成物的根胶水:workspace 骨架、scripts/publish+rollback、
                        .gitignore/.npmrc/.prettierrc、AGENTS/CLAUDE、README
  web/                  web 模板(Vite + React18 + AntD5 + Recoil + Echarts)
  backend/              backend 模板(NestJS + SQLite + TypeORM + yaml 多环境)
docs/                   源仓文档(api-security、airtable 设计规范)
```

**模板与 CLI 同仓同版本** —— 改模板即改脚手架,CI 守卫(见下)保证三变体随时可生成。

## 开发(本源仓)

```bash
pnpm install
pnpm cli            # 直接跑 CLI(node cli/index.js)
pnpm dev            # web(6177)+ backend(3001)并行
pnpm build / pnpm lint
pnpm test           # CLI 纯函数测试
```

注意:workspace 含 `templates/web`、`templates/backend`,命令前缀用 `pnpm --filter web|backend …`。

## CI 守卫

`.github/workflows/ci.yml`:三变体矩阵 → CLI 生成 → 残留扫描(模板身份串必须为 0)→ install → build → fullstack 冒烟(backend 起动 + `/api/version`)。**改模板后 push,CI 红了就是生成物坏了**。

## 老路:cp -r

不经过 CLI 直接拷模板仍可用:`cp -r templates/root + templates/web + templates/backend` 到新目录,然后手工改 5 类(见 `templates/root/README.md` 的「必改清单」)。不推荐 —— 手工改漏的每一处都是脚枪。

## 技术栈与架构细节

见 `templates/root/README.md`(生成项目同款文档):技术栈、双轨鉴权、SQLite 加固、部署引擎、常改文件速查。
设计规范:`docs/airtable/DESIGN.md`。API 安全:`docs/api-security.md`。
