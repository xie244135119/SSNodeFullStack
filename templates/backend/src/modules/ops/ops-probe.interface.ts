/**
 * 运维探针（probe）抽象：每个检查项实现此接口，OpsService 聚合所有探针返回前端。
 *
 * 扩展设计（B 阶段不改动 A 代码）：
 *   - 新增检查项 = 新增一个 implements OpsProbe 的 @Injectable 文件 + 在 ops.module.ts
 *     providers 数组注册。OpsService 通过 NestJS 多 provider 注入自动发现，无需改 controller / 前端。
 *   - 前端按 probe.kind 渲染卡片；已有 kind：
 *       'status'  状态卡（最新时间 / 健康灯 / 总数）
 *       'table'   明细表（行数组，columns 由后端给出，前端按 columns 渲染）
 *       'log'     日志尾（行数组，只读文本）
 *     新检查项尽量复用上述 kind；确需新 kind 才在前端 OpsProbeRenderer 加一个 case。
 *
 * 安全边界：
 *   - probe 只做**读取**展示，绝不触发写入 / 执行命令 / 改 cron。
 *   - 探针读不到（目录不存在 / 权限不足）应返回 healthy=unknown 而非抛错，
 *     以免一个探针故障拖垮整个 /api/ops/overview。
 */
/** 探针注册 token（NestJS provider 用，因 interface 不能作为值） */
export const OPS_PROBE = Symbol('OPS_PROBE');

export interface OpsProbe {
  /** 探针唯一标识，前端按此聚合，如 'sqlite-backup' */
  readonly key: string;
  /** 展示名，如「SQLite 备份」 */
  readonly name: string;
  /** 卡片渲染形态 */
  readonly kind: OpsProbeKind;
  /** 采集状态。抛错由 OpsService 兜底转成 unknown，不抛到外面。 */
  collect(): Promise<OpsProbeResult>;
}

export type OpsProbeKind = 'status' | 'table' | 'log';

/** 探针统一返回结构。前端按 kind 解释 detail 字段。 */
export interface OpsProbeResult {
  key: string;
  name: string;
  kind: OpsProbeKind;
  /** healthy: true=正常 / false=异常 / unknown=探针自身无法判定（如目录不存在） */
  healthy: boolean | 'unknown';
  /** 一句话摘要，状态卡用，如「最近备份 3 小时前」 */
  summary: string;
  /** 详情，结构随 kind 不同（见下方 *Detail）。前端按 kind 解析。 */
  detail: OpsStatusDetail | OpsTableDetail | OpsLogDetail;
  /** 采集时间（ISO），前端显示「数据更新于」 */
  collectedAt: string;
}

export interface OpsStatusDetail {
  kind: 'status';
  /** 状态项键值，前端可逐项展示。常用键：latestAt / latestAgeHours / total / keep / thresholdHours */
  items: { label: string; value: string }[];
}

export interface OpsTableDetail {
  kind: 'table';
  /** 列定义，前端按此渲染表头 */
  columns: { key: string; title: string }[];
  /** 行数据，key 对应 columns.key */
  rows: Record<string, string | number>[];
}

export interface OpsLogDetail {
  kind: 'log';
  /** 日志行，按时间正序（旧→新）。只读展示。 */
  lines: string[];
}
