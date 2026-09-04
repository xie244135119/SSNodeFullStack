import request from '../../request';
import type { ResponseItem } from '../../types';

/**
 * 页面数据 API(admin,走 JWT)
 * 对接 backend page-data 模块 /api/{getList,add,edit,deleteById}
 */

export interface PageDataItem {
  id: number;
  screenKey: string;
  section: string;
  content: string;
  updatedBy: string;
  enabled: boolean;
  createTime: string;
  updateTime: string;
}

export function getList(params: { page?: number; pageSize?: number; screenKey?: string }) {
  return request.get<any, ResponseItem<{ list: PageDataItem[]; total: number }>>('/api/getList', {
    params
  });
}

export function add(data: Pick<PageDataItem, 'screenKey' | 'section' | 'content'>) {
  return request.post<any, ResponseItem<PageDataItem>>('/api/add', data);
}

export function edit(data: Pick<PageDataItem, 'id' | 'screenKey' | 'section' | 'content'>) {
  return request.put<any, ResponseItem<boolean>>('/api/edit', data);
}

export function deleteById(id: number) {
  return request.delete<any, ResponseItem<boolean>>('/api/deleteById', { params: { id } });
}
