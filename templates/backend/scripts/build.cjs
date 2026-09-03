/**
 * backend 构建脚本（webpack 单文件 + 自动 version）。
 *
 * 用法:
 *   pnpm build                 # = build 子命令:webpack 单文件打包到 dist/main.js + 自动 bump version
 *   pnpm buildops              # = buildops 子命令:build 之后,组装运维包到 release/<name>-<时间戳>/
 *   pnpm build -- --version 2.0.0   # 跳转更新 version(显式指定,不做默认 bump)
 *   pnpm build -- --no-bump        # 不动 version(仅打包,迭代调试用)
 *   pnpm buildops -- --skip-build  # buildops 不重跑 webpack,用现有 dist(仅重组装包)
 *
 * version 规则(优先级从高到低):
 *   - --version <v>:跳转到指定值(原样写入)。
 *   - --no-bump:保持当前 version 不变。
 *   - 交互(TTY、非 CI、无上述参数):询问策略 — 1)自增末段(推荐) 2)维持现状 3)指定版本。
 *   - 默认(非交互,如被 publish 静默调起 / CI):末段数值 +1 → 1.0.10 → 1.0.11(与 web publish.cjs 同口径)。
 *
 * buildops 产物(backend/release/<name>-<时间戳>/):
 *   ├── install.sh start.sh stop.sh versionswitch.sh status.sh  (顶层薄封装,从 ops/ 提到包根)
 *   ├── ops/        (mode dispatch:docker/pm2/systemd/sqlite + 运维文档.html;顶层脚本不重复进 ops/)
 *   └── releases/<version>-<ts>/   (打完的包内容:dist/main.js + package.json + package-lock.json + Dockerfile + .dockerignore + docker-compose.yml + config/config.prod.yaml + .build-ts;子目录带 ts,同 version 多次打包不冲突)
 *
 * 产物目录名 = <name>-<时间戳>(仅本地产物目录命名,不替代 version);version 仍用于内层
 * releases/<version>-<ts>/ 子目录与 docker 镜像 tag。publish.cjs 经 release/.last-build manifest 定位产物。
 *
 * name 取 backend/package.json 的 name,做路径安全化 → backend。
 */
const fs = require('fs');
const path = require('path');
const readline = require('readline');
const webpack = require('webpack');

const BACKEND = path.resolve(__dirname, '..');
const PKG_PATH = path.join(BACKEND, 'package.json');
const RELEASE_DIR = path.join(BACKEND, 'release');
const webpackConfig = require(path.join(BACKEND, 'webpack.pack.cjs'));

// ---------- argv ----------
const argv = process.argv.slice(2);
const sub = argv.find((a) => a === 'build' || a === 'buildops') || 'build';
const verIdx = argv.indexOf('--version');
const setVersion = verIdx !== -1 ? argv[verIdx + 1] : null;
const noBump = argv.includes('--no-bump');
const skipBuild = argv.includes('--skip-build');

if (setVersion && noBump) {
  console.error('✗ --version 与 --no-bump 互斥');
  process.exit(1);
}

// ---------- helpers ----------
function tsNow() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return (
    `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}` +
    `${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`
  );
}

function nextVersion(current) {
  if (noBump) return current;
  if (setVersion) return setVersion;
  // 默认更新:末段数值 +1(与 web publish.cjs 同口径,1.0.10 → 1.0.11)
  const parts = current.split('.');
  const last = parts[parts.length - 1];
  const num = parseInt(last, 10);
  if (parts.length > 1 && /^\d+$/.test(last) && Number.isFinite(num)) {
    parts[parts.length - 1] = String(num + 1);
    return parts.join('.');
  }
  // 末段非纯数字(无法 +1),兜底追时间戳
  return `${current}.${tsNow()}`;
}

function readPkg() {
  return JSON.parse(fs.readFileSync(PKG_PATH, 'utf8'));
}

function writePkg(pkg) {
  fs.writeFileSync(PKG_PATH, JSON.stringify(pkg, null, 2) + '\n');
}

function fmtSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

function dirSize(dir) {
  let total = 0;
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const f = path.join(d, e.name);
      if (e.isDirectory()) walk(f);
      else total += fs.statSync(f).size;
    }
  };
  if (fs.existsSync(dir)) walk(dir);
  return total;
}

// 交互:仅当无显式版本参数、且 stdin 是 TTY(publish 经 stdio:'inherit' 透传也命中)、
// 非 CI 时询问策略。被 silent exec 或 CI 调起时自动走默认自增,不卡死。
function isInteractive() {
  return Boolean(process.stdin.isTTY) && !process.env.CI;
}

function ask(rl, q) {
  return new Promise((res) => rl.question(q, (a) => res(a)));
}

async function promptVersionStrategy(currentVersion) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  try {
    const preview = nextVersion(currentVersion); // 默认自增后的预览
    console.log(`\n📌 当前版本: ${currentVersion}`);
    console.log('版本更新策略:');
    console.log(`  1) 自增末段(推荐)→ ${preview}`);
    console.log(`  2) 维持现状(不 bump)→ ${currentVersion}`);
    console.log('  3) 指定版本(跳转)');
    const choice = (await ask(rl, '请选择 [1]: ')).trim() || '1';
    if (choice === '1') return preview;
    if (choice === '2') return currentVersion;
    if (choice === '3') {
      const input = (await ask(rl, '输入目标版本(如 2.0.0): ')).trim();
      if (!input) throw new Error('未输入版本号');
      if (!/^\d+(\.\d+)+$/.test(input)) {
        throw new Error(`版本号格式不合法: ${input}(期望如 1.0.0)`);
      }
      return input;
    }
    throw new Error(`无效选择: ${choice}`);
  } finally {
    rl.close();
  }
}

// 同步 package-lock.json 的根 version 字段(与 package.json version 对齐),避免 Dockerfile
// `npm ci` 因 package.json 与 lock 的 version 不一致而报 out-of-sync。仅改 root.version 与
// packages[""].version 两处(依赖树不动,离线、无网络)。lock 不存在则跳过(未生成时)。
function syncLockVersion(version) {
  const lockPath = path.join(BACKEND, 'package-lock.json');
  if (!fs.existsSync(lockPath)) return;
  const lock = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
  let changed = false;
  if (lock.version !== version) { lock.version = version; changed = true; }
  if (lock.packages && lock.packages[''] && lock.packages[''].version !== version) {
    lock.packages[''].version = version;
    changed = true;
  }
  if (changed) fs.writeFileSync(lockPath, JSON.stringify(lock, null, 2) + '\n');
}

// bump version 写回 package.json,返回 {old,new,source}
async function bumpVersion() {
  const pkg = readPkg();
  const oldV = pkg.version;
  let newV;
  let source;
  if (setVersion) {
    newV = setVersion;
    source = '--version';
  } else if (noBump) {
    newV = oldV;
    source = '--no-bump';
  } else if (isInteractive()) {
    newV = await promptVersionStrategy(oldV);
    source = 'interactive';
  } else {
    newV = nextVersion(oldV);
    source = 'default';
  }
  if (newV !== oldV) {
    pkg.version = newV;
    writePkg(pkg);
    syncLockVersion(newV);
    console.log(`📌 version: ${oldV} → ${newV}  (${source})`);
  } else {
    console.log(`📌 version: ${oldV} (unchanged, ${source})`);
  }
  return { old: oldV, new: newV };
}

// webpack 单文件打包 → dist/main.js
function runWebpack() {
  console.log('📦 webpack 单文件打包 (src/main.ts → dist/main.js) ...');
  return new Promise((resolve, reject) => {
    webpack(webpackConfig, (err, stats) => {
      if (err) return reject(err);
      if (stats.hasErrors()) {
        return reject(new Error(stats.toString({ colors: false, errors: true, warnings: false })));
      }
      const out = path.join(BACKEND, 'dist', 'main.js');
      console.log(`  ✓ dist/main.js  (${fmtSize(fs.statSync(out).size)})`);
      resolve();
    });
  });
}

// 清理 macOS AppleDouble(`._*`)与 `.DS_Store` 垃圾文件。
// 根因:源文件带 com.apple.* 扩展属性,macOS tar(bsdtar)打包时会把它序列化成 `._*`
// 注入 tar 包,传到 Linux 服务器成无效垃圾(不影响运行但污染产物、增传输量)。
// 此处兜底清理产物;打包侧另用 COPYFILE_DISABLE=1 从根本禁用(见 scripts/publish.cjs makeTar)。
function cleanAppleDoubles(dir) {
  if (!fs.existsSync(dir)) return 0;
  let removed = 0;
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const f = path.join(d, e.name);
      if (e.name.startsWith('._') || e.name === '.DS_Store') {
        fs.rmSync(f, { recursive: true, force: true });
        removed += 1;
        continue;
      }
      if (e.isDirectory()) walk(f);
    }
  };
  walk(dir);
  return removed;
}

// 防御:package-lock.json 必须是真 npm lockfile(resolved = registry URL)。
// pnpm workspace 下误跑 `npm install` 会把现有 pnpm 符号链当 resolved 路径写进 lock
// (resolved = "../node_modules/.pnpm/..."),Dockerfile `npm ci` 据此建出指向容器内不存在的
// .pnpm 的断链 node_modules → require('@nestjs/core') MODULE_NOT_FOUND 容器反复 Restarting。
// buildops 时拦此污染,提示重生路径。
function validateLockfile() {
  const lockPath = path.join(BACKEND, 'package-lock.json');
  if (!fs.existsSync(lockPath)) return; // 未生成时跳过(Dockerfile npm ci 另因缺 lock 报错)
  const raw = fs.readFileSync(lockPath, 'utf8');
  if (raw.includes('node_modules/.pnpm')) {
    throw new Error(
      `${path.relative(BACKEND, lockPath)} 是伪 npm lockfile(resolved 含 pnpm 虚拟存储相对路径 ` +
      `node_modules/.pnpm),Dockerfile npm ci 会建断链 node_modules。重生(避开 pnpm node_modules 污染):\n` +
      `  rm -f backend/package-lock.json && mkdir -p /tmp/be-lock && cp backend/package.json /tmp/be-lock/ ` +
      `&& (cd /tmp/be-lock && npm install --package-lock-only --omit=dev --legacy-peer-deps ` +
      `&& cp package-lock.json <repo>/backend/)`
    );
  }
}

// 组装运维包
function buildOps(version) {
  validateLockfile();
  const pkg = readPkg();
  // name 路径安全化:backend → backend
  const safeName = pkg.name.replace(/^@/, '').replace(/\//g, '-');
  // 本次打包时间戳(产物目录名与内层 releases 子目录共用,避免同 version 多次打包冲突)
  const ts = tsNow();
  // 产物目录名:<name>-<时间戳>(仅本地产物目录命名;version 仍用于内层 releases/<version>-<ts>/ 与 docker 镜像 tag,不替代)
  const folder = `${safeName}-${ts}`;
  const outDir = path.join(RELEASE_DIR, folder);

  fs.rmSync(outDir, { recursive: true, force: true });
  fs.mkdirSync(outDir, { recursive: true });

  const TOP_SCRIPTS = ['install.sh', 'start.sh', 'stop.sh', 'versionswitch.sh', 'status.sh'];

  // 1) 内层 releases/<version>-<ts>/:dist + package.json + Dockerfile + .dockerignore + docker-compose.yml + config/config.prod.yaml
  //    docker-compose.yml 与 Dockerfile 同级(compose 备选部署方式,install.sh 默认用 raw docker run 不走 compose);
  //    .dockerignore 排除 docker-compose.yml,使其不进镜像 build context(image 不含 compose 文件)。
  //    (子目录名带时间戳:同一 version 可能多次打包,加 ts 避免覆盖/混淆)
  const appDir = path.join(outDir, 'releases', `${version}-${ts}`);
  fs.mkdirSync(appDir, { recursive: true });
  fs.cpSync(path.join(BACKEND, 'dist'), path.join(appDir, 'dist'), { recursive: true });
  fs.copyFileSync(PKG_PATH, path.join(appDir, 'package.json'));
  // package-lock.json 供 Dockerfile npm ci(可复现依赖);bump 时已 sync version 字段。
  const lockSrc = path.join(BACKEND, 'package-lock.json');
  if (fs.existsSync(lockSrc)) fs.copyFileSync(lockSrc, path.join(appDir, 'package-lock.json'));
  // deps/:version 归一(0.0.0)的 package*.json 副本,供 Dockerfile deps 阶段 COPY。
  //   每次 version bump 只改真 package.json/lock 的 version 字段,deps/ 副本恒为 0.0.0 →
  //   依赖层 cache 不被打断,npm ci + better-sqlite3 编译只在依赖树真变时重跑(稳态 build 秒级)。
  //   仅改 root version 与 packages[""].version 两处(依赖树不动,与 syncLockVersion 同口径)。
  //   host 的 current/package.json(真 version)不受影响 —— read_tag 读它拼 <version>-<ts> tag。
  const depsDir = path.join(appDir, 'deps');
  fs.mkdirSync(depsDir, { recursive: true });
  const depsPj = JSON.parse(fs.readFileSync(PKG_PATH, 'utf8'));
  depsPj.version = '0.0.0';
  fs.writeFileSync(path.join(depsDir, 'package.json'), JSON.stringify(depsPj, null, 2) + '\n');
  const lockCopy = path.join(appDir, 'package-lock.json');
  if (fs.existsSync(lockCopy)) {
    const depsLk = JSON.parse(fs.readFileSync(lockCopy, 'utf8'));
    depsLk.version = '0.0.0';
    if (depsLk.packages && depsLk.packages['']) depsLk.packages[''].version = '0.0.0';
    fs.writeFileSync(path.join(depsDir, 'package-lock.json'), JSON.stringify(depsLk, null, 2) + '\n');
  }
  fs.copyFileSync(path.join(BACKEND, 'Dockerfile'), path.join(appDir, 'Dockerfile'));
  fs.copyFileSync(path.join(BACKEND, '.dockerignore'), path.join(appDir, '.dockerignore'));
  fs.copyFileSync(path.join(BACKEND, 'docker-compose.yml'), path.join(appDir, 'docker-compose.yml'));
  fs.mkdirSync(path.join(appDir, 'config'), { recursive: true });
  fs.copyFileSync(
    path.join(BACKEND, 'config', 'config.prod.yaml'),
    path.join(appDir, 'config', 'config.prod.yaml')
  );
  // .build-ts:供 docker config.sh::read_tag 拼 <version>-<ts> tag(与 systemd/pm2 releases/<ver>-<ts> 同口径)。
  fs.writeFileSync(path.join(appDir, '.build-ts'), ts + '\n', 'utf8');

  // 2) ops/ 模块:mode dispatch(docker/pm2/systemd/sqlite + 运维文档.html),排除顶层脚本(已提到包根,不在 ops/ 重复)
  const opsSrc = path.join(BACKEND, 'ops');
  const opsDst = path.join(outDir, 'ops');
  fs.mkdirSync(opsDst, { recursive: true });
  for (const e of fs.readdirSync(opsSrc, { withFileTypes: true })) {
    if (e.isFile() && TOP_SCRIPTS.includes(e.name)) continue;
    fs.cpSync(path.join(opsSrc, e.name), path.join(opsDst, e.name), { recursive: true });
  }

  // 3) 顶层脚本拷到包根(install.sh 现位于包根,首次部署跑 `bash install.sh` 而非 `bash ops/install.sh`)
  for (const s of TOP_SCRIPTS) {
    const src = path.join(opsSrc, s);
    if (fs.existsSync(src)) fs.copyFileSync(src, path.join(outDir, s));
  }

  // 4) 清理 macOS AppleDouble/.DS_Store(防御性兜底;根因在打包侧 COPYFILE_DISABLE)
  const junk = cleanAppleDoubles(outDir);
  if (junk) console.log(`  🧹 清理 macOS AppleDouble/.DS_Store 垃圾文件 ${junk} 个`);

  // 5) 写 .last-build manifest 供 publish.cjs 定位(产物目录名带时间戳,publish 不再按 version 定位)
  fs.writeFileSync(path.join(RELEASE_DIR, '.last-build'), folder + '\n', 'utf8');

  console.log(`\n✓ 运维包: ${path.relative(BACKEND, outDir)}  (v${version}, 总 ${fmtSize(dirSize(outDir))})`);
  console.log('  ├── install.sh start.sh stop.sh versionswitch.sh status.sh  (顶层薄封装,包根)');
  console.log('  ├── ops/        (docker/pm2/systemd/sqlite + 运维文档.html)');
  console.log('  └── releases/<version>-<ts>/  (dist + package.json + package-lock.json + Dockerfile + .dockerignore + docker-compose.yml + config/config.prod.yaml + .build-ts)');
}

async function main() {
  const { new: version } = await bumpVersion();
  if (!skipBuild) {
    await runWebpack();
  } else {
    const out = path.join(BACKEND, 'dist', 'main.js');
    if (!fs.existsSync(out)) {
      console.error(`✗ --skip-build 但 dist/main.js 不存在: ${out}`);
      process.exit(1);
    }
    console.log(`⏭  跳过 webpack,沿用 dist/main.js  (${fmtSize(fs.statSync(out).size)})`);
  }

  if (sub === 'buildops') {
    buildOps(version);
  }
}

main().catch((e) => {
  console.error(`✗ 失败: ${e.message}`);
  process.exit(1);
});
