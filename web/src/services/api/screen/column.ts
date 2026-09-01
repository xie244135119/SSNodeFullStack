import appRequest from '../../app-request';
import type { ColumnItem } from '../admin/column';

/**
 * 栏目展示 大屏消费 API(走前端 HMAC 签名,无 token)
 * 对接 backend /api/column/screen
 *
 * 返回按分组分组:见 docs/column-module.md §3。
 */
export interface ColumnScreenGroup {
  category: string;
  name: string;
  subtitle: string;
  items: ColumnItem[];
}

export function screenList(): Promise<ResponseItem<ColumnScreenGroup[]>> {
  return appRequest.get('/api/column/screen');
}
