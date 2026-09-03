import { Module } from '@nestjs/common';
import { OpsService } from './ops.service';
import { OpsController } from './ops.controller';
import { VersionController } from './version.controller';
import { OPS_PROBE, type OpsProbe } from './ops-probe.interface';
import { SqliteBackupProbe } from './sqlite-backup.probe';
import { SqliteBackupListProbe } from './sqlite-backup-list.probe';
import { SqliteBackupLogProbe } from './sqlite-backup-log.probe';
import { BackendVersionProbe } from './backend-version.probe';

/**
 * 运维监控模块。
 *
 * 扩展设计（B 阶段不改 A 代码）：
 *   新增检查项 = 新增一个 implements OpsProbe 的 @Injectable 文件，
 *   加到下方 providers 数组即可。OpsService 通过多 provider 注入自动发现，
 *   controller / 前端均无需改动。
 *
 * 当前探针（A 阶段，全只读 SQLite 备份相关）：
 *   - SqliteBackupProbe      status  状态卡（最近备份时间 / 健康灯 / 份数）
 *   - SqliteBackupListProbe  table   备份历史表
 *   - SqliteBackupLogProbe   log     备份日志尾
 *   - BackendVersionProbe    status  后台版本号（package.json version）
 *
 * 未来 B 阶段可挂（各自新文件 + 加到 providers）：
 *   - 进程健康 / 磁盘占用 / 迁移历史 / 签名自检 …
 */
@Module({
  providers: [
    OpsService,
    // 各探针以自身类 token 注册（可被下方工厂注入）
    SqliteBackupProbe,
    SqliteBackupListProbe,
    SqliteBackupLogProbe,
    BackendVersionProbe,
    // NestJS 不支持 Angular 的 multi:true，同 token 的 { provide, useClass } 会互相覆盖
    // （最后一个胜出）。故用工厂把所有探针实例聚合成数组，注入到 OPS_PROBE token，
    // OpsService 构造里 @Inject(OPS_PROBE) probes: OpsProbe[] 即拿到真数组。
    // 新增探针 = 新增一个 implements OpsProbe 的 @Injectable 文件 → 在上面加一行
    //   具体类 provider → 在 useFactory 的 inject 数组 + 工厂形参各加一项。仅改本模块。
    {
      provide: OPS_PROBE,
      useFactory: (...probes: OpsProbe[]) => probes,
      inject: [SqliteBackupProbe, SqliteBackupListProbe, SqliteBackupLogProbe, BackendVersionProbe]
    }
  ],
  controllers: [OpsController, VersionController],
  exports: [OpsService]
})
export class OpsModule {}
