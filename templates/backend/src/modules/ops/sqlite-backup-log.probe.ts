import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs';
import * as path from 'path';
import type { AppConfig } from '../../config/config.interface';
import type { OpsProbe, OpsProbeResult } from './ops-probe.interface';

/**
 * SQLite 备份日志探针：只读展示 cron 任务的 `>> logfile 2>&1` 日志尾部。
 * 只读来源：{dataDir}/logs/sqlite-backup.log（backend/ops/sqlite/backup.sh 的输出落地，cron 与手动均写此）。
 * 取尾部 50 行（日志可能很大，只看最近的）。
 */
@Injectable()
export class SqliteBackupLogProbe implements OpsProbe {
  readonly key = 'sqlite-backup-log';
  readonly name = '备份日志';
  readonly kind = 'log' as const;
  private readonly MAX_LINES = 50;

  constructor(private readonly config: ConfigService<AppConfig, true>) {}

  private resolveDataDir(): string {
    const dir = this.config.get<AppConfig['database']>('database')!.dir;
    return path.isAbsolute(dir) ? dir : path.resolve(process.cwd(), dir);
  }

  async collect(): Promise<OpsProbeResult> {
    const dataDir = this.resolveDataDir();
    const logFile = path.join(dataDir, 'logs', 'sqlite-backup.log');
    const collectedAt = new Date().toISOString();

    const base: OpsProbeResult = {
      key: this.key,
      name: this.name,
      kind: 'log',
      healthy: 'unknown',
      summary: '',
      detail: { kind: 'log', lines: [] },
      collectedAt
    };

    if (!fs.existsSync(logFile)) {
      base.summary = '日志文件不存在（cron 未跑过或未配日志重定向）';
      return base;
    }

    try {
      const content = fs.readFileSync(logFile, 'utf8');
      // 过滤测试残留行（手写测试数据污染判定）；真实失败行含 ❌ 且不含"测试"字样
      const allLines = content.split('\n').filter((l) => l.length > 0 && !/测试|test/i.test(l));
      const tail = allLines.slice(-this.MAX_LINES);
      base.summary = `最近 ${tail.length} 行`;
      // 判定：有 ✅ 成功行 = 跑过且成功过；含 ❌ 失败行 = 异常
      const hasSuccess = tail.some((l) => l.includes('✅'));
      const hasFail = tail.some((l) => l.includes('❌'));
      base.healthy = hasSuccess && !hasFail ? true : hasFail ? false : 'unknown';
      base.detail = { kind: 'log', lines: tail };
    } catch (e) {
      base.summary = `读取日志失败: ${(e as Error).message}`;
    }
    return base;
  }
}
