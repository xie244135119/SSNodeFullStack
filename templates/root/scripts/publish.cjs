#!/usr/bin/env node
/**
 * 项目级发布编排 —— 调用各服务自己的发布命令(web / backend),薄编排、不重写部署逻辑。
 *
 * backend 的部署方式不再由 --mode 外传:首次部署由服务器 ops/install.sh 交互确认模式,
 * 二次部署用服务器已 baked 的 MODE。本编排只决定发谁。
 *
 * 用法:
 *   pnpm publish                  # web + backend
 *   pnpm publish -- --only web    # 只发 web
 *   pnpm publish -- --only backend # 只发 backend
 *
 * 其余参数(如 --skip-build / --key ~/.ssh/x / --env sandbox)透传给两个子命令,
 * 各脚本只认自己认识的、互忽略未知项,故可安全透传。
 *
 * 子命令用 child_process.spawnSync(stdio:'inherit') 执行 —— 不用 shelljs.exec。
 * 原因:shelljs.exec 底层走 child_process.exec,子进程 stdin 是空 pipe(非 TTY),
 * 且只桥接 stdout/stderr、不桥接 stdin;这会切断 TTY 透传链。链路下游 backend
 * publish.cjs 的 sshInteractive 依 process.stdin.isTTY 决定是否把本地 stdin 桥接到
 * 远端 pty——非 TTY 时不桥接,远端 install.sh 的 read -rp 收不到输入也收不到 EOF,
 * 二次部署端口不一致时卡死。改 spawn+inherit 让 TTY 一路透传到 backend 的 node,
 * isTTY 为真,raw 模式交互正常,backend 侧无需改动。
 */
const { spawnSync } = require('child_process');

const argv = process.argv.slice(2);

// 取走编排层参数(--only),剩余透传给子命令
function take(k) {
  const i = argv.indexOf(k);
  if (i !== -1 && argv[i + 1]) {
    const v = argv[i + 1];
    argv.splice(i, 2);
    return v;
  }
  return null;
}
const only = take('--only'); // 'web' | 'backend' | null
const rest = argv.length ? ' ' + argv.join(' ') : '';

const doWeb = !only || only === 'web';
const doBackend = !only || only === 'backend';
if (doWeb && doBackend) console.log('▶ 发布:web + backend');
else if (doWeb) console.log('▶ 发布:web');
else console.log('▶ 发布:backend');

// spawn + stdio:'inherit':TTY 透传到子进程(交互式 SSH 透传必需);shell:true 支持
// `pnpm --filter ...` 这类带空格的命令串;非交互(CI)下 stdin 非 TTY 也无碍(子命令各自处理)。
function run(cmd) {
  console.log(`\n$ ${cmd}`);
  const code = spawnSync(cmd, { shell: true, stdio: 'inherit', env: process.env }).status;
  if (code !== 0) {
    console.error(`\n✗ 发布失败: ${cmd}`);
    process.exit(code ?? 1);
  }
}

if (doWeb) run(`pnpm --filter web run publish${rest}`);
if (doBackend) run(`pnpm --filter backend run publish${rest}`);

console.log('\n✓ 发布完成');
