import request from '../../request';

/**
 * 运维监控 API（后台管理部分，走 JWT）
 * 对接 backend /api/ops
 *
 * 只读：无任何写入 / 触发接口。展示探针采集的运维状态。
 *
 * 探针按 kind 渲染（见 OpsProbeResult）：
 *   - status  状态卡（items 键值列表）
 *   - table   明细表（columns + rows）
 *   - log     日志尾（lines，只读）
 *
 * 后端新增探针无需改本文件：overview 返回的 probes 数组逐项渲染即可。
 */

export type OpsProbeKind = 'status' | 'table' | 'log';
export type OpsHealthy = boolean | 'unknown';

export interface OpsStatusDetail {
  kind: 'status';
  items: { label: string; value: string }[];
}
export interface OpsTableDetail {
  kind: 'table';
  columns: { key: string; title: string }[];
  rows: Record<string, string | number>[];
}
export interface OpsLogDetail {
  kind: 'log';
  lines: string[];
}
export type OpsProbeDetail = OpsStatusDetail | OpsTableDetail | OpsLogDetail;

export interface OpsProbeResult {
  key: string;
  name: string;
  kind: OpsProbeKind;
  healthy: OpsHealthy;
  summary: string;
  detail: OpsProbeDetail;
  collectedAt: string;
}

/** 聚合所有探针（前端首屏） */
export function overview(): Promise<ResponseItem<OpsProbeResult[]>> {
  return request.get('/api/ops/overview');
}

/** 单探针刷新（前端点「刷新」按钮，按 key） */
export function probe(key: string): Promise<ResponseItem<OpsProbeResult | null>> {
  return request.get(`/api/ops/probe/${key}`);
}
