import { Injectable, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModuleOptions, ThrottlerStorage } from '@nestjs/throttler';
import { ConfigService } from '@nestjs/config';
import type { AppConfig } from '../config/config.interface';

/**
 * 限流守卫:按 IP 限流,白名单路径(登录/验证码/islogin)放行
 * 默认每分钟 60 次(见 yaml throttle)
 *
 * 构造函数参数顺序必须与 ThrottlerGuard 一致(options, storage, reflector),
 * ConfigService 通过私有属性方式访问。
 */
@Injectable()
export class AppThrottlerGuard extends ThrottlerGuard {
  constructor(
    options: ThrottlerModuleOptions,
    storageService: ThrottlerStorage,
    reflector: Reflector,
    private readonly config: ConfigService<AppConfig, true>
  ) {
    super(options, storageService, reflector);
  }

  /**
   * 白名单路径直接放行
   */
  protected async shouldSkip(_context: ExecutionContext): Promise<boolean> {
    const req = _context.switchToHttp().getRequest();
    const url: string = req?.url || '';
    const whitelist = this.config.get<AppConfig['throttle']>('throttle').whitelist;
    return whitelist.some((p) => url.startsWith(p));
  }

  /**
   * 取客户端 IP(优先 x-forwarded-for)
   */
  protected async getTracker(req: Record<string, any>): Promise<string> {
    const xff = req.headers['x-forwarded-for'];
    if (xff) {
      return String(xff).split(',')[0].trim();
    }
    return req.ip || req.connection?.remoteAddress || 'unknown';
  }
}
