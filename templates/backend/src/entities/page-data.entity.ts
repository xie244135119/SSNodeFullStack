import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index
} from 'typeorm';

/**
 * 大屏页面配置数据实体
 * 后台配置台产出的核心:每套大屏页面的配置内容
 */
@Entity('page_data')
export class PageDataEntity {
  @PrimaryGeneratedColumn()
  id: number;

  /** 关联的大屏 key */
  @Index()
  @Column()
  screenKey: string;

  /** 页面区块标识(同屏多区块时区分) */
  @Column({ default: '' })
  section: string;

  /** 配置内容 JSON */
  @Column({ type: 'text', default: '{}' })
  content: string;

  /** 配置人 */
  @Column({ default: '' })
  updatedBy: string;

  /** 是否启用 */
  @Column({ default: true })
  enabled: boolean;

  @CreateDateColumn()
  createTime: Date;

  @UpdateDateColumn()
  updateTime: Date;
}
