/*
 * Description
 */
/**
 * backend 发布配置 —— 薄传输+触发用(部署力学在服务器侧 ops/install.sh)。
 *
 * 由 backend/scripts/publish.cjs 读取。复制本文件为 server.config.cjs 后按环境填写。
 * ⚠ 含服务器登录密码,server.config.cjs 已 .gitignore 排除,不入库。
 *
 * 生产密钥(jwt/admin/appSign)不在本文件 —— systemd/pm2 直读 release 自带
 * config/config.prod.yaml(改 current/config/config.prod.yaml + 重启即轮换);
 * docker 用服务器侧 APP_ROOT/.env(首次从 .env.example 种子化,空值阻断,运维手填)。
 */
module.exports = {
  // ── 服务器连接(SSH,上传 tar + 触发 install.sh 用) ──
  server: {
    host: '<服务器IP>',
    port: 22,
    username: 'root',
    authMode: 'password', // 'password' | 'privateKey'
    password: '<服务器密码>',
    // authMode=privateKey 时用(~ 自动展开到家目录)
    // privateKey: { privateKeyPath: '~/.ssh/your-key', passphrase: '' }
  },

  // ── 后端服务目录(服务端 APP_ROOT:current/releases/data/logs 所在) ──
  // 首次部署由 install.sh 在此目录下建 current/releases/data/logs 结构。
  backendServiceDir: '/data/server/g-backend'
};
