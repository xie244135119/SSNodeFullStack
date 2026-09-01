/**
 * backend 发布/回滚共享的 SSH helper —— 薄传输+触发用。
 * - connect:用 server.config.cjs 的 server{} 建连。
 * - sshExec:非交互远端命令(返回 stdout,失败抛错)。
 * - sshInteractive:分配 pty + 透传 stdin/stdout,供远端 install.sh / versionswitch.sh 的
 *   read -rp 交互(首次部署选模式、回滚选版本)直接在本终端操作。
 */
const fs = require('fs');
const os = require('os');
let NodeSSH;
try { ({ NodeSSH } = require('node-ssh')); } catch (e) { fatal('缺少 node-ssh: pnpm i -w node-ssh'); }

const C = { reset: '\x1b[0m', red: '\x1b[31m', green: '\x1b[32m', cyan: '\x1b[36m', yellow: '\x1b[33m', gray: '\x1b[90m' };
const log = {
  info: (m) => console.log(`${C.cyan}▶${C.reset} ${m}`),
  ok: (m) => console.log(`${C.green}✓${C.reset} ${m}`),
  warn: (m) => console.log(`${C.yellow}⚠${C.reset} ${m}`),
  step: (m) => console.log(`${C.gray}  ${m}${C.reset}`),
};
function fatal(m) { console.error(`${C.red}✗${C.reset} ${m}`); process.exit(1); }
const shq = (s) => `'${String(s).replace(/'/g, `'\\''`)}'`;

async function connect(cfg) {
  const s = cfg.server;
  if (!s || !s.host || !s.username) fatal('server.config.cjs server.host/username 未配置');
  const ssh = new NodeSSH();
  const opts = { host: s.host, port: s.port || 22, username: s.username };
  if (s.authMode === 'privateKey') {
    const keyPath = (s.privateKey?.privateKeyPath || '').replace(/^~(?=$|\/|\\)/, os.homedir());
    if (!fs.existsSync(keyPath)) fatal(`私钥不存在: ${keyPath}`);
    opts.privateKey = fs.readFileSync(keyPath, 'utf8');
    if (s.privateKey?.passphrase) opts.passphrase = s.privateKey.passphrase;
  } else {
    if (!s.password) fatal('authMode=password 但 password 未配置');
    opts.password = s.password;
  }
  log.info(`SSH 连接 ${s.username}@${s.host}:${opts.port} ...`);
  try { await ssh.connect(opts); } catch (e) { fatal(`SSH 连接失败: ${e.message}`); }
  log.ok('已连接');
  return ssh;
}

async function sshExec(ssh, cmd, { cwd } = {}) {
  const full = cwd ? `cd ${shq(cwd)} && ${cmd}` : cmd;
  const r = await ssh.execCommand(full);
  const code = r.code == null ? (r.stderr ? 1 : 0) : r.code;
  if (code !== 0) {
    const e = new Error(`远端命令失败: ${cmd}\n${(r.stderr || '').trim() || (r.stdout || '').trim()}`);
    e.code = code; throw e;
  }
  return (r.stdout || '').trim();
}

// 交互式 ssh:分配 pty,本地 stdin(raw)↔ 远端 stdin;远端 stdout/stderr → 本终端。
// 用于首次部署(选模式)与回滚(选版本)的交互透传。非 TTY 下 stdin 不接管(远端 read 收 EOF 走默认)。
function sshInteractive(ssh, cmd, { cwd } = {}) {
  return new Promise((resolve, reject) => {
    const full = cwd ? `cd ${shq(cwd)} && ${cmd}` : cmd;
    const conn = ssh.getConnection();
    const isTTY = Boolean(process.stdin.isTTY);
    const cleanup = () => {
      if (isTTY) { try { process.stdin.setRawMode(false); } catch (_) {} try { process.stdin.pause(); } catch (_) {} }
    };
    conn.exec(full, { pty: { term: 'xterm', cols: process.stdout.columns || 80, rows: process.stdout.rows || 24 } }, (err, stream) => {
      if (err) { cleanup(); return reject(err); }
      const onData = isTTY ? (d) => stream.stdin.write(d) : null;
      if (onData) { process.stdin.setRawMode(true); process.stdin.resume(); process.stdin.on('data', onData); }
      stream.stdout.pipe(process.stdout);
      stream.stderr.pipe(process.stderr);
      let code = 0;
      stream.on('exit', (c) => { code = (c == null ? 0 : c); });
      stream.on('close', () => { if (onData) process.stdin.removeListener('data', onData); cleanup(); resolve(code); });
      stream.on('error', (e) => { if (onData) process.stdin.removeListener('data', onData); cleanup(); reject(e); });
    });
  });
}

module.exports = { log, fatal, shq, connect, sshExec, sshInteractive };
