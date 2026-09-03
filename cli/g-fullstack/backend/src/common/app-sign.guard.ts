import {
  Injectable,
  ExecutionContext,
  UnauthorizedException,
  Logger
} from '@nestjs/common';
import type { Request } from 'express';
import { ConfigService } from '@nestjs/config';
import type { AppConfig } from '../config/config.interface';
import { NonceStore, signRequest, safeEqualHex, buildSortedQuery } from './app-crypto';

/**
 * 大屏 API 签名守卫(无 token、无过期)
 *
 * 协议见 docs/api-security.md。本期(请求侧签名)校验:
 *  1. 时间戳偏差 ≤ tsWindow
 *  2. nonce 未重放(内存 LRU + TTL)
 *  3. HMAC-SHA256 签名匹配
 *
 * 仅给大屏消费的公开 GET 接口用(/power-history/screen、/service-data/screen),
 * 与 JwtAuthGuard 并列互斥(后台接口继续用 JWT)。
 *
 * 期望请求头:
 *  - X-App-Ts:    Unix 秒
 *  - X-App-Nonce: 16 hex 随机
 *  - X-App-Sign:  HMAC-SHA256(method\npath\nsortedQuery\nts\nnonce\nbodyCipherB64, signKey) hex
 *  GET 无请求 body,bodyCipherB64 段为空串。
 *
 * nonce 存储为模块级单例(Nest DI 单例),进程内共享。
 */
@Injectable()
export class AppSignGuard {
  private readonly logger = new Logger('AppSignGuard');
  private readonly signKey: string;
  private readonly tsWindow: number;
  private readonly nonceStore: NonceStore;

  constructor(config: ConfigService<AppConfig, true>) {
    const s = config.get<AppConfig['appSign']>('appSign');
    this.signKey = s.signKey;
    this.tsWindow = s.tsWindow;
    this.nonceStore = new NonceStore(10000, s.tsWindow * 1000);
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request & {
      // 原始 query 字符串,express 提供
      // (req.query 已被解析,但签名要求原始编码串,故优先用 req.url 切出的原始 query)
      originalUrl?: string;
    }>();

    const ts = (req.headers['x-app-ts'] as string) ?? '';
    const nonce = (req.headers['x-app-nonce'] as string) ?? '';
    const sign = (req.headers['x-app-sign'] as string) ?? '';

    if (!ts || !nonce || !sign) {
      throw new UnauthorizedException('缺少大屏签名头');
    }

    // 1. 时间戳窗口校验
    const tsNum = Number(ts);
    if (!Number.isFinite(tsNum) || tsNum <= 0) {
      throw new UnauthorizedException('时间戳非法');
    }
    const nowSec = Math.floor(Date.now() / 1000);
    if (Math.abs(nowSec - tsNum) > this.tsWindow) {
      throw new UnauthorizedException('请求已过期');
    }

    // 2. nonce 去重(签名校验通过后再记录,避免无效请求污染存储)
    //    这里先不写,第 3 步通过后写

    // 3. 签名比对
    //    path: 用 req.url 去掉 query 的部分,保持原始路径不归一化
    //    sortedQuery: 从原始 url 切出 query 串,不 decode
    const { path, sortedQuery } = splitUrl(req.originalUrl || req.url || '');
    const expected = signRequest(
      {
        method: req.method.toUpperCase(),
        path,
        sortedQuery,
        ts,
        nonce,
        bodyCipherB64: '' // GET 无请求 body 加密,后期 POST/PUT 才有
      },
      this.signKey
    );

    if (!safeEqualHex(expected, sign.toLowerCase())) {
      this.logger.warn(
        `签名校验失败 ${req.method} ${req.url} nonce=${nonce}`
      );
      throw new UnauthorizedException('签名错误');
    }

    // 4. 签名通过,记录 nonce(防后续重放)
    if (this.nonceStore.seen(nonce)) {
      throw new UnauthorizedException('重复请求');
    }

    return true;
  }
}

/**
 * 从原始 URL 切出 path 与规范化前的 sortedQuery
 *  - originalUrl 形如 /api/power-history/screen?x=1&y=2
 *  - path 取 ? 之前部分,不归一化
 *  - sortedQuery 传给 buildSortedQuery(支持 ? 前缀,内部会去掉)
 */
function splitUrl(originalUrl: string): { path: string; sortedQuery: string } {
  const qIdx = originalUrl.indexOf('?');
  const path = qIdx === -1 ? originalUrl : originalUrl.slice(0, qIdx);
  const rawQuery = qIdx === -1 ? '' : originalUrl.slice(qIdx + 1);
  return { path, sortedQuery: buildSortedQuery(rawQuery) };
}
