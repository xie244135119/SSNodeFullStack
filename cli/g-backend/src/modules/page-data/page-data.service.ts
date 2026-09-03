import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PageDataEntity } from '../../entities/page-data.entity';

/**
 * 大屏页面配置数据 CRUD
 * 返回纯数据,由全局 TransformInterceptor 统一包装
 */
@Injectable()
export class PageDataService {
  constructor(
    @InjectRepository(PageDataEntity)
    private readonly repo: Repository<PageDataEntity>
  ) {}

  /** 列表 /api/getList */
  async getList(params: { screenKey?: string; page?: number; pageSize?: number }) {
    const page = Number(params.page) || 1;
    const pageSize = Number(params.pageSize) || 10;
    const where: any = {};
    if (params.screenKey) where.screenKey = params.screenKey;
    const [list, total] = await this.repo.findAndCount({
      where,
      order: { updateTime: 'DESC' },
      skip: (page - 1) * pageSize,
      take: pageSize
    });
    return { list, total };
  }

  /** 新增 /api/add */
  async add(params: any, user?: { username?: string }) {
    const entity = this.repo.create({
      screenKey: params.screenKey,
      section: params.section || '',
      content: typeof params.content === 'string' ? params.content : JSON.stringify(params.content || {}),
      updatedBy: user?.username || ''
    });
    return this.repo.save(entity);
  }

  /** 修改 /api/edit */
  async update(params: any) {
    if (!params.id) {
      throw new Error('缺少 id');
    }
    await this.repo.update(params.id, {
      screenKey: params.screenKey,
      section: params.section,
      content: typeof params.content === 'string' ? params.content : JSON.stringify(params.content || {})
    });
    return true;
  }

  /** 删除 /api/deleteById */
  async deleteById(id: number) {
    await this.repo.delete(id);
    return true;
  }
}
