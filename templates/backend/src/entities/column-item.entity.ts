import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany
} from 'typeorm';
import { ColumnImageEntity } from './column-image.entity';

/**
 * 栏目(区块)实体
 * 隶属某分组(category 存定死枚举 key),含多版设计稿图片(images 一对多)。
 */
@Entity('column_item')
export class ColumnItemEntity {
  @PrimaryGeneratedColumn()
  id: number;

  /** 分组 key(定死枚举,见 column-hall.ts) */
  @Column()
  category: string;

  /** 区块标题 */
  @Column()
  title: string;

  /** 代表时间 YYYY-MM-DD */
  @Column({ default: '' })
  time: string;

  /** 状态:designing(设计中)/confirming(设计确认中)/done(设计完成) */
  @Column({ default: 'designing' })
  status: string;

  /** 「进入」跳转路由,预留 */
  @Column({ nullable: true })
  route: string | null;

  /** 目标大屏分辨率(非必填,如 1920×1080),仅展示用 */
  @Column({ nullable: true })
  resolution: string | null;

  /** 分组内排序 */
  @Column({ default: 0 })
  sort: number;

  /** 是否启用(上架) */
  @Column({ default: true })
  enabled: boolean;

  /** 设计稿图片(一对多,CASCADE) */
  @OneToMany(() => ColumnImageEntity, (image) => image.item, {
    cascade: true
  })
  images: ColumnImageEntity[];

  @CreateDateColumn()
  createTime: Date;

  @UpdateDateColumn()
  updateTime: Date;
}
