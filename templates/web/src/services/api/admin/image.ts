import request from '../../request';
import type { ResponseItem } from '../../types';

/**
 * 图片管理 API(admin,走 JWT)
 * 对接 backend image 模块 /api/image/{getList,add,edit,deleteById}
 *
 * 上传走 api.admin.upload(file) → 拿 { url, size } 后调 add 登记。
 */

export interface ImageItem {
  id: number;
  name: string;
  url: string;
  size: number;
  createTime: string;
  updateTime: string;
}

export function getList(params: { page?: number; pageSize?: number; name?: string }) {
  return request.get<any, ResponseItem<{ list: ImageItem[]; total: number }>>('/api/image/getList', {
    params
  });
}

export function add(data: { name: string; url: string; size?: number }) {
  return request.post<any, ResponseItem<ImageItem>>('/api/image/add', data);
}

export function edit(data: { id: number; name: string }) {
  return request.put<any, ResponseItem<boolean>>('/api/image/edit', data);
}

export function deleteById(id: number) {
  return request.delete<any, ResponseItem<boolean>>('/api/image/deleteById', { params: { id } });
}
