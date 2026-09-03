import request from '../../request';

/**
 * 用户管理 API(后台管理部分,走 JWT,admin-only)
 * 对接 backend /api/user
 *
 * 与 user.ts(登录/鉴权)的区别:本文件是管理 CRUD,user.ts 是登录态相关。
 */

export interface UserManageItem {
  id: number;
  username: string;
  nickname: string;
  role: string;
  status: string;
  createTime: string;
}

export interface UserCreateDto {
  username: string;
  password: string;
  nickname?: string;
  role?: string;
  status?: string;
}

export interface UserUpdateDto {
  id: number;
  nickname?: string;
  role?: string;
  status?: string;
}

export function listUsers(params: {
  page?: number;
  size?: number;
  username?: string;
}): Promise<ResponseItem<{ list: UserManageItem[]; total: number }>> {
  return request.get('/api/user/list', { params });
}

export function createUser(dto: UserCreateDto): Promise<ResponseItem<{ id: number; username: string }>> {
  return request.post('/api/user/create', dto);
}

export function updateUser(dto: UserUpdateDto): Promise<ResponseItem<boolean>> {
  return request.put('/api/user/update', dto);
}

export function deleteUser(id: number): Promise<ResponseItem<boolean>> {
  return request.delete('/api/user/delete', { params: { id } });
}

export function resetUserPassword(id: number): Promise<ResponseItem<{ password: string }>> {
  return request.post('/api/user/resetPassword', null, { params: { id } });
}

export function toggleUserStatus(id: number): Promise<ResponseItem<{ status: string }>> {
  return request.post('/api/user/toggleStatus', null, { params: { id } });
}
