import { Inject, Injectable, Logger } from '@nestjs/common';
import { OPS_PROBE, type OpsProbe, type OpsProbeResult } from './ops-probe.interface';

/**
 * 运维聚合服务：注入所有 OpsProbe（NestJS 多 provider 注入），逐个 collect 后聚合。
 *
 * 扩展设计：新增检查项只需在 ops.module.ts providers 注册新 probe，这里自动发现，
 *   controller / 前端均无需改动（前端按 probes 数组循环渲染）。
 *
 * 容错：单个 probe collect 抛错，这里兜底转成 healthy=unknown + 异常摘要，
 *   不让一个探针故障拖垮整个 overview 接口。
 */
@Injectable()
export class OpsService {
  private readonly logger = new Logger(OpsService.name);

  constructor(@Inject(OPS_PROBE) private readonly probes: OpsProbe[]) {}

  /** 跑所有探针，返回聚合结果（前端首屏一次性拉） */
  async overview(): Promise<OpsProbeResult[]> {
    const results = await Promise.all(
      this.probes.map(async (probe) => {
        try {
          return await probe.collect();
        } catch (e) {
          this.logger.warn(`探针 ${probe.key} 采集失败: ${(e as Error).message}`);
          return {
            key: probe.key,
            name: probe.name,
            kind: probe.kind,
            healthy: 'unknown' as const,
            summary: `探针异常: ${(e as Error).message}`,
            detail: { kind: 'status', items: [] } as const,
            collectedAt: new Date().toISOString()
          } satisfies OpsProbeResult;
        }
      })
    );
    // 固定顺序：status 类靠前，table/log 靠后；同类按 key 字典序
    const order: Record<string, number> = { status: 0, table: 1, log: 2 };
    return results.sort((a, b) => (order[a.kind] - order[b.kind]) || a.key.localeCompare(b.key));
  }

  /** 跑单个探针（前端按 key 单独刷新某卡片时用） */
  async one(key: string): Promise<OpsProbeResult | null> {
    const probe = this.probes.find((p) => p.key === key);
    if (!probe) return null;
    try {
      return await probe.collect();
    } catch (e) {
      this.logger.warn(`探针 ${probe.key} 采集失败: ${(e as Error).message}`);
      return {
        key: probe.key,
        name: probe.name,
        kind: probe.kind,
        healthy: 'unknown' as const,
        summary: `探针异常: ${(e as Error).message}`,
        detail: { kind: 'status', items: [] } as const,
        collectedAt: new Date().toISOString()
      };
    }
  }
}
