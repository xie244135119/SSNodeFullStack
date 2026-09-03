import request from '../../request';

/**
 * 栏目(区块)API(后台管理部分,走 JWT)
 * 对接 backend /api/column
 *
 * 大屏消费接口(screenList)见 screen/column.ts,走前端 HMAC 签名。
 * 分组 key 枚举与 config/column-hall.config.ts 一致(定死)。
 */
export interface ColumnImageItem {
  id?: number;
  imageUrl: string;
  description?: string;
  time?: string;
  sort?: number;
}

export interface ColumnItem {
  id: number;
  category: string;
  title: string;
  time: string;
  status: string;
  route?: string | null;
  resolution?: string | null;
  sort: number;
  enabled: boolean;
  images?: ColumnImageItem[];
  createTime?: string;
  updateTime?: string;
}

/** 列表(后台,分页) */
export function list(params: {
  page?: number;
  pageSize?: number;
  keyword?: string;
  category?: string;
  orderBy?: string;
  order?: 'ASC' | 'DESC';
}): Promise<
  ResponseItem<{
    list: ColumnItem[];
    total: number;
    page: number;
    pageSize: number;
  }>
> {
  return request.get('/api/column/list', { params });
}

/** 详情 */
export function detail(id: number): Promise<ResponseItem<ColumnItem>> {
  return request.get(`/api/column/${id}`);
}

/** 新增 */
export function create(dto: Partial<ColumnItem>): Promise<ResponseItem<ColumnItem>> {
  return request.post('/api/column', dto);
}

/** 修改(images 提供即整列替换) */
export function update(id: number, dto: Partial<ColumnItem>): Promise<ResponseItem<ColumnItem>> {
  return request.put(`/api/column/${id}`, dto);
}

/** 删除 */
export function remove(id: number): Promise<ResponseItem<boolean>> {
  return request.delete(`/api/column/${id}`);
}
