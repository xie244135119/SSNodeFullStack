import request from '../../request';

/**
 * 上传文件大小上限(字节)。
 * 必须与 backend yaml `upload.maxSize`(config.{develop,prod}.yaml)保持一致:
 * 当前 10485760(10MB)。后端 multer limits + service 二次校验同款值,改后端时同步改这里。
 */
export const UPLOAD_MAX_SIZE = 10 * 1024 * 1024;

/**
 * 文件上传 API（admin，走 JWT）
 * 对接 backend /api/upload，返回 { url }
 */
export function upload(file: File): Promise<ResponseItem<{ url: string; size: number; filename: string }>> {
  const formdata = new FormData();
  formdata.append('file', file);
  return request.post('/api/upload', formdata, {
    headers: { 'Content-Type': 'multipart/form-data' }
  });
}
