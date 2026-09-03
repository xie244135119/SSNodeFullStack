import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn
} from 'typeorm';

/**
 * 大屏清单实体
 * 对应前端 web/config/screen.config.ts 的 ScreenList
 * 大屏的 key/name/path/分辨率,真相源迁到 DB
 */
@Entity('screen_config')
export class ScreenConfigEntity {
  @PrimaryGeneratedColumn()
  id: number;

  /** 唯一标识(示例 key,如 demo) */
  @Column({ unique: true })
  key: string;

  /** 大屏名称 */
  @Column()
  name: string;

  /** 子路由路径(相对 /screen) */
  @Column()
  path: string;

  /** 对应页面组件路径(相对 src) */
  @Column()
  component: string;

  /** 基准分辨率宽 */
  @Column()
  width: number;

  /** 基准分辨率高 */
  @Column()
  height: number;

  /** 是否启用 */
  @Column({ default: true })
  enabled: boolean;

  /** 排序 */
  @Column({ default: 0 })
  sort: number;

  @CreateDateColumn()
  createTime: Date;

  @UpdateDateColumn()
  updateTime: Date;
}
