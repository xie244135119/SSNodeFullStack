import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';
import type { AppConfig } from './config.interface';

/**
 * 按 NODE_ENV 加载对应 yaml 配置,默认 develop
 * 文件位于 backend/config/config.{env}.yaml;buildops 产物保留 config/config.<env>.yaml 原名。
 *
 * prod 真值(jwt 密钥/签名密钥/admin 凭证/端口等)已入库 config.prod.yaml——systemd/pm2
 * 以 cwd=current 经 resolveConfig 直读;环境变量为可选覆盖通道(docker 经 .env 注入、
 * 或免改 yaml 轮换时用),env 未设则回退 yaml 值。本地 dev 不设 env 仍用 yaml。
 * 超管账号 yaml 为权威(启动 reconcile 到 DB,支持改配置+重启轮换);占位值(change-me/空)
 * 时 user.service 跳过 reconcile、不写弱默认,作防御兜底。
 *
 * 镜像自带 config.<env>.yaml 作默认,部署 docker run -e 注入各环境值,
 * 换 env 即换环境,无需每环境一个镜像。
 */

const envStr = (k: string, fallback?: string): string | undefined => {
  const v = process.env[k];
  return v !== undefined && v !== '' ? v : fallback;
};
const envInt = (k: string, fallback?: number): number | undefined => {
  const v = process.env[k];
  if (v === undefined || v === '') return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};
const envList = (k: string, fallback?: string[]): string[] | undefined => {
  const v = process.env[k];
  if (v === undefined || v === '') return fallback;
  return v.split(',').map((s) => s.trim()).filter(Boolean);
};

export default (): AppConfig => {
  const env = process.env.NODE_ENV || 'develop';
  const file = `config.${env}.yaml`;

  // 配置文件定位：cwd 优先（运维部署 cwd 即版本根，单文件 dist/main.js 也能找到 config/），
  // __dirname 兜底（兼容 tsc 多文件布局 dist/config/configuration.js → ../../config）。
  // 三种部署形态都命中,不依赖固定目录深度:
  //   1) cwd 根 config.yaml   — buildops 运维包布局(整包根放 config.yaml,不分 env)
  //   2) cwd/config/<name>    — dev/docker/多 env 布局(config.<env>.yaml)
  //   3) __dirname/../../config/<name> — tsc 多文件布局(dist/config → ../../config)
  const resolveConfig = (name: string) => {
    const rootCfg = path.join(process.cwd(), 'config.yaml');
    if (fs.existsSync(rootCfg)) return rootCfg;
    const byCwd = path.join(process.cwd(), 'config', name);
    if (fs.existsSync(byCwd)) return byCwd;
    return path.join(__dirname, '../../config', name);
  };
  const filePath = resolveConfig(file);

  let config: AppConfig;
  try {
    const text = fs.readFileSync(filePath, 'utf8');
    config = yaml.load(text) as AppConfig;
  } catch (e) {
    // 找不到对应环境文件时回退到 develop
    config = yaml.load(fs.readFileSync(resolveConfig('config.develop.yaml'), 'utf8')) as AppConfig;
  }

  return {
    ...config,
    app: {
      ...config.app,
      port: envInt('PORT', config.app.port) as number,
      corsOrigins: envList('CORS_ORIGINS', config.app.corsOrigins) as string[]
    },
    database: {
      ...config.database,
      // DB_DIR:仅目录(容器内如 /app/data、宿主绝对路径)。
      // 文件名由程序按 NODE_ENV 定死为 template.<env>.sqlite(prod=template.prod.sqlite /
      // dev=template.dev.sqlite),不外配;未设 DB_DIR 则用 yaml 的 dir(相对 data/ → WORKDIR /app)。
      dir: envStr('DB_DIR', config.database.dir) as string
    },
    jwt: {
      ...config.jwt,
      secret: envStr('JWT_SECRET', config.jwt.secret) as string,
      expiresIn: envStr('JWT_EXPIRES', config.jwt.expiresIn) as string
    },
    log: {
      ...config.log,
      level: envStr('LOG_LEVEL', config.log.level) as string
    },
    upload: {
      ...config.upload,
      // 上传目录随 data volume 走(如 /app/data/uploads)
      storagePath: envStr('UPLOAD_STORAGE_PATH', config.upload.storagePath) as string
    },
    // 超管账号:yaml 为权威,启动时 user.service 把 DB reconcile 到此值
    // (支持「改配置 + 重启」轮换)。prod 真值已入库 config.prod.yaml;ADMIN_USERNAME/
    // ADMIN_PASSWORD env 为可选覆盖(docker 经 .env、或免改 yaml 轮换时用)。
    // 占位值(change-me/空)时 user.service 跳过、不写弱默认,作防御兜底。
    admin: {
      ...config.admin,
      username: envStr('ADMIN_USERNAME', config.admin.username) as string,
      password: envStr('ADMIN_PASSWORD', config.admin.password) as string
    },
    appSign: {
      ...config.appSign,
      signKey: envStr('APP_SIGN_KEY', config.appSign.signKey) as string,
      tsWindow: envInt('APP_SIGN_TS_WINDOW', config.appSign.tsWindow) as number
    }
  };
};
