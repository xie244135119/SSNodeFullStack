import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs';
import * as path from 'path';
import type { AppConfig } from '../../config/config.interface';
import type { OpsProbe, OpsProbeResult } from './ops-probe.interface';

/**
 * SQLite 备份探针：只读展示三件套文件拷贝备份的状态。
 *
 * 读取两类来源（全是文件系统，不进 DB、不碰 cron）：
 *   1) 备份目录 {dataDir}/backup/template.{env}.*  —— 每个子目录是一次备份三件套（主库+-wal+-shm）。
 *   2) 日志文件 {dataDir}/logs/sqlite-backup.log —— cron 任务的 `>> logfile 2>&1` 落地，取尾部展示。
 *
 * dataDir 推导：database.dir 是 sqlite 主库所在目录（prod 部署后为绝对路径 ${dataDir}；
 *   develop 为相对路径 data，相对 process.cwd()）。dir 即 dataDir（无需 dirname）。
 *   docker 模式下 dataDir 经 bind mount 映射为容器内 /app/data，app 读到的就是容器内绝对路径，
 *   与宿主 backup 目录是同一份（bind mount），探针读到的状态即宿主真实状态。
 *
 * 健康判定（不谎称完整性，只判新鲜度 + 份数）：
 *   - backup 目录不存在 / 无备份 → unknown（首次部署或未配 cron）
 *   - 最近一次备份 mtime 在 25h 内（每日 cron + 1h 余量）且份数 ≥1 → healthy=true
 *   - 超过 25h → healthy=false（cron 可能漏跑）
 *   - 不检测库完整性（需 sqlite3 CLI，服务器不一定有，别假设）
 *
 * 异常兜底：目录/文件读不到一律转成 healthy=unknown + summary 说明原因，不抛错。
 */
@Injectable()
export class SqliteBackupProbe implements OpsProbe {
  private readonly logger = new Logger(SqliteBackupProbe.name);
  readonly key = 'sqlite-backup';
  readonly name = 'SQLite 备份';
  readonly kind = 'status' as const;

  // 一并返回 table + log 视图：通过 collect 组合多视图。
  // 但接口约定一个 probe 一个 kind；这里主视图用 status，明细走 overview 接口的多 probe 组合？
  // ——为保持 A 阶段简单且前端数据驱动，本 probe 返回 kind='status'，detail 含 items；
  //   备份明细表与日志尾作为**额外 probe**（SqliteBackupListProbe / SqliteBackupLogProbe）注册，
  //   各自独立 kind=table / kind=log。这样前端循环渲染，新增明细不改 status 卡。

  constructor(private readonly config: ConfigService<AppConfig, true>) {}

  /** 解析 dataDir 绝对路径 */
  private resolveDataDir(): string {
    const dir = this.config.get<AppConfig['database']>('database')!.dir;
    // 相对路径相对 process.cwd()（develop）；绝对路径原样（prod 部署后）
    return path.isAbsolute(dir) ? dir : path.resolve(process.cwd(), dir);
  }

  async collect(): Promise<OpsProbeResult> {
    const env = process.env.NODE_ENV === 'prod' ? 'prod' : 'develop';
    const dataDir = this.resolveDataDir();
    const backupDir = path.join(dataDir, 'backup');
    const thresholdHours = 25; // 每日 cron + 1h 余量
    const collectedAt = new Date().toISOString();

    // helper：构造一条 status 结果
    const statusResult = (
      healthy: boolean | 'unknown',
      summary: string,
      items: { label: string; value: string }[]
    ): OpsProbeResult => ({
      key: this.key,
      name: this.name,
      kind: 'status',
      healthy,
      summary,
      detail: { kind: 'status', items },
      collectedAt
    });

    if (!fs.existsSync(backupDir)) {
      return statusResult('unknown', '备份目录不存在（未配 cron 或首次部署）', [
        { label: '备份目录', value: backupDir }
      ]);
    }

    // 列出 template.{env}.* 子目录（三件套备份目录），按名字倒序（名含时间戳，字典序≈时间倒序）
    let entries: string[] = [];
    try {
      entries = fs
        .readdirSync(backupDir, { withFileTypes: true })
        .filter((d) => d.isDirectory() && d.name.startsWith(`g-backend.${env}.`))
        .map((d) => d.name)
        .sort()
        .reverse();
    } catch (e) {
      return statusResult('unknown', `读取备份目录失败: ${(e as Error).message}`, [
        { label: '备份目录', value: backupDir }
      ]);
    }

    if (entries.length === 0) {
      return statusResult('unknown', '暂无备份（未配 cron 或首次部署）', [
        { label: '备份目录', value: backupDir },
        { label: '备份数', value: '0' }
      ]);
    }

    const latestDir = entries[0];
    const latestPath = path.join(backupDir, latestDir);
    const stat = fs.statSync(latestPath);
    const ageHours = (Date.now() - stat.mtimeMs) / 3_600_000;
    const healthy = ageHours <= thresholdHours;
    const triplet = this.readTriplet(latestPath);

    return statusResult(
      healthy,
      healthy
        ? `最近备份 ${this.formatAge(ageHours)}前 · 共 ${entries.length} 份`
        : `最近备份已是 ${this.formatAge(ageHours)}前（超 ${thresholdHours}h，cron 可能漏跑）`,
      [
        { label: '最近备份', value: `${this.formatTs(latestDir)}（${this.formatAge(ageHours)}前）` },
        { label: '备份数', value: String(entries.length) },
        { label: '新鲜度阈值', value: `${thresholdHours}h` },
        { label: '最近三件套', value: triplet || '仅主库（无 WAL 旁文件）' },
        { label: '备份目录', value: backupDir }
      ]
    );
  }

  /** 读备份目录里三件套构成描述（如 g-backend.prod.sqlite + -wal + -shm） */
  private readTriplet(dir: string): string {
    const env = process.env.NODE_ENV === 'prod' ? 'prod' : 'develop';
    const base = `g-backend.${env}.sqlite`;
    const parts: string[] = [base];
    if (fs.existsSync(path.join(dir, `${base}-wal`))) parts.push(`${base}-wal`);
    if (fs.existsSync(path.join(dir, `${base}-shm`))) parts.push(`${base}-shm`);
    return parts.join(' + ');
  }

  private formatAge(hours: number): string {
    if (hours < 1) return `${Math.round(hours * 60)} 分钟`;
    if (hours < 24) return `${Math.round(hours)} 小时`;
    return `${Math.round(hours / 24)} 天`;
  }

  private formatTs(dirName: string): string {
    // dirName 形如 g-backend.prod.20260812-104311 → 2026-08-12 10:43:11
    const m = dirName.match(/(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})(\d{2})$/);
    if (!m) return dirName;
    return `${m[1]}-${m[2]}-${m[3]} ${m[4]}:${m[5]}:${m[6]}`;
  }
}
