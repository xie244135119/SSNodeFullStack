/**
 * 大屏（screen）API 命名空间
 * 统一走前端 HMAC 签名（appRequest 实例，无 token），协议见 docs/api-security.md。
 *
 * 与后台（admin）的区别：screen 走前端签名，admin 走 JWT。
 *
 * 模板内置示例业务接口：column（对应 backend column 的 /screen 端点）。
 * 新增大屏接口：在 screen/ 下新建文件 + 在此 import & 导出，后端对应 controller 挂 @UseGuards(AppSignGuard)。
 */
import * as column from './column';

export default {
  column
};
