import request from '../../request';

/**
 * 审计日志 API(后台管理部分,走 JWT)
 * 对接 backend /api/audit
 *
 * 只读:登录成功/失败、用户增删改等操作审计。不含接口报错。
 */
export interface AuditLogItem {
  id: number;
  actorName: string;
  action: string;
  detail: string;
  ip: string;
  createTime: string;
}

export function listAuditLogs(params: {
  page?: number;
  size?: number;
  actorName?: string;
  action?: string;
}): Promise<ResponseItem<{ list: AuditLogItem[]; total: number }>> {
  return request.get('/api/audit/list', { params });
}
