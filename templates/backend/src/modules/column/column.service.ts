import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ColumnItemEntity } from '../../entities/column-item.entity';
import { ColumnImageEntity } from '../../entities/column-image.entity';
import { COLUMN_HALLS, isHallKey } from './column-hall';

/** 设计稿输入(整列替换语义) */
export interface ColumnImageInput {
  id?: number;
  imageUrl: string;
  description?: string;
  time?: string;
  sort?: number;
}

/**
 * 栏目(区块)CRUD + 大屏消费
 * 返回纯数据,由全局 TransformInterceptor 统一包装。
 */
@Injectable()
export class ColumnService {
  constructor(
    @InjectRepository(ColumnItemEntity)
    private readonly itemRepo: Repository<ColumnItemEntity>,
    @InjectRepository(ColumnImageEntity)
    private readonly imageRepo: Repository<ColumnImageEntity>
  ) {}

  /** 允许排序字段白名单(防注入) */
  private static readonly SORT_FIELDS: Record<string, string> = {
    sort: 'i.sort',
    id: 'i.id',
    createTime: 'i.createTime',
    updateTime: 'i.updateTime'
  };

  /** 列表(后台,分页) */
  async list(params: {
    page?: number;
    pageSize?: number;
    keyword?: string;
    category?: string;
    orderBy?: string;
    order?: 'ASC' | 'DESC';
  }) {
    const page = Number(params.page) || 1;
    const pageSize = Number(params.pageSize) || 20;
    const qb = this.itemRepo
      .createQueryBuilder('i')
      .leftJoinAndSelect('i.images', 'img');
    if (params.category) {
      qb.andWhere('i.category = :cat', { cat: params.category });
    }
    if (params.keyword) {
      qb.andWhere('i.title LIKE :kw', { kw: `%${params.keyword}%` });
    }
    const orderDir = params.order?.toUpperCase() === 'DESC' ? 'DESC' : 'ASC';
    const orderField = ColumnService.SORT_FIELDS[params.orderBy || ''];
    if (orderField) {
      qb.orderBy(orderField, orderDir).addOrderBy('i.id', 'ASC');
    } else {
      qb.orderBy('i.sort', 'ASC').addOrderBy('i.id', 'ASC');
    }
    qb.skip((page - 1) * pageSize).take(pageSize);
    const [list, total] = await qb.getManyAndCount();
    // 图片按 sort 升序
    list.forEach((it) => it.images?.sort((a, b) => a.sort - b.sort));
    return { list, total, page, pageSize };
  }

  /** 大屏消费:按分组分组,仅 enabled,排序后返回 */
  async screenList() {
    const items = await this.itemRepo.find({
      where: { enabled: true },
      relations: ['images'],
      order: { sort: 'ASC', id: 'ASC' }
    });
    items.forEach((it) => it.images?.sort((a, b) => a.sort - b.sort));
    return COLUMN_HALLS.map((hall) => ({
      category: hall.key,
      name: hall.name,
      subtitle: hall.subtitle,
      items: items
        .filter((it) => it.category === hall.key)
        .map((it) => ({
          id: it.id,
          title: it.title,
          time: it.time,
          status: it.status,
          route: it.route,
          resolution: it.resolution,
          images: (it.images || []).map((im) => ({
            imageUrl: im.imageUrl,
            description: im.description,
            time: im.time,
            sort: im.sort
          }))
        }))
    })).filter((group) => group.items.length > 0);
  }

  /** 详情 */
  async detail(id: number) {
    const item = await this.itemRepo.findOne({
      where: { id },
      relations: ['images']
    });
    if (!item) {
      throw new NotFoundException('栏目不存在');
    }
    item.images?.sort((a, b) => a.sort - b.sort);
    return item;
  }

  /** 新增(含 images 内联) */
  async create(dto: {
    category: string;
    title: string;
    time?: string;
    status?: string;
    route?: string | null;
    resolution?: string | null;
    sort?: number;
    enabled?: boolean;
    images?: ColumnImageInput[];
  }) {
    if (!isHallKey(dto.category)) {
      throw new BadRequestException(`未知分组 key: ${dto.category}`);
    }
    const entity = this.itemRepo.create({
      category: dto.category,
      title: dto.title,
      time: dto.time || '',
      status: dto.status || 'designing',
      route: dto.route ?? null,
      resolution: dto.resolution ?? null,
      sort: dto.sort ?? 0,
      enabled: dto.enabled ?? true
    });
    const saved = await this.itemRepo.save(entity);
    if (dto.images?.length) {
      await this.saveImages(saved.id, dto.images);
    }
    return this.detail(saved.id);
  }

  /** 修改(字段 + images 整列替换,若提供 images) */
  async update(
    id: number,
    dto: Partial<{
      category: string;
      title: string;
      time: string;
      status: string;
      route: string | null;
      resolution: string | null;
      sort: number;
      enabled: boolean;
      images: ColumnImageInput[];
    }>
  ) {
    const item = await this.itemRepo.findOne({ where: { id } });
    if (!item) {
      throw new NotFoundException('栏目不存在');
    }
    if (dto.category !== undefined && !isHallKey(dto.category)) {
      throw new BadRequestException(`未知分组 key: ${dto.category}`);
    }
    const { images, ...fields } = dto;
    Object.assign(item, {
      ...(fields.category !== undefined && { category: fields.category }),
      ...(fields.title !== undefined && { title: fields.title }),
      ...(fields.time !== undefined && { time: fields.time }),
      ...(fields.status !== undefined && { status: fields.status }),
      ...(fields.route !== undefined && { route: fields.route }),
      ...(fields.resolution !== undefined && { resolution: fields.resolution }),
      ...(fields.sort !== undefined && { sort: fields.sort }),
      ...(fields.enabled !== undefined && { enabled: fields.enabled })
    });
    await this.itemRepo.save(item);
    if (images !== undefined) {
      // 整列替换:删旧图 + 按新数组重建
      await this.imageRepo.delete({ itemId: id });
      if (images.length) {
        await this.saveImages(id, images);
      }
    }
    return this.detail(id);
  }

  /** 删除(显式删 images + item,DB FK 亦有 CASCADE 兜底) */
  async remove(id: number) {
    const item = await this.itemRepo.findOne({ where: { id } });
    if (!item) {
      throw new NotFoundException('栏目不存在');
    }
    await this.imageRepo.delete({ itemId: id });
    await this.itemRepo.remove(item);
    return true;
  }

  /** 批量保存图片(整列,按 index 兜底 sort) */
  private async saveImages(itemId: number, images: ColumnImageInput[]) {
    const entities = images.map((im, idx) =>
      this.imageRepo.create({
        itemId,
        imageUrl: im.imageUrl || '',
        description: im.description || '',
        time: im.time || '',
        sort: im.sort ?? idx
      })
    );
    await this.imageRepo.save(entities);
  }
}
