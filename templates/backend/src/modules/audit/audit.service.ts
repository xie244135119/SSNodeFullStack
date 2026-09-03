import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, FindOptionsWhere } from 'typeorm';
import { AuditLogEntity } from '../../entities/audit-log.entity';

/**
 * 审计日志服务:提供 record() 供业务侧埋点,list() 给后台只读查询
 */
@Injectable()
export class AuditService {
  constructor(
    @InjectRepository(AuditLogEntity)
    private readonly auditRepo: Repository<AuditLogEntity>
  ) {}

  /** 记录一条审计日志(吞异常,不阻塞业务) */
  async record(entry: {
    actorName: string;
    action: string;
    detail?: Record<string, any>;
    ip?: string;
  }) {
    try {
      await this.auditRepo.save({
        actorName: entry.actorName,
        action: entry.action,
        detail: entry.detail ? JSON.stringify(entry.detail) : '',
        ip: entry.ip || ''
      });
    } catch {
      // 审计失败不影响主流程
    }
  }

  /** 只读查询(分页 + 按操作者/动作筛选) */
  async list(params: {
    page: number;
    size: number;
    actorName?: string;
    action?: string;
  }) {
    const where: FindOptionsWhere<AuditLogEntity> = {};
    if (params.actorName) where.actorName = params.actorName;
    if (params.action) where.action = params.action;
    const [items, total] = await this.auditRepo.findAndCount({
      where,
      order: { id: 'DESC' },
      skip: (params.page - 1) * params.size,
      take: params.size
    });
    return { list: items, total };
  }
}
