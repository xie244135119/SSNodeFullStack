/**
 * secrets.js — 密钥生成与注入(纯函数 + 注入器)
 *
 * 生成 dev/prod 两套独立密钥,注入前后端共 8 个点:
 *   web/.env.development        VITE_APP_SIGN_KEY     ← dev signKey
 *   web/.env.production         VITE_APP_SIGN_KEY     ← prod signKey
 *   backend/config/config.develop.yaml  jwt.secret / admin.password / appSign.signKey
 *   backend/config/config.prod.yaml     jwt.secret / admin.password / appSign.signKey
 *
 * 硬约束(README「必改清单」第 2 条):大屏签名密钥前后端必须逐字同值 ——
 * 本模块从同一个生成值写到两端,从根上消灭「改了一端忘另一端」。
 *
 * 密钥形态:
 *   signKey   32 字节 hex(64 字符)  — HMAC-SHA256
 *   jwtSecret 48 字节 hex(96 字符)  — 签发/校验 JWT
 *   password  16 字节 urlSafe       — 超管密码(打印给用户,启动 reconcile 到 DB)
 *   cryptKey  32 字节 base64        — AES-256-GCM 预留(本期未启用,一并生成免得后期补)
 */
import { randomBytes } from 'node:crypto';

/** 生成一套环境密钥(dev 与 prod 各一套,互不相同) */
export function generateEnvSecrets() {
  return {
    signKey: randomBytes(32).toString('hex'),
    cryptKey: randomBytes(32).toString('base64'),
    jwtSecret: randomBytes(48).toString('hex'),
    adminPassword: randomBytes(12).toString('base64url'),
  };
}

/** 生成 dev + prod 两套 */
export function generateSecrets() {
  return { develop: generateEnvSecrets(), prod: generateEnvSecrets() };
}

/**
 * 注入 web/.env.<mode> 文件:
 *   `VITE_APP_SIGN_KEY=`(空值行,包括行尾无值形态)→ `VITE_APP_SIGN_KEY=<signKey>`
 * 同时更新文件头注释里的「模板占位密钥」警告为已生成说明。
 */
export function injectWebEnv(content, mode, signKey) {
  const envFile = mode === 'develop' ? '.env.development' : '.env.production';
  const yamlFile = mode === 'develop' ? 'config.develop.yaml' : 'config.prod.yaml';
  let out = content.replace(
    /^VITE_APP_SIGN_KEY=\s*$/m,
    `VITE_APP_SIGN_KEY=${signKey}`
  );
  out = out.replace(
    /# ⚠️ 模板占位密钥:新项目务必换成自己的 32\+ 字符随机串,且前后端同款。/,
    `# 已由脚手架生成(与 backend/config/${yamlFile} 的 appSign.signKey 同值)。`
  );
  if (!out.includes(`VITE_APP_SIGN_KEY=${signKey}`)) {
    throw new Error(`signKey 注入失败:${envFile} 未找到 VITE_APP_SIGN_KEY= 空值锚点`);
  }
  return out;
}

/**
 * 注入 backend/config/config.<env>.yaml:
 *   jwt.secret / admin.password / appSign.signKey / appSign.cryptKey 四个空值字段。
 * 锚点 = `字段名: ''`(模板统一空字符串占位);只替换 yaml 值层,不碰注释。
 */
export function injectBackendYaml(content, secrets) {
  const pairs = [
    ['jwt', 'secret', secrets.jwtSecret],
    ['admin', 'password', secrets.adminPassword],
    ['appSign', 'signKey', secrets.signKey],
    ['appSign', 'cryptKey', secrets.cryptKey],
  ];
  let out = content;
  for (const [, field, value] of pairs) {
    // 同一 yaml 内字段名唯一(secret/password/signKey/cryptKey 不重复出现),
    // 直接按 `field: ''` 定位;若锚点缺失则报错,绝不静默跳过。
    const anchor = `${field}: ''`;
    if (!out.includes(anchor)) {
      throw new Error(`yaml 注入失败:未找到锚点「${anchor}」`);
    }
    out = out.replace(anchor, `${field}: '${value}'`);
  }
  return out;
}

/**
 * 校验:从生成物文件内容里回读密钥,确认前后端成对一致(守 README 硬约束)。
 * @returns {{ok: boolean, problems: string[]}}
 */
export function verifySecretPairs(files) {
  const problems = [];
  const readSign = (content, label) => {
    const m = content.match(/VITE_APP_SIGN_KEY=([^\s]+)|signKey: '([^']+)'/);
    const v = m ? (m[1] || m[2]) : null;
    if (!v) problems.push(`${label}: 未找到签名密钥`);
    return v;
  };
  for (const mode of ['develop', 'prod']) {
    const envFile = mode === 'develop' ? '.env.development' : '.env.production';
    const yamlFile = mode === 'develop' ? 'config.develop.yaml' : 'config.prod.yaml';
    const web = files[envFile];
    const be = files[yamlFile];
    if (!web || !be) { problems.push(`${mode}: 缺文件 ${!web ? envFile : yamlFile}`); continue; }
    if (readSign(web, envFile) !== readSign(be, yamlFile)) {
      problems.push(`${mode}: ${envFile} 与 ${yamlFile} 的签名密钥不一致`);
    }
  }
  return { ok: problems.length === 0, problems };
}
