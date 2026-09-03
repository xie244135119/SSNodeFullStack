#!/usr/bin/env node
/**
 * 项目级回滚编排 —— 调用各服务自己的回滚命令(web / backend),薄编排。
 *
 * backend 回滚不外传版本片段:版本选择由服务器 ops/versionswitch.sh 交互完成
 * (ssh 透传 TTY,列 releases/镜像 tag、选一个)。本编排只决定回滚谁。
 *
 * 用法:
 *   pnpm rollback                   # web + backend
 *   pnpm rollback -- --only web    # 只回滚 web
 *   pnpm rollback -- --only backend # 只回滚 backend(交互选版本)
 *
 * 其余参数(如 --key ~/.ssh/x / --env sandbox)透传给两个子命令,各脚本互忽略未知项。
 *
 * 子命令用 child_process.spawnSync(stdio:'inherit') 执行 —— 不用 shelljs.exec。
 * 原因:shelljs.exec 底层走 child_process.exec,子进程 stdin 是空 pipe(非 TTY),
 * 且只桥接 stdout/stderr、不桥接 stdin;这会切断 TTY 透传链。链路下游 backend
 * rollback.cjs 的 sshInteractive 依 process.stdin.isTTY 决定是否把本地 stdin 桥接到
 * 远端 pty——非 TTY 时不桥接,远端 versionswitch.sh 的版本选择 read 收不到输入也
 * 收不到 EOF,交互选版本时卡死。改 spawnSync+inherit 让 TTY 一路透传到 backend 的
 * node,isTTY 为真,raw 模式交互正常,backend 侧无需改动。与 scripts/publish.cjs 同款修复。
 */
const { spawnSync } = require('child_process');

const argv = process.argv.slice(2);

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
if (doWeb && doBackend) console.log('▶ 回滚:web + backend');
else if (doWeb) console.log('▶ 回滚:web');
else console.log('▶ 回滚:backend');

// spawn + stdio:'inherit':TTY 透传到子进程(交互式 SSH 透传必需);shell:true 支持
// `pnpm --filter ...` 这类带空格的命令串;非交互(CI)下 stdin 非 TTY 也无碍(子命令各自处理)。
function run(cmd) {
  console.log(`\n$ ${cmd}`);
  const code = spawnSync(cmd, { shell: true, stdio: 'inherit', env: process.env }).status;
  if (code !== 0) {
    console.error(`\n✗ 回滚失败: ${cmd}`);
    process.exit(code ?? 1);
  }
}

if (doWeb) run(`pnpm --filter web run rollback${rest}`);
if (doBackend) run(`pnpm --filter backend run rollback${rest}`);

console.log('\n✓ 回滚完成');
