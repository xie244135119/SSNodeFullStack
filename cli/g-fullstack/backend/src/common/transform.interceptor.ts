import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor
} from '@nestjs/common';
import { Observable, map } from 'rxjs';

/**
 * 统一响应拦截器
 * 控制器/服务返回任意对象 -> 包成 { code:200, message:'success', data }
 * 二进制流(Stream) -> 原样输出(文件下载)
 * null/undefined -> { code:200, message:'success', data:null }
 *
 * 服务层统一返回纯数据(含 string,如 token),由这里统一包装。
 */
@Injectable()
export class TransformInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    return next.handle().pipe(
      map((data) => {
        if (data === undefined || data === null) {
          return { code: 200, message: 'success', data: null };
        }
        // 流(文件下载)原样输出
        if (data && typeof data === 'object' && typeof data.pipe === 'function') {
          return data;
        }
        // 其余(string/object/number/boolean)统一包装
        return { code: 200, message: 'success', data };
      })
    );
  }
}
