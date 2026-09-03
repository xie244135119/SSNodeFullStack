import { Module } from '@nestjs/common';
import { AppSignGuard } from './app-sign.guard';

/**
 * 大屏 API 签名模块
 * 导出 AppSignGuard,供大屏消费接口 @UseGuards(AppSignGuard) 使用。
 * ConfigService 全局可用,无需在此 import。
 */
@Module({
  providers: [AppSignGuard],
  exports: [AppSignGuard]
})
export class AppSignModule {}
