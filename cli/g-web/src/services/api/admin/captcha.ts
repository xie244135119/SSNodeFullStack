import request from '../../request';

/**
 * 验证码 API（admin，走 JWT）
 * backend /api/user/captcha 返回 { captchaId, svg }
 *
 * 注：admin/user.ts 内亦有 getCaptcha（登录页用 api.admin.user.getCaptcha），
 * 此处保留独立模块以备后端将验证码从 /user 抽离时复用。
 */
export function getCaptcha(): Promise<ResponseItem<{ captchaId: string; svg: string }>> {
  return request.get('/api/user/captcha');
}
