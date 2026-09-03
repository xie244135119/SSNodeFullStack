import { updateRequestToken } from '../../api';
import request from '../../request';

// 登录方式 密码登录(password) or 单点登录(sso)
const STORAGE_LOGIN_TYPE = 'login_type';
// 存储 key 值
const STORAGE_TOKEN_KEY = 'storage_usertoken';

/**
 *  储存用户Token
 * @param type 登录类型
 * @param token 令牌字符串
 */
const setToken = (type: 'password' | 'sso', token: string) => {
  localStorage.setItem(STORAGE_LOGIN_TYPE, type);
  if (type === 'sso') {
    sessionStorage.setItem(STORAGE_TOKEN_KEY, token);
  } else if (type === 'password') {
    localStorage.setItem(STORAGE_TOKEN_KEY, token);
  }
  updateRequestToken(token ? `Bearer ${token}` : token);
};

/**
 * 取出 token（存储的是完整 Authorization 头值）
 */
const getToken = () => {
  const type = localStorage.getItem(STORAGE_LOGIN_TYPE);
  switch (type) {
    case 'password':
      return localStorage.getItem(STORAGE_TOKEN_KEY);
    case 'sso':
      return sessionStorage.getItem(STORAGE_TOKEN_KEY);
    default:
      return '';
  }
};

/**
 * 登录接口 /api/login
 * 入参含验证码 captchaId + verifycode
 * 后端返回 { code, message, data } data 为 JWT token
 */
export function login(params: {
  username: string;
  password: string;
  captchaId: string;
  verifycode: string;
}): Promise<boolean> {
  return request.post('/api/login', params).then((res: ResponseItem) => {
    if (res.code === 200 && res.data) {
      setToken('password', res.data);
      return true;
    }
    return false;
  });
}

/**
 * 单点登录 /api/ssologin
 */
export function ssoLogin(params: { [key: string]: any }): Promise<boolean> {
  if (!params || Object.keys(params).length === 0) {
    return Promise.resolve(false);
  }
  return request.get('/api/ssologin', { params }).then((res: ResponseItem) => {
    if (res.code === 200 && res.data) {
      setToken('sso', res.data);
      return true;
    }
    return false;
  });
}

/**
 * 获取身份认证信息（Authorization 头）
 */
export function getAuthorization() {
  return getToken();
}

/**
 * 判断是否登录 /api/user/islogin
 * 后端返回 { code, message, data: { login, permission } }
 */
export function isLogin(): Promise<{
  login: boolean;
  permission: boolean;
}> {
  return request.get('/api/user/islogin').then((res: ResponseItem) => ({
    login: res.code === 200 && res.data?.login,
    permission: res.code === 200 && res.data?.permission
  }));
}

/**
 * 获取验证码 /api/user/captcha
 * 返回 { captchaId, svg } svg 为 SVG 字符串
 */
export function getCaptcha(): Promise<{ captchaId: string; svg: string }> {
  return request
    .get('/api/user/captcha')
    .then((res: ResponseItem) => res.data || { captchaId: '', svg: '' });
}

/**
 * 获取用户信息 /api/user/info
 */
export function getInfo(): Promise<{ [key: string]: any }> {
  return request.get('/api/user/info').then((res: ResponseItem) => {
    if (res.code === 200) {
      return {
        status: 'SUCCESS',
        data: res.data
      };
    }
    return { status: 'FAIL' };
  });
}

/**
 * 退出登录 /api/user/logout
 */
export function logout(): Promise<boolean> {
  return request.post('/api/user/logout').then((res: ResponseItem) => res.code === 200).finally(() => {
    localStorage.removeItem(STORAGE_TOKEN_KEY);
    updateRequestToken(null);
  });
}
