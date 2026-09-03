import { Injectable, UnauthorizedException } from '@nestjs/common';
import * as svgCaptcha from 'svg-captcha';

/**
 * 验证码服务
 * - 生成 SVG 图片验证码 + captchaId
 * - 服务端内存保存 captchaId -> 文本(用于演示环境,生产可上 redis)
 */
@Injectable()
export class CaptchaService {
  // captchaId -> text,5 分钟过期
  private store = new Map<string, { text: string; expire: number }>();
  private readonly ttl = 5 * 60 * 1000;

  /** 生成验证码 { captchaId, svg } */
  generate(): { captchaId: string; svg: string } {
    const cap = svgCaptcha.createMathExpr({
      size: 4,
      noise: 2,
      color: true,
      background: '#f8fafc'
    });
    const captchaId = this.randId();
    this.store.set(captchaId, {
      text: String(cap.text).toLowerCase(),
      expire: Date.now() + this.ttl
    });
    // 顺手清理过期
    this.gc();
    return { captchaId, svg: cap.data };
  }

  /** 校验 captchaId + 用户输入文本 */
  verify(captchaId: string, input: string): boolean {
    if (!captchaId || !input) return false;
    const entry = this.store.get(captchaId);
    if (!entry) return false;
    // 一次性:取出即删
    this.store.delete(captchaId);
    if (Date.now() > entry.expire) return false;
    return entry.text === input.toLowerCase();
  }

  private randId() {
    return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
  }

  private gc() {
    const now = Date.now();
    for (const [k, v] of this.store) {
      if (v.expire < now) this.store.delete(k);
    }
  }
}
