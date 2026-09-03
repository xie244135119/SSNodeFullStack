import { Response } from 'express';

/**
 * 统一响应体契约
 * 与前端 web/src/services/types/index.d.ts 的 ResponseItem 对齐:
 * { code: number, message: string, data: T }
 */
export class ResponseResult<T = any> {
  code: number;
  message: string;
  data?: T;

  constructor(code: number, message: string, data?: T) {
    this.code = code;
    this.message = message;
    this.data = data;
  }

  static success<T>(data?: T, message = 'success'): ResponseResult<T> {
    return new ResponseResult(200, message, data);
  }

  static fail(message = 'failed', code = 500): ResponseResult<null> {
    return new ResponseResult(code, message, null);
  }

  /**
   * 直接写入 express Response(供守卫等手动返回时用)
   */
  static write(res: Response, code: number, message: string, data?: any) {
    res.status(code >= 100 && code < 600 ? code : 200).json(new ResponseResult(code, message, data));
  }
}
