import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import type { AppConfig } from '../../config/config.interface';

/**
 * JWT 解析策略
 * 期望请求头 Authorization: Bearer <token>
 */
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(config: ConfigService<AppConfig>) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.get<AppConfig['jwt']>('jwt').secret
    });
  }

  validate(payload: { sub: number; username: string; role: string }) {
    return {
      id: payload.sub,
      username: payload.username,
      role: payload.role
    };
  }
}
