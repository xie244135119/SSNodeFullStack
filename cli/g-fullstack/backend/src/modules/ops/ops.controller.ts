import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { OpsService } from './ops.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

/**
 * 运维监控接口（后台 JWT 鉴权，不进大屏）。
 *
 * 安全边界：全部只读，无任何写入 / 触发 / 删除接口。
 *   - GET /api/ops/overview  聚合所有探针（前端首屏）
 *   - GET /api/ops/probe/:key 单探针刷新（前端点"刷新"按钮）
 *
 * 新增探针不改本 controller（OpsService 多 provider 自动发现）。
 */
@ApiTags('ops 运维监控')
@Controller('ops')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class OpsController {
  constructor(private readonly service: OpsService) {}

  /** /api/ops/overview —— 聚合所有探针状态 */
  @Get('overview')
  overview() {
    return this.service.overview();
  }

  /** /api/ops/probe/:key —— 单探针刷新 */
  @Get('probe/:key')
  one(@Param('key') key: string) {
    return this.service.one(key);
  }
}
