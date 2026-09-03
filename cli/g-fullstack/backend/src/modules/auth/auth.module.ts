import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { PassportModule } from '@nestjs/passport';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { CaptchaService } from './captcha.service';
import { JwtStrategy } from './jwt.strategy';
import { JwtAuthGuard } from './jwt-auth.guard';
import { AuditModule } from '../audit/audit.module';
import { UserEntity } from '../../entities/user.entity';
import type { AppConfig } from '../../config/config.interface';

@Module({
  imports: [
    PassportModule,
    TypeOrmModule.forFeature([UserEntity]),
    AuditModule,
    JwtModule.registerAsync({
      global: true,
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService<AppConfig>) => ({
        secret: config.get<AppConfig['jwt']>('jwt').secret,
        signOptions: { expiresIn: config.get<AppConfig['jwt']>('jwt').expiresIn as any }
      })
    })
  ],
  controllers: [AuthController],
  providers: [AuthService, CaptchaService, JwtStrategy, JwtAuthGuard],
  exports: [AuthService, CaptchaService, JwtAuthGuard]
})
export class AuthModule {}
