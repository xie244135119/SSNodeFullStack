import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger
} from '@nestjs/common';
import { Request, Response } from 'express';
import { ResponseResult } from './response';

/**
 * 全局异常过滤器
 * 把所有异常统一包成 { code, message, data } 响应体
 * - HttpException: 用其 status 作 code,message 用其 message
 * - 其他错误: 500
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('Exception');

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let code = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = '服务器内部错误';

    if (exception instanceof HttpException) {
      code = exception.getStatus();
      const res = exception.getResponse();
      message =
        typeof res === 'string'
          ? res
          : (res as any)?.message || exception.message;
      // class-validator 数组 message 取首条
      if (Array.isArray(message)) {
        message = message[0];
      }
    } else if (exception instanceof Error) {
      message = exception.message;
      this.logger.error(`${request.method} ${request.url} -> ${exception.message}`, exception.stack);
    }

    // 限流(429)使用更友好的文案
    if (code === 429) {
      message = '请求过于频繁,请稍后再试(每分钟 60 次)';
    }

    const status = code >= 100 && code < 600 ? code : 200;
    response
      .status(status)
      .json(new ResponseResult(code, message as string, null));
  }
}
