/**
 * API 入口（barrel）
 *
 * 业务接口按鉴权方式拆分:
 *  - admin/  : 后台管理接口,走 JWT(request 实例,Authorization 头)
 *  - screen/ : 大屏消费接口,走前端 HMAC 签名(appRequest 实例,无 token,协议见 docs/api-security.md)
 * 通用工具(common / mysql)与请求基础设施(request / app-request)留在 services 根目录,不归入两者。
 */
import { message } from 'antd';
import request, { webrequest } from './request';
// 业务接口:后台(JWT)/ 大屏(前端签名)
import admin from './api/admin';
import screen from './api/screen';
// 通用工具(与鉴权无关)
import * as common from './api/common';
import * as mysql from './api/mysql';

request.defaults.baseURL = window.ENV.requestBaseUrl;
request.defaults.validateStatus = (status) => {
  if (status === 401) {
    message.info('登录失效，请重新登录');
    if (window.location.pathname !== '/login') {
      // window.location.href = `${ProjectConfig.directory}/login?redirect=${encodeURIComponent(
      //   window.location.pathname.replace(ProjectConfig.directory, '') + window.location.search
      // )}`;
    }
  }
  return status >= 200 && status < 300;
};
request.interceptors.response.use(
  (res: { [key: string]: any }) => {
    // 统一响应体 { code, message, data }，非 200 视为业务失败
    if (res && res.code !== undefined && res.code !== 200) {
      message.error(res.message || res.msg || '请求失败，请重试');
    }
    return res;
  },
  (e) => {
    message.error(`${e?.message}(${decodeURIComponent(e.request?.responseURL)})`, 5);
  }
);

/**
 * @description 更新请求 Token
 * token 为裸 JWT,统一加 Bearer 前缀
 */
export const updateRequestToken = (token: string) => {
  const auth = token ? (token.startsWith('Bearer ') ? token : `Bearer ${token}`) : token;
  request.defaults.headers.Authorization = auth;
  webrequest.defaults.headers.Authorization = auth;
};

// 启动时恢复已存 token(admin 走 JWT)
updateRequestToken(admin.user.getAuthorization());

export default {
  // 后台管理接口(JWT)
  admin,
  // 大屏消费接口(前端 HMAC 签名)
  screen,
  // 通用工具(与鉴权无关)
  common,
  // 本地配置数据(xlsx)
  mysql
};
