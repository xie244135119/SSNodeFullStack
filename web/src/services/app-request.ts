import Axios from 'axios';
import { sha256 as hmacSha256 } from 'js-sha256';
import ProjectConfig from '../../config/project.config';

/**
 * 大屏 API 请求实例(无 token、无过期,HMAC 签名)
 *
 * 协议见 docs/api-security.md。本期(请求侧签名)对每个请求加:
 *  - X-App-Ts:    Unix 秒
 *  - X-App-Nonce: 16 hex 随机
 *  - X-App-Sign:  HMAC-SHA256(method\npath\nsortedQuery\nts\nnonce\n, signKey) hex
 *
 * 签名串格式(6 段,\n 分隔),GET 无请求 body,body 段为空串:
 *   METHOD\nPATH\nSORTED_QUERY\nTS\nNONCE\nBODY_CIPHER_B64
 *
 * 响应本期明文返回(后期响应加密时在此解密;解密须用纯 JS 库如 aes-js,禁用 crypto.subtle
 * — 生产纯 HTTP 不安全上下文下不可用,见 docs/api-security.md §2.2/§5.4)。响应统一走 ResponseItem { code, message, data }。
 *
 * 密钥来自构建期注入的 VITE_APP_SIGN_KEY(由 vite 在 build 时以 process.env
 * 或 .env 文件注入,内联进 bundle,不再落到 public/env.config.js 运行时文件,
 * 避免密钥以明文静态资源形式暴露)。需与 backend yaml appSign.signKey 一致。
 */
const SIGN_KEY = import.meta.env.VITE_APP_SIGN_KEY || '';

if (!SIGN_KEY) {
  // 缺密钥不致命:大屏请求会发,但 backend 必拒。开发期提前提示。
  // eslint-disable-next-line no-console
  console.warn('[app-request] 缺少 VITE_APP_SIGN_KEY,大屏签名接口将被拒绝');
}

/**
 * HMAC-SHA256 → hex
 *
 * 原用 WebCrypto(crypto.subtle),但它仅在安全上下文(https / localhost)可用;
 * 生产纯 HTTP 局域网部署下 crypto.subtle === undefined,签名拦截器抛错 → 请求发不出。
 * 改用纯 JS 的 js-sha256,不依赖安全上下文,与后端 Node createHmac 输出逐字节一致。
 * 密钥本就构建期内联进 bundle,安全模型不变。
 */
function hmacHex(message: string, key: string): string {
  return hmacSha256.hmac(key, message);
}

/**
 * 16 hex 随机 nonce
 */
function genNonce(): string {
  const arr = new Uint8Array(8);
  crypto.getRandomValues(arr);
  return Array.from(arr)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * 把 URL 规范化为 { path, sortedQuery }
 *  - path: 去掉 query,保持原始不归一化
 *  - sortedQuery: 原始 query 按 key 字典序排序,值不 decode,空 query 为空串
 *
 * 与 backend buildSortedQuery 逐字节一致(契约见 docs §3.3)。
 */
function splitUrl(url: string): { path: string; sortedQuery: string } {
  const qIdx = url.indexOf('?');
  const path = qIdx === -1 ? url : url.slice(0, qIdx);
  const rawQuery = qIdx === -1 ? '' : url.slice(qIdx + 1);
  if (!rawQuery) return { path, sortedQuery: '' };
  const pairs = rawQuery.split('&').map((kv) => {
    const i = kv.indexOf('=');
    return i === -1 ? [kv, ''] : [kv.slice(0, i), kv.slice(i + 1)];
  });
  pairs.sort((a, b) => {
    if (a[0] !== b[0]) {
      return a[0] < b[0] ? -1 : 1;
    }
    if (a[1] === b[1]) return 0;
    return a[1] < b[1] ? -1 : 1;
  });
  return {
    path,
    sortedQuery: pairs.map(([k, v]) => `${k}=${v}`).join('&')
  };
}

/**
 * 把 config.params 序列化拼进 config.url,并清空 params
 *
 * 为什么:axios 在请求拦截器之后(buildURL 阶段)才把 params 拼进 url。
 * 若不在签名前先拼好,签名覆盖的 url 不含 query,而实际发送的含 query,
 * backend 重算签名会不一致 → 签名失败。
 *
 * 序列化用 URLSearchParams(浏览器原生),值会被百分号编码;
 * backend buildSortedQuery 不 decode(契约 §3.3),两边都按原始编码串签名,逐字节一致。
 */
function mergeParamsIntoUrl(config: any): void {
  const { params } = config;
  if (params === undefined || params === null) return;
  const sp = new URLSearchParams();
  const append = (k: string, v: any) => {
    if (v === undefined || v === null) return;
    if (Array.isArray(v)) v.forEach((item) => sp.append(k, String(item)));
    else sp.append(k, String(v));
  };
  if (typeof params === 'object') {
    Object.entries(params).forEach(([k, v]) => append(k, v));
  }
  const qs = sp.toString();
  if (qs) {
    config.url = config.url + (config.url.includes('?') ? '&' : '?') + qs;
  }
  config.params = undefined;
}

/**
 * 给 axios config 加签名头。GET/无 body 场景,bodyCipherB64 段为空串。
 */
async function signConfig(config: any): Promise<any> {
  // 先把 params 拼进 url,保证签名覆盖的 url 与实际发送的逐字节一致
  mergeParamsIntoUrl(config);
  const method = (config.method || 'get').toUpperCase();
  // 签名用 config.url(相对路径,如 /api/service-data/screen?x=1)
  // 它与 backend req.url(去除 globalPrefix 前也是 /api/...?...)逐字节一致
  // 不用 baseURL:baseURL 是 origin,不含 path,且 backend req.url 不含 origin
  const urlForSign: string = config.url || '';
  const { path, sortedQuery } = splitUrl(urlForSign);
  const ts = String(Math.floor(Date.now() / 1000));
  const nonce = genNonce();
  const sign = hmacHex(
    [method, path, sortedQuery, ts, nonce, ''].join('\n'),
    SIGN_KEY
  );
  config.headers = config.headers || {};
  config.headers['X-App-Ts'] = ts;
  config.headers['X-App-Nonce'] = nonce;
  config.headers['X-App-Sign'] = sign;
  return config;
}

/**
 * 大屏独立 axios 实例
 * 不复用后台用的 request 单例,避免 Authorization 头污染。
 */
const appRequest = Axios.create({
  baseURL: '',
  timeoutErrorMessage: '网络出点小差，请稍等重试',
  responseType: 'json',
  withCredentials: false
});

appRequest.interceptors.request.use(
  (config) => signConfig(config),
  (e) => Promise.reject(e)
);

appRequest.interceptors.response.use(
  (res) => {
    const contentTypes = ProjectConfig.request.ignoreContentTypes;
    const contentType: string = res.headers['content-type'];
    if (contentTypes.some((item) => contentType.includes(item))) {
      return res;
    }
    // 后期响应加密时,在此先解密 base64 密文 → { code, message, data }
    return res.data;
  },
  (error) => Promise.reject(error)
);

export default appRequest;
