import React, { useEffect, useMemo, useRef } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Button } from 'antd';
import styles from './Screen.module.less';
import { getRouteByPathName } from '../../config/router.config';

/**
 * 可视化大屏布局：
 * 不再依赖全局唯一的 ProjectConfig.screenWeb 基准分辨率，
 * 改为从当前匹配路由的 meta.width / meta.height 读取，
 * 以 transform: scale 自适配父容器。
 * 未匹配到大屏页面时，回退到 ProjectConfig.screenWeb（兼容旧配置）。
 */
import ProjectConfig from '../../config/project.config';

const DEFAULT_WIDTH = ProjectConfig.screenWeb?.width ?? 1920;
const DEFAULT_HEIGHT = ProjectConfig.screenWeb?.height ?? 1080;

/**
 * 自适应压缩阈值：仅当视口宽度超过该值时才对大屏进行等比缩放，
 * 避免在较小屏幕上压缩导致内容糊化或布局错乱。
 */
const COMPRESS_THRESHOLD = 1600;

export default function ScreenLayout() {
  const backgroundElementRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const location = useLocation();

  // 通过当前 url 解析路由链，取叶子路由的 meta 分辨率
  const { width, height } = useMemo(() => {
    const { routes } = getRouteByPathName(location.pathname);
    const leaf = routes[routes.length - 1];
    const meta = leaf?.meta;
    if (meta?.width && meta?.height) {
      return { width: meta.width, height: meta.height };
    }
    return { width: DEFAULT_WIDTH, height: DEFAULT_HEIGHT };
  }, [location.pathname]);

  useEffect(() => {
    const observer = new ResizeObserver(() => {
      if (!backgroundElementRef.current) {
        return;
      }
      const { parentElement } = backgroundElementRef.current;
      if (!parentElement) {
        return;
      }
      // 仅当大屏宽度超过阈值时才压缩，且只按宽度比例缩放（高度随之自适应），避免宽高被分别拉伸。
      if (width <= COMPRESS_THRESHOLD) {
        backgroundElementRef.current.style.transform = 'none';
        return;
      }
      const widthScale = parentElement.offsetWidth / width;
      backgroundElementRef.current.style.transform = `scale(${widthScale})`;
    });
    observer.observe(backgroundElementRef.current.parentElement);
    return () => {
      observer.disconnect();
    };
  }, [width, height]);

  return (
    <div style={{ width: '100vw', height: '100vh' }}>
      <div
        className={styles.background}
        style={{ width, height }}
        ref={backgroundElementRef}
      >
        <div className={styles.layoutcontentview}>
          <Outlet />
        </div>
        {/* <Button
          size="large"
          style={{ position: 'absolute', bottom: 50, right: 50 }}
          type="primary"
          onClick={() => {
            navigate('/directory');
          }}
        >
          返回工程目录
        </Button> */}
      </div>
    </div>
  );
}
