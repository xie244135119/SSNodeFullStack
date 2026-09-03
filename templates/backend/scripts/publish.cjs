#!/usr/bin/env node
/**
 * backend 发布 —— 薄传输+触发(部署力学全在服务器侧 ops/install.sh,本脚本不远程执行部署逻辑)。
 *
 * 流程:
 *   buildops 打包(release/<name>-<时间戳>/) → tar 打包 → scp 上传到 APP_ROOT →
 *   ssh 触发 install.sh(分配 pty 透传交互):
 *     · 远端 APP_ROOT/install.sh 不存在(首次部署):解压 tar 到 .bootstrap,跑
 *       `APP_ROOT_HINT=<dir> bash install.sh` —— install.sh 引导(选部署模式交互;
 *       APP_ROOT 由 hint 给定无需手输)→ 建结构、占位阻断、软链 current、派发 mode install。
 *     · 远端 APP_ROOT/install.sh 已存在(二次部署):跑 `bash APP_ROOT/install.sh <tar>`
 *       —— APP_ROOT/MODE 已 baked,无交互(停旧 → 轮转 → 改链 → 重派发)。
 *   成功后清理远端 tar 包与 .bootstrap 临时目录。
 *
 * 不外传 --mode:首次部署的部署方式由服务器 install.sh 交互确认;二次部署用服务器已 baked 的 MODE。
 * 密钥不由开发机注入:systemd/pm2 直读 release 自带 config/config.prod.yaml(真值已入库,
 * 改 current/config/config.prod.yaml + 重启即轮换);docker 用服务器侧 APP_ROOT/.env
 * (首次从 .env.example 种子化、空值阻断、运维手填)。开发机只持 SSH 登录凭证。
 *
 * 用法: pnpm publish [--skip-build]
 */
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { log, fatal, shq, connect, sshExec, sshInteractive } = require('./lib/ssh.cjs');

const BACKEND = path.resolve(__dirname, '..');
const cfg = require('./server.config.cjs');

function readPkg() { return JSON.parse(fs.readFileSync(path.join(BACKEND, 'package.json'), 'utf8')); }

// buildops(透传交互/输出;CI 静默自增)
function runBuildops() {
  log.info('buildops:webpack 单文件 + 组装运维包 ...');
  return new Promise((resolve, reject) => {
    const p = spawn(process.execPath, [path.join(BACKEND, 'scripts', 'build.cjs'), 'buildops'], {
      cwd: BACKEND, env: process.env, stdio: 'inherit',
    });
    p.on('error', reject);
    p.on('close', (c) => (c === 0 ? resolve() : reject(new Error(`buildops exit ${c}`))));
  });
}

function getReleaseDir() {
  const pkg = readPkg();
  const safeName = pkg.name.replace(/^@/, '').replace(/\//g, '-');
  // buildops 产物目录名 = <safeName>-<时间戳>(不再按 version 定位);由 buildops 写入 release/.last-build manifest
  const manifest = path.join(BACKEND, 'release', '.last-build');
  let folder = '';
  if (fs.existsSync(manifest)) folder = fs.readFileSync(manifest, 'utf8').trim();
  const dir = folder ? path.join(BACKEND, 'release', folder) : '';
  if (!folder || !fs.existsSync(dir)) {
    fatal(`buildops 产物未定位(缺 release/.last-build 或目录不存在):先 pnpm buildops`);
  }
  return { dir, version: pkg.version, safeName };
}

// 本地 tar 打包(以 release 目录内容为根,不带顶层目录 → install.sh 直接解压)
// 两条 macOS 元数据治理(已实测:组合后 tar 内 LIBARCHIVE.xattr/com.apple.* 计数为 0):
//   COPYFILE_DISABLE=1 :剥 `._*` AppleDouble 成员(com.apple.* 资源 fork 序列化)。
//   --no-xattrs         :剥 PAX 扩展头 `LIBARCHIVE.xattr.*`。macOS Sonoma+ 会给文件自动打
//                         `com.apple.provenance` 出处 xattr,libarchive 打包时序列化进 tar,
//                         传到 Linux GNU tar 不认该 keyword → 打 "Ignoring unknown extended
//                         header keyword" 警告(无害但噪声)。COPYFILE_DISABLE 压不住这条
//                         (它只管 AppleDouble 路径,不管 libarchive xattr PAX 头),故另需本 flag。
//   二者并存不冲突(`--no-xattrs --no-mac-metadata` 才互斥,故不叠 mac-metadata)。
function makeTar(releaseDir, safeName, version) {
  const tarPath = path.join(BACKEND, 'release', `${safeName}-${version}.tar.gz`);
  return new Promise((resolve, reject) => {
    const p = spawn('tar', ['--no-xattrs', '-czf', tarPath, '-C', releaseDir, '.'], {
      stdio: 'inherit',
      env: { ...process.env, COPYFILE_DISABLE: '1' },
    });
    p.on('error', reject);
    p.on('close', (c) => (c === 0 ? resolve(tarPath) : reject(new Error(`tar exit ${c}`))));
  });
}

async function main() {
  const skipBuild = process.argv.includes('--skip-build');

  // 1) buildops
  if (!skipBuild) await runBuildops();
  else log.warn('跳过 buildops(--skip-build),沿用现有 release');
  const { dir: releaseDir, version, safeName } = getReleaseDir();
  log.ok(`运维包: release/${safeName}-${version} (v${version})`);

  // 2) tar
  log.info('打包 tar ...');
  const tarPath = await makeTar(releaseDir, safeName, version);
  const tarName = path.basename(tarPath);
  log.ok(`tar: ${tarName}`);

  const appRoot = cfg.backendServiceDir;
  const remoteTar = `${appRoot}/${tarName}`;

  // 3) SSH + 上传 + 触发
  const ssh = await connect(cfg);
  try {
    await sshExec(ssh, `mkdir -p ${shq(appRoot)}`);
    log.info(`上传 ${tarName} → ${appRoot} ...`);
    await ssh.putFile(tarPath, remoteTar);
    log.ok('上传完成');

    // 判断首次/二次:远端 APP_ROOT/install.sh 是否存在
    const installed = await sshExec(ssh, `test -f ${shq(`${appRoot}/install.sh`)} && echo yes || echo no`);

    let code;
    if (installed === 'yes') {
      // 二次部署:APP_ROOT/install.sh 已 baked APP_ROOT/MODE,无交互
      log.info(`二次部署:触发 APP_ROOT/install.sh ${tarName} ...`);
      code = await sshInteractive(ssh, `bash ${shq(`${appRoot}/install.sh`)} ${shq(remoteTar)}`, { cwd: appRoot });
    } else {
      // 首次部署:解压到 .bootstrap,跑 release 内的 ops/install.sh(APP_ROOT_HINT 免手输 APP_ROOT,模式仍交互)
      log.info('首次部署:解压引导 + 运行 install.sh(交互选部署模式)...');
      const bootDir = `${appRoot}/.bootstrap`;
      await sshExec(ssh, `rm -rf ${shq(bootDir)} && mkdir -p ${shq(bootDir)}`);
      await sshExec(ssh, `tar -xzf ${shq(remoteTar)} -C ${shq(bootDir)}`);
      code = await sshInteractive(ssh, `APP_ROOT_HINT=${shq(appRoot)} bash install.sh`, { cwd: bootDir });
      // 成功后清理 .bootstrap(失败则保留以便重跑)
      if (code === 0) await sshExec(ssh, `rm -rf ${shq(bootDir)}`).catch(() => {});
    }

    // throw 而非 fatal:fatal 走 process.exit(1) 会同步终止进程、跳过 finally,
    // 导致本地 tar 与远端 tar 都残留。throw 让 finally 兜底清理。
    if (code !== 0) throw new Error(`install.sh 远端失败 (exit ${code})`);
    log.ok('发布完成');
  } finally {
    // 远端 tar:成功/失败都清(install.sh 失败时 release 已落盘或 .bootstrap 保留供重跑,
    // tar 本身无需留存;ssh 可能异常,best-effort 不阻塞)
    await sshExec(ssh, `rm -f ${shq(remoteTar)}`).catch(() => {});
    ssh.dispose();
    if (fs.existsSync(tarPath)) fs.rmSync(tarPath, { force: true });
  }
}

main().catch((e) => fatal(e.message));
