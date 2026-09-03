import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn
} from 'typeorm';

/**
 * 用户实体
 * 对接前端 user.ts 的 login/isLogin/getInfo
 */
@Entity('user')
export class UserEntity {
  @PrimaryGeneratedColumn()
  id: number;

  /** 用户名 */
  @Column({ unique: true })
  username: string;

  /** 密码(生产应存哈希,此处先留字段) */
  @Column()
  password: string;

  /** 昵称/显示名 */
  @Column({ default: '' })
  nickname: string;

  /** 角色 admin/web */
  @Column({ default: 'web' })
  role: string;

  /** 状态 1=启用 0=禁用 */
  @Column({ default: 1 })
  status: string;

  @CreateDateColumn()
  createTime: Date;

  @UpdateDateColumn()
  updateTime: Date;
}
