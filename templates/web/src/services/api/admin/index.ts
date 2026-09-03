/**
 * 后台（admin）API 命名空间
 * 统一走 JWT 鉴权（request 实例，Authorization 头）。
 *
 * 与大屏（screen）的区别：admin 走 JWT，screen 走前端 HMAC 签名（appRequest）。
 *
 * 模板内置通用接口：user / captcha / upload / test / ops / userManage / auditLog
 * + 示例业务接口：column（对应 backend column 模块，可作"如何加一个业务模块"的参照）。
 * 新增业务接口：在 admin/ 下新建文件 + 在此 import & 导出。
 */
import * as user from './user';
import * as captcha from './captcha';
import * as upload from './upload';
import * as test from './test';
import * as ops from './ops';
import * as column from './column';
import * as userManage from './user-manage';
import * as auditLog from './audit-log';

export default {
  user,
  captcha,
  upload,
  test,
  ops,
  column,
  userManage,
  auditLog
};
