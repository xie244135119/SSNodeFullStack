import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs';
import * as path from 'path';
import type { AppConfig } from '../../config/config.interface';
import type { OpsProbe, OpsProbeResult } from './ops-probe.interface';

/**
 * SQLite 备份历史探针：以表格形式列出每次三件套备份（时间 / 大小 / 是否含 WAL 旁文件）。
 * 只读，来源同 SqliteBackupProbe：{dataDir}/backup/template.{env}.* 子目录。
 */
@Injectable()
export class SqliteBackupListProbe implements OpsProbe {
  readonly key = 'sqlite-backup-list';
  readonly name = '备份历史';
  readonly kind = 'table' as const;

  constructor(private readonly config: ConfigService<AppConfig, true>) {}

  private resolveDataDir(): string {
    const dir = this.config.get<AppConfig['database']>('database')!.dir;
    return path.isAbsolute(dir) ? dir : path.resolve(process.cwd(), dir);
  }

  async collect(): Promise<OpsProbeResult> {
    const env = process.env.NODE_ENV === 'prod' ? 'prod' : 'develop';
    const dataDir = this.resolveDataDir();
    const backupDir = path.join(dataDir, 'backup');
    const collectedAt = new Date().toISOString();

    const base: OpsProbeResult = {
      key: this.key,
      name: this.name,
      kind: 'table',
      healthy: 'unknown',
      summary: '',
      detail: { kind: 'table', columns: [], rows: [] },
      collectedAt
    };

    if (!fs.existsSync(backupDir)) {
      base.summary = '备份目录不存在';
      return base;
    }

    let entries: string[] = [];
    try {
      entries = fs
        .readdirSync(backupDir, { withFileTypes: true })
        .filter((d) => d.isDirectory() && d.name.startsWith(`g-fullstack.${env}.`))
        .map((d) => d.name)
        .sort()
        .reverse();
    } catch (e) {
      base.summary = `读取备份目录失败: ${(e as Error).message}`;
      return base;
    }

    const baseName = (env === 'prod' ? 'g-fullstack.prod' : 'g-fullstack.develop') + '.sqlite';
    const rows = entries.map((dirName) => {
      const dirPath = path.join(backupDir, dirName);
      const stat = fs.statSync(dirPath);
      const mainFile = path.join(dirPath, baseName);
      let mainBytes = 0;
      try {
        mainBytes = fs.statSync(mainFile).size;
      } catch {
        // 主库不在（残留目录），大小记 0
      }
      const hasWal = fs.existsSync(path.join(dirPath, `${baseName}-wal`));
      const hasShm = fs.existsSync(path.join(dirPath, `${baseName}-shm`));
      const tsMatch = dirName.match(/(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})(\d{2})$/);
      const tsStr = tsMatch
        ? `${tsMatch[1]}-${tsMatch[2]}-${tsMatch[3]} ${tsMatch[4]}:${tsMatch[5]}:${tsMatch[6]}`
        : dirName;
      return {
        ts: tsStr,
        dirName,
        mainBytes,
        wal: hasWal ? '有' : '无',
        shm: hasShm ? '有' : '无',
        mtime: stat.mtime.toISOString()
      };
    });

    base.summary = rows.length ? `共 ${rows.length} 份备份` : '暂无备份';
    base.healthy = rows.length > 0;
    base.detail = {
      kind: 'table',
      columns: [
        { key: 'ts', title: '备份时间' },
        { key: 'mainBytes', title: '主库大小' },
        { key: 'wal', title: 'WAL' },
        { key: 'shm', title: 'SHM' }
      ],
      rows
    };
    return base;
  }
}
