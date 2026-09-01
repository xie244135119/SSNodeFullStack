import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn
} from 'typeorm';
import { ColumnItemEntity } from './column-item.entity';

/**
 * 设计稿图片实体
 * 隶属某栏目(一对多),imageUrl 走 upload 模块返回的 URL。
 */
@Entity('column_image')
export class ColumnImageEntity {
  @PrimaryGeneratedColumn()
  id: number;

  /** 所属栏目 id(FK → column_item.id,ON DELETE CASCADE) */
  @Column({ name: 'itemId' })
  itemId: number;

  /** 设计稿图片 URL(upload 返回) */
  @Column({ default: '' })
  imageUrl: string;

  /** 该版描述 */
  @Column({ default: '' })
  description: string;

  /** 该版时间 YYYY-MM-DD */
  @Column({ default: '' })
  time: string;

  /** 区块内排序 */
  @Column({ default: 0 })
  sort: number;

  @ManyToOne(() => ColumnItemEntity, (item) => item.images, {
    onDelete: 'CASCADE'
  })
  @JoinColumn({ name: 'itemId' })
  item: ColumnItemEntity;

  @CreateDateColumn()
  createTime: Date;

  @UpdateDateColumn()
  updateTime: Date;
}
