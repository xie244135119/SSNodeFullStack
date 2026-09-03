import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

/**
 * 审计日志表
 * 记录后台管理操作事件：登录成功/失败、用户增删改、重置密码、状态切换。
 * 不记录接口报错。
 */
@Entity('audit_log')
export class AuditLogEntity {
  @PrimaryGeneratedColumn()
  id: number;

  /** 操作者用户名 */
  @Column()
  actorName: string;

  /** 动作类型 */
  @Column()
  action: string;

  /** 详情(JSON 字符串,如 { targetUserId, fields, reason }) */
  @Column({ default: '' })
  detail: string;

  /** 来源 IP */
  @Column({ default: '' })
  ip: string;

  @CreateDateColumn()
  createTime: Date;
}
