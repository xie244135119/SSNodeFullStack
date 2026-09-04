import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index
} from 'typeorm';

/**
 * 图片记录实体(图片管理 CRUD)
 *
 * 文件本体由 upload 模块写 nginx 静态目录(storagePath,经 /static/uploads 访问),
 * 此表只存记录(显示名 / URL / 大小);删除记录时由 image.service 同步删物理文件。
 */
@Entity('image')
export class ImageEntity {
  @PrimaryGeneratedColumn()
  id: number;

  /** 显示名(默认取上传文件名,可改名) */
  @Index()
  @Column()
  name: string;

  /** 可访问 URL(/static/uploads/ymd/xxx.png) */
  @Column()
  url: string;

  /** 文件大小(字节) */
  @Column({ default: 0 })
  size: number;

  @CreateDateColumn()
  createTime: Date;

  @UpdateDateColumn()
  updateTime: Date;
}
