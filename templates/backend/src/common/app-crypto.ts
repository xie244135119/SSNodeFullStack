import * as crypto from 'crypto';

/**
 * 大屏 API 安全:签名工具 + nonce 去重
 *
 * 协议见 docs/api-security.md。本期(请求侧签名)只用到:
 *  - signRequest(method, path, sortedQuery, ts, nonce, bodyCipherB64) → HMAC-SHA256 hex
 *  - NonceStore(内存 LRU + TTL,防重放)
 *
 * 后期(响应加密/请求 body 加密)的 AES-GCM 函数已预留但不调用。
 * 后端用 Node 原生 crypto;前端对应实现须纯 JS(禁用 crypto.subtle — 生产纯 HTTP
 * 不安全上下文下不可用,见 docs §2.2/§5.4)。
 *
 * 签名串格式(6 段,\n 分隔):
 *   METHOD\nPATH\nSORTED_QUERY\nTS\nNONCE\nBODY_CIPHER_B64
 * GET 场景 body 段传空串。
 *
 * 规范化契约(逐字节两边必须一致,见 docs §3.3):
 *  - METHOD 大写原值
 *  - PATH 原始 path,不归一化
 *  - SORTED_QUERY 原始 query 按 key 字典序排序后用 & 连,值不 decode,空 query 为空串
 *  - TS/ NONCE 字符串
 *  - BODY_CIPHER_B64 base64(GET 为空串)
 */

export interface SignParams {
  method: string;
  path: string;
  sortedQuery: string;
  ts: string;
  nonce: string;
  bodyCipherB64?: string;
}

/**
 * 计算 HMAC-SHA256 签名,返回 hex
 * @param signKey HMAC 密钥(yaml appSign.signKey)
 */
export function signRequest(params: SignParams, signKey: string): string {
  const { method, path, sortedQuery, ts, nonce, bodyCipherB64 } = params;
  const body = bodyCipherB64 ?? '';
  const payload = [method, path, sortedQuery, ts, nonce, body].join('\n');
  return crypto.createHmac('sha256', signKey).update(payload, 'utf8').digest('hex');
}

/**
 * 常量时间比较两个 hex 签名,防时序攻击
 */
export function safeEqualHex(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'hex');
  const bufB = Buffer.from(b, 'hex');
  if (bufA.length !== bufB.length || bufA.length === 0) {
    return false;
  }
  return crypto.timingSafeEqual(bufA, bufB);
}

/**
 * 把原始 query 字符串规范化为签名用 sortedQuery
 *  - key 字典序升序
 *  - 值保持百分号编码原样不 decode
 *  - 空 query / 空字符串 → 空串
 *  - 重复 key 按出现顺序保留(契约允许,签名覆盖即可)
 *
 * 输入可以是 express 的 req.query(对象)或原始 ?a=1&b=2 串。
 */
export function buildSortedQuery(query: any): string {
  if (!query) return '';
  let pairs: Array<[string, string]>;
  if (typeof query === 'string') {
    const s = query.startsWith('?') ? query.slice(1) : query;
    if (!s) return '';
    pairs = s.split('&').map((kv) => {
      const i = kv.indexOf('=');
      return i === -1 ? [kv, ''] : [kv.slice(0, i), kv.slice(i + 1)];
    });
  } else if (typeof query === 'object') {
    // express req.query: 重复 key → 数组/传入预解析对象
    pairs = [];
    for (const [k, v] of Object.entries(query)) {
      if (Array.isArray(v)) {
        for (const item of v) pairs.push([k, String(item)]);
      } else {
        pairs.push([k, String(v)]);
      }
    }
  } else {
    return '';
  }
  // 字典序:按 key 比较,key 相同则按 value 比较(稳定)
  pairs.sort((a, b) =>
    a[0] === b[0] ? (a[1] < b[1] ? -1 : a[1] > b[1] ? 1 : 0) : a[0] < b[0] ? -1 : 1
  );
  return pairs.map(([k, v]) => `${k}=${v}`).join('&');
}

/**
 * nonce 内存去重存储(LRU + TTL)
 *
 * - 单实例进程内即可,重启丢失可接受(窗口仅 5min,攻击者要重放必须在窗口内且 nonce 已被记)
 * - 将来多实例换 Redis SETNX + EX
 *
 * 用 Map 维持插入顺序做简易 LRU:达到容量上限淘汰最旧;get 命中时删后重插(LRU touch)。
 */
export class NonceStore {
  private store = new Map<string, number>();
  private readonly capacity: number;
  private readonly ttlMs: number;
  private sweepTimer: NodeJS.Timeout | null = null;

  constructor(capacity = 10000, ttlMs = 5 * 60 * 1000) {
    this.capacity = capacity;
    this.ttlMs = ttlMs;
    // 每 ttl/2 清一次过期,避免 Map 无限增长
    this.sweepTimer = setInterval(() => this.sweep(), Math.max(1000, Math.floor(ttlMs / 2)));
    // 不阻止进程退出
    if (this.sweepTimer.unref) this.sweepTimer.unref();
  }

  /**
   * 检查并记录 nonce。存在或已过期重放 → false,首次 → true。
   */
  has(nonce: string): boolean {
    const now = Date.now();
    const exp = this.store.get(nonce);
    if (exp !== undefined) {
      if (now < exp) return true; // 仍在窗口内 → 重放
      // 已过期,删之,视同不存在
      this.store.delete(nonce);
    }
    return false;
  }

  /**
   * 写入 nonce(签名校验通过后调用)
   */
  set(nonce: string): void {
    if (this.store.size >= this.capacity) {
      // 淘汰最旧(LRU)
      const oldest = this.store.keys().next().value;
      if (oldest !== undefined) this.store.delete(oldest);
    }
    this.store.set(nonce, Date.now() + this.ttlMs);
  }

  /**
   * 便捷:has 为 true 则拒绝;否则 set 返回 false(未占用)
   * @returns true=已被占用(重放,应拒绝) false=可用
   */
  seen(nonce: string): boolean {
    if (this.has(nonce)) return true;
    this.set(nonce);
    return false;
  }

  /**
   * 清除过期项
   */
  sweep(): void {
    const now = Date.now();
    for (const [k, exp] of this.store) {
      if (now >= exp) this.store.delete(k);
    }
  }

  dispose(): void {
    if (this.sweepTimer) {
      clearInterval(this.sweepTimer);
      this.sweepTimer = null;
    }
    this.store.clear();
  }
}

/* ----------------------------- 后期(预留) ----------------------------- */
// AES-256-GCM 加解密,本期不调用,后期响应加密/请求 body 加密时启用。

export function aesGcmEncrypt(plaintext: Buffer, cryptKey: string, iv?: Buffer): {
  ciphertext: Buffer;
  iv: Buffer;
  authTag: Buffer;
} {
  const key = Buffer.from(cryptKey, 'base64');
  const gcmIv = iv ?? crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, gcmIv);
  const enc = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  return { ciphertext: enc, iv: gcmIv, authTag: cipher.getAuthTag() };
}

export function aesGcmDecrypt(ciphertext: Buffer, cryptKey: string, iv: Buffer, authTag: Buffer): Buffer {
  const key = Buffer.from(cryptKey, 'base64');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}
