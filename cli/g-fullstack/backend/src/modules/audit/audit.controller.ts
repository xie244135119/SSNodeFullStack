import { Controller, Get, Query, UseGuards, Request, ForbiddenException } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { AuditService } from './audit.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@ApiTags('audit 审计日志'
)
@Controller('audit')
export class AuditController {
  constructor(private readonly auditService: AuditService) {}

  /** 只读审计列表 GET /api/audit/list?page=&size=&actorName=&action= */
  @UseGuards(JwtAuthGuard)
  @Get('list')
  list(
    @Query() query: { page?: string; size?: string; actorName?: string; action?: string },
    @Request() req: any
  ) {
    if (req.user?.role !== 'admin' && req.user?.role !== 'superadmin') {
      throw new ForbiddenException('仅管理员可查看审计日志');
    }
    return this.auditService.list({
      page: Number(query.page) || 1,
      size: Number(query.size) || 20,
      actorName: query.actorName,
      action: query.action
    });
  }
}
