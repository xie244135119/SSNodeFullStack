import { Injectable, Inject, forwardRef } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ImageEntity } from '../../entities/image.entity';
import { UploadService } from '../upload/upload.service';
import { AuditService } from '../audit/audit.service';

/**
 * 图片记录 CRUD
 * 上传走 upload 模块(前端先调 /api/upload 拿 url,再 POST /api/image/add 登记)。
 * 删除时同步删物理文件(UploadService.delete 按 url 反查)。
 * 返回纯数据,由全局 TransformInterceptor 统一包装。
 */
@Injectable()
export class ImageService {
  constructor(
    @InjectRepository(ImageEntity)
    private readonly repo: Repository<ImageEntity>,
    @Inject(forwardRef(() => UploadService))
    private readonly uploadService: UploadService,
    private readonly auditService: AuditService
  ) {}

  /** 列表 /api/image/getList */
  async getList(params: { name?: string; page?: string | number; pageSize?: string | number }) {
    const page = Number(params.page) || 1;
    const pageSize = Number(params.pageSize) || 12;
    const qb = this.repo.createQueryBuilder('image');
    if (params.name) {
      qb.andWhere('image.name LIKE :kw', { kw: `%${params.name}%` });
    }
    qb.orderBy('image.updateTime', 'DESC')
      .skip((page - 1) * pageSize)
      .take(pageSize);
    const [list, total] = await qb.getManyAndCount();
    return { list, total };
  }

  /** 新增登记 /api/image/add(前端上传完成后调用) */
  async add(params: { name: string; url: string; size?: number }, operator: { username: string }) {
    if (!params.name || !params.url) {
      throw new Error('缺少 name 或 url');
    }
    const saved = await this.repo.save(
      this.repo.create({
        name: params.name,
        url: params.url,
        size: Number(params.size) || 0
      })
    );
    await this.auditService.record({
      actorName: operator.username,
      action: 'image_add',
      detail: { id: saved.id, name: saved.name, url: saved.url }
    });
    return saved;
  }

  /** 改名 /api/image/edit */
  async update(params: { id: number; name: string }, operator: { username: string }) {
    if (!params.id || !params.name) {
      throw new Error('缺少 id 或 name');
    }
    await this.repo.update(params.id, { name: params.name });
    await this.auditService.record({
      actorName: operator.username,
      action: 'image_rename',
      detail: { id: params.id, name: params.name }
    });
    return true;
  }

  /** 删除 /api/image/deleteById(记录 + 物理文件) */
  async deleteById(id: number, operator: { username: string }) {
    const target = await this.repo.findOne({ where: { id } });
    if (!target) throw new Error('图片记录不存在');
    await this.repo.delete(id);
    // 物理文件尽力删(不存在/非本目录静默跳过,UploadService.delete 内部处理)
    this.uploadService.delete(target.url);
    await this.auditService.record({
      actorName: operator.username,
      action: 'image_delete',
      detail: { id, name: target.name, url: target.url }
    });
    return true;
  }
}
