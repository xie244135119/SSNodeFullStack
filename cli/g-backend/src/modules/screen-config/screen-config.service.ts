import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ScreenConfigEntity } from '../../entities/screen-config.entity';

/**
 * 大屏清单配置
 * 返回纯数据,由全局 TransformInterceptor 统一包装
 */
@Injectable()
export class ScreenConfigService {
  constructor(
    @InjectRepository(ScreenConfigEntity)
    private readonly repo: Repository<ScreenConfigEntity>
  ) {}

  /** 大屏清单 /api/screen/list */
  async list() {
    return this.repo.find({
      where: { enabled: true },
      order: { sort: 'ASC' }
    });
  }

  /** 更新大屏配置 */
  async update(key: string, dto: Partial<ScreenConfigEntity>) {
    await this.repo.update({ key }, dto);
    return true;
  }
}
