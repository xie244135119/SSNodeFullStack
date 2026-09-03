#!/usr/bin/env node
/**
 * backend 回滚 —— 薄触发(版本切换力学在服务器侧 ops/versionswitch.sh,交互选版本)。
 *
 * 用法:
 *   pnpm rollback -- --only backend   # ssh 进服务器,跑 APP_ROOT/versionswitch.sh(交互列版本、选一个)
 *
 * 不外传版本片段:版本选择由服务器 versionswitch.sh 交互完成(systemd/pm2 列 releases 改链,
 * docker 列镜像 tag 重 run)。本脚本只负责 SSH 连接 + 透传交互 TTY。
 */
const path = require('path');
const { log, fatal, shq, connect, sshExec, sshInteractive } = require('./lib/ssh.cjs');

const cfg = require('./server.config.cjs');

async function main() {
  const appRoot = cfg.backendServiceDir;
  const ssh = await connect(cfg);
  try {
    const installed = await sshExec(ssh, `test -f ${shq(`${appRoot}/install.sh`)} && echo yes || echo no`);
    if (installed !== 'yes') fatal(`远端 ${appRoot}/install.sh 不存在(尚未首次部署,无可回滚版本)`);

    log.info(`触发回滚(交互选版本): APP_ROOT/versionswitch.sh ...`);
    const code = await sshInteractive(ssh, `bash ${shq(`${appRoot}/versionswitch.sh`)}`, { cwd: appRoot });
    if (code !== 0) fatal(`versionswitch.sh 远端失败 (exit ${code})`);
    log.ok('回滚完成');
  } finally {
    ssh.dispose();
  }
}

main().catch((e) => fatal(e.message));
