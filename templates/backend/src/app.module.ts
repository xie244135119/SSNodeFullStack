import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { TypeOrmModule } from '@nestjs/typeorm';
import configuration from './config/configuration';
import type { AppConfig } from './config/config.interface';
import { buildTypeOrmOptions } from './database/sqlite.config';
import { ScreenConfigEntity } from './entities/screen-config.entity';
import { PageDataEntity } from './entities/page-data.entity';
import { UserEntity } from './entities/user.entity';
import { ImageEntity } from './entities/image.entity';

import { AllExceptionsFilter } from './common/all-exceptions.filter';
import { TransformInterceptor } from './common/transform.interceptor';
import { AppThrottlerGuard } from './common/throttle.guard';
import { AppSignModule } from './common/app-sign.module';

import { AuthModule } from './modules/auth/auth.module';
import { UserModule } from './modules/user/user.module';
import { ScreenConfigModule } from './modules/screen-config/screen-config.module';
import { PageDataModule } from './modules/page-data/page-data.module';
import { WebsocketModule } from './modules/websocket/websocket.module';
import { UploadModule } from './modules/upload/upload.module';
import { ImageModule } from './modules/image/image.module';
import { AuditModule } from './modules/audit/audit.module';
import { OpsModule } from './modules/ops/ops.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration]
    }),
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<AppConfig, true>) => {
        const t = config.get<AppConfig['throttle']>('throttle');
        return [
          {
            name: 'default',
            limit: t.limit,
            ttl: t.ttl * 1000, // ms
            skipIf: () => false
          }
        ];
      }
    }),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: buildTypeOrmOptions
    }),
    TypeOrmModule.forFeature([
      ScreenConfigEntity,
      PageDataEntity,
      UserEntity,
      ImageEntity
    ]),
    AuthModule,
    UserModule,
    ScreenConfigModule,
    PageDataModule,
    WebsocketModule,
    UploadModule,
    ImageModule,
    AuditModule,
    OpsModule,
    // 大屏 API 签名(供 /screen 接口 @UseGuards(AppSignGuard))
    AppSignModule
  ],
  providers: [
    // 统一异常过滤器
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
    // 统一响应拦截器
    { provide: APP_INTERCEPTOR, useClass: TransformInterceptor },
    // 限流守卫
    { provide: APP_GUARD, useClass: AppThrottlerGuard }
  ]
})
export class AppModule {}
