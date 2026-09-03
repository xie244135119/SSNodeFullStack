/**
 * 应用配置接口(yaml → 强类型)
 */
export interface AppConfig {
  app: {
    port: number;
    globalPrefix: string;
    /** 允许的前端来源(cors origin),prod 收敛到前端域名 */
    corsOrigins: string[];
  };
  database: {
    type: string;
    /** sqlite 主库所在目录(仅目录)。文件名由程序按环境定死为 g-fullstack.<env>.sqlite,不外配:
     *  prod=g-fullstack.prod.sqlite / dev=g-fullstack.dev.sqlite。仅此目录可由 yaml 或 DB_DIR env 覆盖。 */
    dir: string;
    synchronize: boolean;
    logging: boolean | string[];
  };
  jwt: {
    secret: string;
    expiresIn: string;
  };
  log: {
    level: string;
  };
  /** 限流配置 */
  throttle: {
    /** 每分钟最大请求数 */
    limit: number;
    /** 窗口(秒) */
    ttl: number;
    /** 限流白名单路径前缀(免限流) */
    whitelist: string[];
  };
  /** 文件上传配置(走 nginx 静态资源目录) */
  upload: {
    /** nginx 静态资源可访问的 URL 前缀 */
    urlPrefix: string;
    /** 服务器上 nginx 静态目录的绝对路径,后端把文件写到这里 */
    storagePath: string;
    /** 允许的扩展名 */
    allowedExt: string[];
    /** 单文件最大字节 */
    maxSize: number;
  };
  /** 超管账号(yaml 为权威,启动 reconcile 到 DB;prod 真值已入库 config.prod.yaml,env 为可选覆盖) */
  admin: {
    username: string;
    password: string;
  };
  /** 大屏 API 签名加密配置(无 token、无过期) */
  appSign: {
    /** HMAC-SHA256 签名密钥,永不过期 */
    signKey: string;
    /** AES-256-GCM 内容加密密钥,base64(32 字节)。本期保留不启用,后期响应/body 加密用 */
    cryptKey: string;
    /** 时间戳允许偏差(秒),默认 300(±5min) */
    tsWindow: number;
  };
}
