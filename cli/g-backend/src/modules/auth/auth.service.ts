import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcryptjs';
import { UserEntity } from '../../entities/user.entity';
import { CaptchaService } from './captcha.service';
import { AuditService } from '../audit/audit.service';
import type { AppConfig } from '../../config/config.interface';

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(UserEntity)
    private readonly userRepo: Repository<UserEntity>,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService<AppConfig>,
    private readonly captchaService: CaptchaService,
    private readonly auditService: AuditService
  ) {}

  /**
   * 密码登录 /api/login
   * 入参含验证码 captchaId + verifycode,服务端先校验验证码
   * 返回纯 token,由全局 TransformInterceptor 统一包装
   */
  async login(
    params: {
      username: string;
      password: string;
      captchaId: string;
      verifycode: string;
    },
    ip?: string
  ) {
    // 验证码校验
    if (!this.captchaService.verify(params.captchaId, params.verifycode)) {
      await this.auditService.record({
        actorName: params.username || 'unknown',
        action: 'login_fail',
        detail: { reason: '验证码错误或已过期' },
        ip
      });
      throw new UnauthorizedException('验证码错误或已过期');
    }
    const user = await this.userRepo.findOne({
      where: { username: params.username }
    });
    if (!user) {
      await this.auditService.record({
        actorName: params.username,
        action: 'login_fail',
        detail: { reason: '用户不存在' },
        ip
      });
      throw new UnauthorizedException('用户名或密码错误');
    }
    const ok = user.password.startsWith('$2')
      ? await bcrypt.compare(params.password, user.password)
      : params.password === user.password;
    if (!ok) {
      await this.auditService.record({
        actorName: params.username,
        action: 'login_fail',
        detail: { reason: '密码错误' },
        ip
      });
      throw new UnauthorizedException('用户名或密码错误');
    }
    if (user.status !== '1') {
      await this.auditService.record({
        actorName: params.username,
        action: 'login_fail',
        detail: { reason: '账号已禁用' },
        ip
      });
      throw new UnauthorizedException('账号已禁用');
    }
    const payload = { sub: user.id, username: user.username, role: user.role };
    await this.auditService.record({
      actorName: user.username,
      action: 'login_success',
      detail: { role: user.role },
      ip
    });
    return this.jwtService.sign(payload);
  }

  /**
   * 单点登录 /api/ssologin
   */
  async ssoLogin(params: { [key: string]: any }, ip?: string) {
    if (!params || Object.keys(params).length === 0) {
      await this.auditService.record({
        actorName: params?.username || 'sso',
        action: 'login_fail',
        detail: { reason: '缺少 sso 参数' },
        ip
      });
      throw new UnauthorizedException('缺少 sso 参数');
    }
    const username = params.username || 'sso';
    await this.auditService.record({
      actorName: username,
      action: 'login_success',
      detail: { sso: true, params: Object.keys(params) },
      ip
    });
    const payload = { sub: 0, username, role: 'web' };
    return this.jwtService.sign(payload);
  }

  /**
   * 哈希明文密码(供 seed 用)
   */
  hashPassword(plain: string) {
    return bcrypt.hashSync(plain, 10);
  }
}
