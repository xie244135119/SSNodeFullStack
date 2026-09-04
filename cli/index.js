#!/usr/bin/env node
/**
 * create-ssnode-app — SSNodeFullStack 脚手架 CLI
 *
 * 从本仓库(脚手架源仓)的 templates/ 生成新项目,三种变体:
 *   fullstack  web + backend + 根胶水(monorepo,同模板仓库现状)
 *   web        仅前端(单包工程,checkToken=false 免登录,后端就绪后再开)
 *   backend    仅后端(单包工程,管理走 Swagger)
 *
 * 流程:prompts 问答 → 拷贝模板 → transforms 身份替换 → secrets 密钥注入
 *      → (可选) git init + 首次 commit → (可选) 依赖安装(pnpm/yarn/npm 自动探测)→ 打印剩余手工步骤
 *
 * 用法:
 *   npm create github:xie244135119/SSNodeFullStack my-app
 *   node cli/index.js my-app        (源仓内)
 *   node cli/index.js --stack web   (跳过交互,CI 用)
 */
import { existsSync, cpSync, rmSync, readFileSync, writeFileSync, mkdirSync, readdirSync, renameSync } from 'node:fs';
import { join, resolve, basename, relative as pathRelative, extname as pathExtname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import * as p from '@clack/prompts';
import { buildTransforms, applyRules, TEXT_EXTENSIONS } from './transforms.js';
import { generateSecrets, injectWebEnv, injectBackendYaml, verifySecretPairs } from './secrets.js';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
// 模板目录双布局兼容:
//   npm 包内 = <pkg>/templates(files 字段,与 index.js 同级)
//   源仓内   = <repo>/templates(cli/ 的上一级)
const TEMPLATES_DIR = existsSync(join(__dirname, 'templates'))
  ? join(__dirname, 'templates')
  : join(__dirname, '..', 'templates');

/** CLI 拷贝时排除的目录/文件(构建产物、本地数据、凭证) */
/** cpSync filter:true = 拷贝。排除构建产物、本地数据、本地凭证。 */
const COPY_FILTER = (src) => {
  const name = basename(src);
  return !(
    name === 'node_modules' || name === 'dist' || name === 'data' ||
    name === 'release' || name === 'rel' || name === 'dist-bundle' ||
    name === 'server.config.json' || name === 'server.config.cjs' || name === '.git'
  );
};

/** npm 包名合法性(简化版 npm validate) */
function isValidName(name) {
  return /^(?:@[a-z0-9-*~][a-z0-9-*._~]*\/)?[a-z0-9-~][a-z0-9-._~]*$/.test(name) &&
    name.length <= 214 && !name.startsWith('.') && !name.startsWith('_');
}

/** 基础指令与参数校验;命中 -v/-h 直接输出退出 */
function handleBaseFlags(argv) {
  const KNOWN_FLAGS = new Set(['--stack', '--pm', '--yes', '-v', '--version', '-h', '--help']);

  if (argv.includes('-v') || argv.includes('--version')) {
    const pkg = JSON.parse(readFileSync(join(__dirname, 'package.json'), 'utf-8'));
    console.log(`create-ssnode-app v${pkg.version}`);
    process.exit(0);
  }
  if (argv.includes('-h') || argv.includes('--help')) {
    console.log(HELP_TEXT);
    process.exit(0);
  }
  // 未知 flag 报错(此前会被静默忽略,用户拼错参数毫无提示)
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('-')) continue;
    if (a === '--stack' || a === '--pm') { i += 1; continue; } // 跳过其取值
    if (!KNOWN_FLAGS.has(a)) {
      console.error(`✗ 未知选项:${a}\n\n${HELP_TEXT}`);
      process.exit(1);
    }
  }
}

const HELP_TEXT = `create-ssnode-app — SSNodeFullStack 脚手架

用法:
  npm create ssnode-app <目录> [选项]
  node cli/index.js <目录> [选项]        (源仓内)

选项:
  --stack <fullstack|web|backend>  技术栈;指定后进入非交互模式(CI 可用)
                                   fullstack = web + backend monorepo
                                   web       = 仅前端(checkToken=false 免登录)
                                   backend   = 仅后端(管理走 Swagger /docs)
  --pm <pnpm|npm|yarn>            生成项目用的包管理器(默认自动探测,优先 pnpm)
  --yes                            非交互模式下跳过 git init / 依赖安装询问
  -v, --version                    显示版本
  -h, --help                       显示本帮助

不带选项直接运行 = 交互模式(问答式)。
示例:
  npm create ssnode-app my-app
  node cli/index.js /tmp/demo --stack fullstack --yes`;

async function main() {
  const argv = process.argv.slice(2);
  handleBaseFlags(argv);
  const argPath = argv.find((a) => !a.startsWith('--') && !a.startsWith('-'));
  const argStack = argv.includes('--stack') ? argv[argv.indexOf('--stack') + 1] : null;
  const argPm = argv.includes('--pm') ? argv[argv.indexOf('--pm') + 1] : null;
  const isCI = argv.includes('--yes') || !!argStack; // 非交互模式(--stack 即全参数)

  // 包管理器:显式指定 > 自动探测(pnpm → yarn → npm,node 自带 npm 兜底)
  let pm = argPm || detectPM();
  if (!['pnpm', 'npm', 'yarn'].includes(pm)) {
    p.cancel(`未知 --pm:${pm}(pnpm | npm | yarn)`);
    process.exit(1);
  }

  console.clear();
  p.intro('create-ssnode-app · SSNodeFullStack 脚手架');

  // ── ① 项目路径 ──
  let targetDir;
  if (argPath) {
    targetDir = resolve(argPath);
  } else if (isCI) {
    p.cancel('--stack 模式需要同时给项目目录参数');
    process.exit(1);
  } else {
    const r = await p.text({
      message: '项目目录(相对路径,如 my-app):',
      placeholder: 'my-app',
      validate: (v) => (!v || v.trim() === '' ? '必填' : null),
    });
    if (p.isCancel(r)) process.exit(0);
    targetDir = resolve(String(r).trim());
  }
  const name = basename(targetDir).toLowerCase();
  if (!isValidName(name)) {
    p.cancel(`目录名「${name}」不是合法 npm 包名(小写字母/数字/-/.,不能 . _ 开头)`);
    process.exit(1);
  }
  if (existsSync(targetDir) && existsSync(join(targetDir, 'package.json'))) {
    p.cancel(`目标目录已存在 package.json:${targetDir}(请换空目录)`);
    process.exit(1);
  }

  // ── ② 技术栈 ──
  let stack;
  if (argStack) {
    stack = argStack;
  } else {
    const r = await p.select({
      message: '生成什么项目?',
      options: [
        { value: 'fullstack', label: '全栈', hint: 'web + backend monorepo(大屏 + 后台 + NestJS)' },
        { value: 'web', label: '仅前端 web', hint: 'Vite + React + AntD,checkToken=false 免登录' },
        { value: 'backend', label: '仅后端 backend', hint: 'NestJS + SQLite,管理走 Swagger' },
      ],
    });
    if (p.isCancel(r)) process.exit(0);
    stack = r;
  }
  if (!['fullstack', 'web', 'backend'].includes(stack)) {
    p.cancel(`未知 stack:${stack}(fullstack | web | backend)`);
    process.exit(1);
  }

  // ── ③ 展示名 ──
  let displayName = name;
  if (!isCI) {
    const r = await p.text({
      message: '项目展示名(后台顶栏/Swagger/登录页标题):',
      initialValue: name,
      validate: (v) => (!v || !v.trim() ? '必填' : null),
    });
    if (p.isCancel(r)) process.exit(0);
    displayName = String(r).trim();
  }

  const s = p.spinner();
  const id = { name, displayName };

  // ── ④ 组装 ──
  s.start('组装模板…');
  mkdirSync(targetDir, { recursive: true });
  if (stack === 'fullstack') {
    // 根胶水 + 两个子包;web/backend 放在根胶水「之下」
    copyDir(join(TEMPLATES_DIR, 'root'), targetDir);
    copyDir(join(TEMPLATES_DIR, 'web'), join(targetDir, 'web'));
    copyDir(join(TEMPLATES_DIR, 'backend'), join(targetDir, 'backend'));
    // 源仓 docs/(设计规范、API 安全)一并随行,生成项目的 AGENTS/CLAUDE 有引用
    copyDocs(targetDir);
  } else if (stack === 'web') {
    // web 模板直接作为单包工程根
    copyDir(join(TEMPLATES_DIR, 'web'), targetDir);
    // 根胶水里 web 单包也需要的:.gitignore(内容含 dist 等)、prettier
    copyRootFiles(targetDir, ['.gitignore', '.npmrc', '.prettierignore', '.prettierrc.cjs', 'LICENSE']);
    // web-only 免登录:没后端就没法登录,checkToken 关掉
    const envConfig = readFileSync(join(targetDir, 'public', 'env.config.js'), 'utf-8');
    writeFileSync(join(targetDir, 'public', 'env.config.js'), envConfig.replace('checkToken: true', 'checkToken: false'));
    // 单包变体不拷 AGENTS/CLAUDE(全栈工作指南,单包下大量失效),生成精简版
    writeFileSync(join(targetDir, 'AGENTS.md'), singleStackAgents('web', pm));
  } else {
    // backend 模板直接作为单包工程根
    copyDir(join(TEMPLATES_DIR, 'backend'), targetDir);
    copyRootFiles(targetDir, ['.gitignore', '.npmrc', 'LICENSE']);
    // backend-only 的 .gitignore 需要补 backend 段(模板根 .gitignore 是全栈视角)
    const gi = readFileSync(join(targetDir, '.gitignore'), 'utf-8');
    writeFileSync(join(targetDir, '.gitignore'), gi.replace(/^backend\//gm, '').replace(/^web\//gm, ''));
    writeFileSync(join(targetDir, 'AGENTS.md'), singleStackAgents('backend', pm));
  }
  s.message('模板就位');

  // ── ⑤ transforms 身份替换 ──
  const { globalRules, fileRules } = buildTransforms(id, pm);
  let transformHits = 0;
  const walk = (dir) => {
    const entries = readdirSync(dir, { withFileTypes: true });
    for (const e of entries) {
      const full = join(dir, e.name);
      const rel = pathRelative(targetDir, full);
      if (e.isDirectory()) { walk(full); continue; }
      if (!extnameAllow(e.name)) continue;
      let content = readFileSync(full, 'utf-8');
      const original = content;
      // 定点规则(锚点精确)优先
      const fr = fileRules.find((r) => stack === 'fullstack' ? r.file === rel : r.file.endsWith(rel));
      if (fr) {
        const res = applyRules(content, fr.rules);
        content = res.content; transformHits += res.hits;
      }
      // 全局规则(模板身份串)兜底
      const res = applyRules(content, globalRules);
      content = res.content; transformHits += res.hits;
      if (content !== original) writeFileSync(full, content);
    }
  };
  walk(targetDir);
  s.message(`身份替换 ${transformHits} 处`);

  // ── ⑤b root package.json 占位符(结构化修改,不走文本替换) ──
  if (stack === 'fullstack') {
    const pkgPath = join(targetDir, 'package.json');
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
    pkg.name = name;
    pkg.description = `${displayName}(create-ssnode-app 生成)`;
    writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');
    // web/backend 子包名:<name>-web / <name>-backend(与 --filter 派生名一致)
    for (const [dir, suffix] of [['web', '-web'], ['backend', '-backend']]) {
      const p2 = join(targetDir, dir, 'package.json');
      const sub = JSON.parse(readFileSync(p2, 'utf-8'));
      sub.name = name + suffix;
      writeFileSync(p2, JSON.stringify(sub, null, 2) + '\n');
    }
  } else {
    // 单包工程:模板包名改为项目名
    const pkgPath = join(targetDir, 'package.json');
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
    pkg.name = name;
    pkg.description = `${displayName}(create-ssnode-app 生成)`;
    writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');
  }

  // ── ⑥ secrets 注入(仅含对应端时) ──
  let secretsPrintout = null;
  if (stack !== 'backend') {
    const secrets = generateSecrets();
    for (const [mode, envFile, yamlFile] of [
      ['develop', '.env.development', 'config.develop.yaml'],
      ['prod', '.env.production', 'config.prod.yaml'],
    ]) {
      const envPath = stack === 'fullstack' ? join(targetDir, 'web', envFile) : join(targetDir, envFile);
      writeFileSync(envPath, injectWebEnv(readFileSync(envPath, 'utf-8'), mode, secrets[mode].signKey));
    }
    // backend yaml(仅 fullstack)
    if (stack === 'fullstack') {
      for (const [mode, yamlFile] of [['develop', 'config.develop.yaml'], ['prod', 'config.prod.yaml']]) {
        const yamlPath = join(targetDir, 'backend', 'config', yamlFile);
        writeFileSync(yamlPath, injectBackendYaml(readFileSync(yamlPath, 'utf-8'), secrets[mode]));
      }
      // docker .env.example 一并种子化(README 必改清单第 2 条的 docker 面)
      const envExamplePath = join(targetDir, 'backend', 'ops', 'docker', '.env.example');
      let envExample = readFileSync(envExamplePath, 'utf-8');
      envExample = envExample
        .replace('JWT_SECRET=', `JWT_SECRET=${secrets.prod.jwtSecret}`)
        .replace('ADMIN_PASSWORD=', `ADMIN_PASSWORD=${secrets.prod.adminPassword}`)
        .replace('APP_SIGN_KEY=', `APP_SIGN_KEY=${secrets.prod.signKey}`)
        .replace('# ⚠️ 模板占位:新项目务必换成自己的强密钥(与 config.prod.yaml / web/.env.production 同款)。', '# 已由脚手架生成(与 config.prod.yaml / web/.env.production 同款)。');
      writeFileSync(envExamplePath, envExample);
    }
    // 回读校验:fullstack 做前后端成对一致(硬约束);web-only 只需确认注入成功
    const files = {};
    const readInto = (p) => { files[basename(p)] = readFileSync(p, 'utf-8'); };
    readInto(stack === 'fullstack' ? join(targetDir, 'web', '.env.development') : join(targetDir, '.env.development'));
    readInto(stack === 'fullstack' ? join(targetDir, 'web', '.env.production') : join(targetDir, '.env.production'));
    if (stack === 'fullstack') {
      readInto(join(targetDir, 'backend', 'config', 'config.develop.yaml'));
      readInto(join(targetDir, 'backend', 'config', 'config.prod.yaml'));
      const v = verifySecretPairs(files);
      if (!v.ok) {
        s.stop('密钥校验失败');
        p.cancel(v.problems.join('; '));
        process.exit(1);
      }
    }
    secretsPrintout = secrets;
    s.message('密钥已生成并注入(前后端成对一致)');
  } else {
    // backend-only:只注 yaml(无前端 env)
    const secrets = generateSecrets();
    for (const [mode, yamlFile] of [['develop', 'config.develop.yaml'], ['prod', 'config.prod.yaml']]) {
      const yamlPath = join(targetDir, 'config', yamlFile);
      writeFileSync(yamlPath, injectBackendYaml(readFileSync(yamlPath, 'utf-8'), secrets[mode]));
    }
    secretsPrintout = secrets;
    s.message('密钥已生成并注入 yaml');
  }

  // ── ⑦ git init + 首次 commit ──
  if (!isCI && existsSync(targetDir)) {
    const doGit = await p.confirm({ message: 'git init + 首次 commit?', initialValue: true });
    if (!p.isCancel(doGit) && doGit) {
      s.start('git init…');
      run('git', ['init'], targetDir);
      run('git', ['add', '-A'], targetDir);
      run('git', ['commit', '-m', `init: ${name}(create-ssnode-app 生成)`], targetDir, true);
      s.message('git 仓库已建立');
    }
  }

  s.stop('生成完成');
  p.log.success(`项目已生成:${targetDir}`);

  // ── ⑧ 密钥打印(仅控制台,不落盘;密钥本体已在文件里) ──
  if (secretsPrintout) {
    if (stack !== 'web') {
      // 超管账号只对含 backend 的变体有意义(web-only 无后端可 reconcile)
      const cfgPath = (f) => (stack === 'fullstack' ? `backend/config/${f}` : `config/${f}`);
      p.log.info('超管账号(启动时 reconcile 入库,牢记):');
      console.log(`    dev : admin / ${secretsPrintout.develop.adminPassword}   ← 改密:${cfgPath('config.develop.yaml')} 的 admin.password + 重启`);
      console.log(`    prod: admin / ${secretsPrintout.prod.adminPassword}   ← 改密:${cfgPath('config.prod.yaml')} 的 admin.password + 重启(docker 用 .env 的 ADMIN_PASSWORD)`);
    }
    if (stack === 'fullstack') {
      p.log.info('签名/JWT 密钥已写入 web/.env.* 与 backend/config/*.yaml(前后端已同值,无需手抄)');
    } else if (stack === 'backend') {
      p.log.info('签名/JWT 密钥已写入 config/*.yaml;将来接前端时,把 appSign.signKey 同值填入前端 .env');
    } else {
      p.log.info('签名密钥已写入 .env.development / .env.production;将来接后端时,把同值填入后端 yaml 的 appSign.signKey');
    }
  }

  // ── ⑨ 依赖安装(pm = 探测/指定的包管理器) ──
  let installed = false;
  if (!isCI) {
    const doInstall = await p.confirm({ message: `现在执行 ${pm} install?`, initialValue: true });
    if (!p.isCancel(doInstall) && doInstall) {
      installed = run(pm, ['install'], targetDir);
    }
  }

  // ── ⑩ 剩余手工步骤 ──
  p.note(nextSteps(stack, targetDir, installed, pm), '接下来(脚手架搞不定的部分)');
  p.outro('Happy hacking!');
}

function nextSteps(stack, targetDir, installed, pm) {
  const lines = [`cd ${targetDir}`];
  if (!installed) lines.push(`${pm} install`);
  if (stack === 'fullstack') {
    lines.push(`${pm} ${pm === 'npm' ? 'run ' : ''}dev          # web(6177)+ backend(3001)${pm === 'npm' ? '(workspace 顺序执行)' : ''}`);
    lines.push('→ 部署前:配 SSH 凭证 web/scripts/server.config.json + backend/scripts/server.config.cjs(从 example 拷)');
    lines.push('→ 首次部署前:backend/ 下重生 package-lock.json(见 README「第 4 步」)');
  } else if (stack === 'web') {
    lines.push(`${pm} ${pm === 'npm' ? 'run ' : ''}dev          # 端口 6177;checkToken=false 免登录`);
    lines.push('→ 接后端时:public/env.config.js 的 checkToken 改回 true,并填 .env.* 签名密钥');
  } else {
    lines.push(`${pm} ${pm === 'npm' ? 'run ' : ''}dev          # 端口 3001;管理走 /api/docs Swagger`);
    lines.push('→ 部署前:配 SSH 凭证 scripts/server.config.cjs(从 example 拷)');
  }
  return lines.join('\n');
}

/** 单包变体的精简 AGENTS.md(全栈版指南在源仓 templates/root/AGENTS.md) */
function singleStackAgents(stack, pm = 'pnpm') {
  // 单包裸命令:npm 需带 run,yarn/pnpm 直通
  const cmd = (script) => (pm === 'npm' ? `npm run ${script}` : `${pm} ${script}`);
  const common = `面向 AI 编码代理(Claude Code / Codex / Cursor 等)与协作者的工作指南。

> 本项目由 create-ssnode-app 生成(${stack} 单包变体)。响应契约 {code,message,data}、双轨鉴权、
> 密钥占位约定等完整规范见源仓 templates/root/AGENTS.md(脚手架源仓)。
`;
  if (stack === 'web') {
    return `# AGENTS.md

${common}
## 本变体要点(web-only)

- **免登录模式**:public/env.config.js 的 checkToken=false(无后端,AuthLayout 直接放行)。
- **接后端时**:checkToken 改回 true + .env.development/.env.production 填 VITE_APP_SIGN_KEY(与后端 yaml appSign.signKey 逐字一致)+ vite.config.js proxy 指向后端。
- **纯 JS 工程**:jsconfig,不写 TS;eslint airbnb;prettier 单引号/100 宽。
- \`${cmd('dev')}\` 端口 6177;\`${cmd('build')}\` 产物 dist/;\`${cmd('lint')}\` 带 --fix。
`;
  }
  return `# AGENTS.md

${common}
## 本变体要点(backend-only)

- **管理走 Swagger**:dev 起动后 /docs(Swagger 挂根路径,不带 /api 前缀);超管账号见 config.*.yaml 的 admin(password 已由脚手架生成,启动 reconcile 入库)。
- **迁移显式注册**:新增迁移必须手动加进 src/database/sqlite.config.ts 的 migrations 数组(既定约定,漏注册 prod 不建表)。
- **构建** = nest build(tsc)+ terser 混淆;better-sqlite3 v13 需 python3/make/g++ 源码编译。
- **DB 文件名程序定死**:<name>.prod.sqlite / <name>.dev.sqlite(已随生成物改名,四处同步见 sqlite.config.ts)。
- \`${cmd('dev')}\` 端口 3001;\`${cmd('build')}\` = nest build(tsc)+ terser 混淆。
`;
}

// ── 工具函数 ──
/** npm 包内 dotfile 重命名还原(build-pack.mjs 的逆操作;源仓布局无此文件,跳过) */
const DOTFILE_RESTORE = { '_gitignore': '.gitignore', '_npmrc': '.npmrc' };
function copyDir(src, dest) {
  cpSync(src, dest, { recursive: true, filter: COPY_FILTER });
  // 包内模板的 _gitignore/_npmrc 还原为 .gitignore/.npmrc
  for (const [packed, real] of Object.entries(DOTFILE_RESTORE)) {
    const p = join(dest, packed);
    if (existsSync(p)) renameSync(p, join(dest, real));
  }
}
/** 从 templates/root 拷单文件到生成物根(处理包内 dotfile 重命名) */
function copyRootFiles(targetDir, files) {
  // 真名 → 打包名(npm 包布局下 .gitignore/.npmrc 被 build-pack 重命名)
  const REAL_TO_PACKED = { '.gitignore': '_gitignore', '.npmrc': '_npmrc' };
  for (const f of files) {
    const direct = join(TEMPLATES_DIR, 'root', f);                  // 源仓布局:真名
    const packed = REAL_TO_PACKED[f] ? join(TEMPLATES_DIR, 'root', REAL_TO_PACKED[f]) : null; // 包布局:打包名
    const src = existsSync(direct) ? direct : (packed && existsSync(packed) ? packed : null);
    if (src) cpSync(src, join(targetDir, f));
    else if (REAL_TO_PACKED[f]) throw new Error(`根模板缺文件:${f}(源仓/包布局均未找到)`);
  }
}
/** docs/(设计规范、API 安全)拷进生成项目;源仓在 repo 根,npm 包内随包分发于 templates/docs */
function copyDocs(targetDir) {
  const candidates = [
    join(TEMPLATES_DIR, 'docs'),      // 两布局同路径:templates/docs
    join(TEMPLATES_DIR, '..', 'docs') // 源仓兜底(repo 根 docs/)
  ];
  const src = candidates.find((c) => existsSync(c));
  if (src) cpSync(src, join(targetDir, 'docs'), { recursive: true });
}
function extnameAllow(filename) {
  const ext = pathExtname(filename);
  return TEXT_EXTENSIONS.has(ext) || filename === '.gitignore' || filename === '.npmrc' ||
    filename === '_gitignore' || filename === '_npmrc' ||
    filename === '.prettierignore' || filename === '.dockerignore' || filename.startsWith('.env');
}
/** 包管理器探测:优先 pnpm(模板推荐),次 yarn,兜底 npm(node 自带) */
function detectPM() {
  for (const pm of ['pnpm', 'yarn']) {
    const r = spawnSync(pm, ['--version'], { shell: true, stdio: 'pipe' });
    if (r.status === 0) return pm;
  }
  return 'npm';
}

function run(cmd, args, cwd, quietOk) {
  const r = spawnSync(cmd, args, { cwd, stdio: quietOk ? 'pipe' : 'inherit' });
  return r.status === 0;
}

main().catch((e) => { p.cancel(e.message); process.exit(1); });
