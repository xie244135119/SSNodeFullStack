import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Like, Not } from 'typeorm';
import * as bcrypt from 'bcryptjs';
import { UserEntity } from '../../entities/user.entity';
import { AuditService } from '../audit/audit.service';
import type { AppConfig } from '../../config/config.interface';

/**
 * 返回纯数据,由全局 TransformInterceptor 统一包装
 */
@Injectable()
export class UserService implements OnModuleInit {
  private readonly logger = new Logger(UserService.name);

  constructor(
    @InjectRepository(UserEntity)
    private readonly userRepo: Repository<UserEntity>,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService<AppConfig>,
    private readonly auditService: AuditService
  ) {}

  /**
   * 超管账号:yaml/env(config.admin)为权威,每次启动把 DB 超管 reconcile 到配置值。
   *   - 不存在 → 按配置创建(哈希),role=superadmin。
   *   - 已存在 → bcrypt.compare(配置密码, DB哈希):一致但 role 非 superadmin → 刷成 superadmin;
   *     不一致(轮换过/历史明文/手改库)→ 重置 DB 哈希为配置值,并同步 role。
   * 超管(superadmin)仅此一个,随配置注入,后台 UI 不可创建/不可见/不可改。
   * admin/普通用户由后台 UI 管理。
   * 「改配置 + 重启」即完成轮换(如三月一换)。
   * prod 真值已入库 config.prod.yaml(直读);ADMIN_PASSWORD env 为可选覆盖。占位值
   * (change-me/空)时跳过 reconcile、不写弱默认,作防御兜底。
   */
  async onModuleInit() {
    const adminCfg = this.config.get<AppConfig['admin']>('admin');
    const username = adminCfg.username;
    const password = adminCfg.password;
    const isProd = process.env.NODE_ENV === 'prod';
    // 占位/空:防御性跳过,不写库(yaml 已带真值时正常走 reconcile;此处仅兜底异常配置)。
    if (!password || /^change-?me$/i.test(password)) {
      this.logger.warn(
        `admin.password 为占位值,跳过超管 reconcile(检查 ${isProd ? 'config/config.prod.yaml 或 ADMIN_PASSWORD env' : 'config.develop.yaml'})`
      );
      return;
    }

    const existing = await this.userRepo.findOne({ where: { username } });
    if (!existing) {
      await this.userRepo.save({
        username,
        password: bcrypt.hashSync(password, 10),
        nickname: '超管',
        role: 'superadmin',
        status: '1'
      });
      this.logger.log(`superadmin ${username} created from config`);
      return;
    }
    // 已存在:校验是否与配置一致。bcrypt.compareSync 对非哈希串(历史明文)返回 false → 走重置。
    const pwdMatch = bcrypt.compareSync(password, existing.password);
    // role 不是 superadmin(历史 'admin' 残留)→ 刷成 superadmin;密码不一致 → 重置
    if (pwdMatch && existing.role === 'superadmin') {
      return; // 完全一致,no-op
    }
    if (!pwdMatch) {
      existing.password = bcrypt.hashSync(password, 10);
    }
    existing.role = 'superadmin';
    await this.userRepo.save(existing);
    this.logger.log(
      `superadmin ${username} synced from config (pwd ${pwdMatch ? 'unchanged' : 'rotated'}, role set to superadmin)`
    );
  }

  /**
   * 判断是否登录 /api/user/islogin
   * 公开接口:自行解析 Authorization 头
   */
  async isLogin(authHeader?: string) {
    let payload: { sub?: number; username?: string; role?: string } | null = null;
    if (authHeader?.startsWith('Bearer ')) {
      const token = authHeader.slice(7);
      try {
        payload = this.jwtService.verify(token);
      } catch {
        payload = null;
      }
    }
    if (!payload?.sub) {
      return { login: false, permission: false };
    }
    const u = await this.userRepo.findOne({ where: { id: payload.sub } });
    const login = !!u;
    const permission = login && u.status === '1';
    return { login, permission };
  }

  /**
   * 获取用户信息 /api/user/info
   */
  async getInfo(user: { id?: number; username?: string }) {
    if (!user?.id) {
      throw new Error('未登录');
    }
    const u = await this.userRepo.findOne({ where: { id: user.id } });
    if (!u) {
      throw new Error('用户不存在');
    }
    return {
      id: u.id,
      username: u.username,
      nickname: u.nickname,
      role: u.role,
      status: u.status,
      admin: u.role === 'admin' || u.role === 'superadmin'
    };
  }

  /**
   * 退出登录 /api/user/logout
   */
  async logout() {
    return true;
  }

  // ========== 用户管理(admin/superadmin 操作,控制器已做角色双重校验) ==========

  /** 列表 GET /api/user/list 永远过滤掉 superadmin(不暴露) */
  async list(params: { page: number; size: number; username?: string }) {
    const where: any = { role: Not('superadmin') };
    if (params.username) where.username = Like(`%${params.username}%`);
    const [items, total] = await this.userRepo.findAndCount({
      where,
      order: { id: 'ASC' },
      skip: (params.page - 1) * params.size,
      take: params.size,
      select: ['id', 'username', 'nickname', 'role', 'status', 'createTime']
    });
    // 不返回密码哈希
    return { list: items, total };
  }

  /** 新增用户 /api/user/create 禁止创建 superadmin */
  async create(
    body: { username: string; password: string; nickname?: string; role?: string; status?: string },
    operatorName: string
  ) {
    if (!body.username || !body.password) {
      throw new Error('用户名与密码必填');
    }
    if (body.role === 'superadmin') {
      throw new Error('不允许创建超管账户');
    }
    const exist = await this.userRepo.findOne({ where: { username: body.username } });
    if (exist) {
      throw new Error('用户名已存在');
    }
    const saved = await this.userRepo.save({
      username: body.username,
      password: bcrypt.hashSync(body.password, 10),
      nickname: body.nickname || '',
      role: body.role || 'web',
      status: body.status || '1'
    });
    await this.auditService.record({
      actorName: operatorName,
      action: 'user_create',
      detail: { targetId: saved.id, username: saved.username, role: saved.role }
    });
    return { id: saved.id, username: saved.username };
  }

  /** 修改用户(昵称/角色/状态) /api/user/update 禁止改 superadmin、禁止提权到 superadmin、禁改自己角色 */
  async update(
    body: { id: number; nickname?: string; role?: string; status?: string },
    operator: { id: number; username: string }
  ) {
    if (!body.id) throw new Error('缺少 id');
    if (body.role === 'superadmin') {
      throw new Error('不允许提权为超管');
    }
    const target = await this.userRepo.findOne({ where: { id: body.id } });
    if (!target) throw new Error('目标用户不存在');
    if (target.role === 'superadmin') {
      throw new Error('不允许修改超管账户');
    }
    // 禁止修改自己的角色
    if (target.id === operator.id && body.role && body.role !== target.role) {
      throw new Error('不允许修改自己的角色');
    }
    const changes: Record<string, any> = {};
    if (body.nickname !== undefined) { changes.nickname = body.nickname; target.nickname = body.nickname; }
    if (body.role !== undefined) { changes.role = body.role; target.role = body.role; }
    if (body.status !== undefined) { changes.status = body.status; target.status = body.status; }
    await this.userRepo.save(target);
    await this.auditService.record({
      actorName: operator.username,
      action: 'user_update',
      detail: { targetId: target.id, username: target.username, changes }
    });
    return true;
  }

  /** 删除用户 /api/user/delete 禁止删除 superadmin/admin 与自身 */
  async delete(id: number, operator: { id: number; username: string }) {
    const target = await this.userRepo.findOne({ where: { id } });
    if (!target) throw new Error('目标用户不存在');
    if (target.id === operator.id) throw new Error('不允许删除自己');
    if (target.role === 'superadmin') throw new Error('不允许删除超管');
    if (target.role === 'admin') throw new Error('不允许删除管理员');
    await this.userRepo.remove(target);
    await this.auditService.record({
      actorName: operator.username,
      action: 'user_delete',
      detail: { targetId: id, username: target.username }
    });
    return true;
  }

  /** 重置密码 /api/user/resetPassword 返回新明文密码 禁止重置 superadmin */
  async resetPassword(id: number, operator: { id: number; username: string }) {
    const target = await this.userRepo.findOne({ where: { id } });
    if (!target) throw new Error('目标用户不存在');
    if (target.role === 'superadmin') throw new Error('不允许重置超管密码');
    const newPwd = this.generatePwd();
    target.password = bcrypt.hashSync(newPwd, 10);
    await this.userRepo.save(target);
    await this.auditService.record({
      actorName: operator.username,
      action: 'user_reset_pwd',
      detail: { targetId: target.id, username: target.username }
    });
    return { password: newPwd };
  }

  /** 状态切换 /api/user/toggleStatus 禁止切换 superadmin */
  async toggleStatus(id: number, operator: { id: number; username: string }) {
    const target = await this.userRepo.findOne({ where: { id } });
    if (!target) throw new Error('目标用户不存在');
    if (target.role === 'superadmin') throw new Error('不允许切换超管状态');
    if (target.id === operator.id) throw new Error('不允许切换自己的状态');
    target.status = target.status === '1' ? '0' : '1';
    await this.userRepo.save(target);
    await this.auditService.record({
      actorName: operator.username,
      action: 'user_toggle_status',
      detail: { targetId: target.id, username: target.username, to: target.status }
    });
    return { status: target.status };
  }

  private generatePwd(): string {
    const chars = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
    let pwd = '';
    for (let i = 0; i < 12; i++) pwd += chars[Math.floor(Math.random() * chars.length)];
    return pwd;
  }
}
