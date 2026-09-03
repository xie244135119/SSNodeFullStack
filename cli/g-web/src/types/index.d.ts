import { ReactNode } from 'react';

/**
 * 版本号
 */
declare let __APP_VERSION__: string;

/**
 * vite 注入的构建期环境变量(import.meta.env.*)
 * 仅 VITE_ 前缀变量会暴露给客户端代码,见 vite 文档。
 */
interface ImportMetaEnv {
  /**
   * @description 大屏 API 签名密钥(HMAC-SHA256),构建期注入 bundle,
   * 需与 backend appSign.signKey 一致;不再走 public/env.config.js 运行时文件。
   */
  readonly VITE_APP_SIGN_KEY?: string;
}
interface ImportMeta {
  readonly env: ImportMetaEnv;
}

interface Window {
  /**
   * 环境变量
   */
  ENV: {
    /**
     * @description 是否登录验证 false:跳过 默认true
     */
    checkToken: boolean;
    /**
     * @description 网络请求统一前缀，nginx配置下使用
     */
    requestBaseUrl: string;
    //
    [key: string]: any;
  };
  [propName: string]: any;
}

/**
 * 项目配置
 */
interface ProjectItem {
  /**
   * @description 标题
   */
  title: string;
  /**
   * @description 部署的目录地址 <用于二级部署目录下>
   */
  directory?: string;
  /**
   * @description 可视化大屏 配置
   */
  screenWeb?: {
    width: number;
    height: number;
  };
  /**
   * @description 后台管理系统 配置基准分辨率
   */
  backgroundWeb?: {
    width: number;
    height: number;
  };
  /**
   * @description 请求体系
   */
  request: {
    ignoreContentTypes: string[];
  };
  [key: string]: any;
}

/**
 * 路由配置
 */
interface RouteConfigItem {
  /**
   * 路由名称
   */
  name?: string;
  /**
   * 路径名称
   */
  path?: string;
  /**
   * 菜单图表
   */
  icon?: ReactNode;
  /**
   * 选中的菜单样式
   */
  selectIcon?: ReactNode;
  /**
   * 完整路径
   */
  fullPath?: string;
  /**
   * 隐藏在菜单中
   */
  hideInMenu?: boolean;
  /**
   * 权限
   */
  authorization?: string[];
  /**
   * 组件名称
   */
  component?: string;
  /**
   * 重定向地址
   */
  redirect?: string;
  /**
   * 路由元信息（如大屏分辨率、类型等）
   */
  meta?: {
    /** 大屏基准分辨率宽 */
    width?: number;
    /** 大屏基准分辨率高 */
    height?: number;
    [key: string]: any;
  };
  /**
   * 子级
   */
  children?: RouteConfigItem[];
}

declare module '*.module.less' {
  const classes: { readonly [key: string]: string };
  export default classes;
}

declare module '*.module.scss' {
  const classes: { readonly [key: string]: string };
  export default classes;
}

declare module '*.json' {
  const classes: any;
  export default classes;
}

declare module '*.png' {
  const classes: string;
  export default classes;
}

declare module '*.png?url' {
  const classes: string;
  export default classes;
}

declare module '*.jpeg' {
  const classes: string;
  export default classes;
}

declare module '*.jpg' {
  const classes: string;
  export default classes;
}

declare module '*.tiff' {
  const classes: string;
  export default classes;
}

declare module '*.bmp' {
  const classes: string;
  export default classes;
}

declare module '*.gif' {
  const classes: string;
  export default classes;
}

declare module '*.svg' {
  const classes: string;
  export default classes;
}
