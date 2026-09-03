import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import type { OpsProbe, OpsProbeResult } from './ops-probe.interface';

/**
 * 后台服务版本探针：读 package.json 的 version 字段，只读展示当前运行的后台版本号。
 *
 * 版本定位：process.cwd()/package.json。
 *   - dev(nest start)cwd=backend/，package.json 在同级。
 *   - prod(单文件 bundle dist/main.js，cwd=current/ 即 release 根)package.json 由 buildops
 *     拷入 releases/<version>-<ts>/ 根，与 dist 同级，cwd 命中。
 *   两种部署形态 package.json 都在 cwd 同级，故无需 __dirname 推导（__dirname 在单文件
 *   bundle 下指向 dist/，反而是 package.json 的兄弟目录，但 cwd 更稳定且与 configuration.ts
 *   的 resolveConfig 一致）。
 *
 * 健康判定：版本读得到即 healthy=true；package.json 不存在 / 解析失败转 unknown，不抛错。
 *
 * 安全边界：纯读取，不写、不执行命令。
 */
@Injectable()
export class BackendVersionProbe implements OpsProbe {
  private readonly logger = new Logger(BackendVersionProbe.name);
  readonly key = 'backend-version';
  readonly name = '后台版本';
  readonly kind = 'status' as const;

  async collect(): Promise<OpsProbeResult> {
    const collectedAt = new Date().toISOString();
    const pkgPath = path.join(process.cwd(), 'package.json');

    const statusResult = (
      healthy: boolean | 'unknown',
      summary: string,
      version: string
    ): OpsProbeResult => ({
      key: this.key,
      name: this.name,
      kind: 'status',
      healthy,
      summary,
      detail: {
        kind: 'status',
        items: [
          { label: '版本号', value: version },
          { label: '来源', value: pkgPath }
        ]
      },
      collectedAt
    });

    if (!fs.existsSync(pkgPath)) {
      return statusResult('unknown', '未找到 package.json', '-');
    }

    try {
      const raw = fs.readFileSync(pkgPath, 'utf8');
      const pkg = JSON.parse(raw);
      const version = typeof pkg.version === 'string' && pkg.version ? pkg.version : '';
      if (!version) {
        return statusResult('unknown', 'package.json 缺少 version 字段', '-');
      }
      return statusResult(true, `当前后台版本 ${version}`, version);
    } catch (e) {
      this.logger.warn(`读取 package.json 失败: ${(e as Error).message}`);
      return statusResult('unknown', `读取版本失败: ${(e as Error).message}`, '-');
    }
  }
}
