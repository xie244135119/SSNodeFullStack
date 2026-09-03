import Axios from 'axios';
import ProjectConfig from '../../config/project.config';

/**
 * 错误处理
 */
const errorHandle = () => {};

/**
 * 取消处理
 */
const { CancelToken } = Axios;
const source = CancelToken.source();

/**
 * 通过全局唯一实例 与默认请求做区分
 */
const axiosIntance = Axios.create({
  baseURL: '',
  timeoutErrorMessage: '网络出点小差，请稍等重试',
  withCredentials: false,
  responseType: 'json',
  cancelToken: source.token
});

/**
 * 请求处理
 */
axiosIntance.interceptors.request.use((config) => config);

/**
 * 响应处理
 * 统一返回业务体 { code, message, data }（excel 等非常规 contentType 返回完整响应）
 */
axiosIntance.interceptors.response.use(
  (res) => {
    const contentTypes = ProjectConfig.request.ignoreContentTypes;
    const contentType: string = res.headers['content-type'];
    if (contentTypes.some((item) => contentType.includes(item))) {
      return res;
    }
    return res.data;
  },
  (error) => {
    errorHandle();
    return Promise.reject(error);
  }
);

export default axiosIntance;

const webrequest = Axios.create({
  // timeout: 2*1000,
  timeoutErrorMessage: '网络出点小差，请稍等重试',
  withCredentials: false,
  responseType: 'json'
});
webrequest.interceptors.response.use((res) => res.data);

export { webrequest };
