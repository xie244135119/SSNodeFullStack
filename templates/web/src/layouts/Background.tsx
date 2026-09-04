import React, { useRef, useEffect, useState, useCallback, useMemo } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Menu, Avatar, Breadcrumb, ConfigProvider, Dropdown } from 'antd';
import {
  DownOutlined,
  UserOutlined,
  LogoutOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  DesktopOutlined
} from '@ant-design/icons';
import PropTypes from 'prop-types';
import dayjs from 'dayjs';
import zhCn from 'dayjs/locale/zh-cn';
import ZhCN from 'antd/locale/zh_CN';
import styles from './Background.module.less';
import RouterConfig, { getRouteByPathName } from '../../config/router.config';
import ProjectConfig from '../../config/project.config';
import api from '@/services/api';
import { RouteConfigItem } from '@/types';
import { airtableTheme } from '@/styles/theme';

dayjs.locale(zhCn);

/**
 * 面包屑
 * @param {*} route
 * @param {*} params
 * @returns
 */
function BreadcrumbRoute({ route }) {
  const { title = '', path = '' } = route;
  return (
    <a href={path} key={path} style={{ color: 'unset' }}>
      {title}
    </a>
  );
}

BreadcrumbRoute.propTypes = {
  route: PropTypes.object
};

BreadcrumbRoute.defaultProps = {
  route: null
};

export default function BackgroundLayout() {
  //
  const location = useLocation();
  const navigate = useNavigate();
  const backgroundElementRef = useRef<HTMLDivElement>();
  // 左侧菜单
  const [menus, setMenus] = useState<RouteConfigItem[]>([]);
  // 侧栏折叠状态
  const [collapsed, setCollapsed] = useState(false);

  // 滑块菜单配置
  const [sliderMenuConfig, setSliderMenuConfig] = useState({
    selectKeys: [],
    openKeys: []
  });

  /**
   * 面包屑
   */
  const BreadcrumbRenderItem = useCallback(
    (route) => (
      <a key={route.path} href={route.path} style={{ color: 'unset', fontSize: 16 }}>
        {route.title}
      </a>
    ),
    []
  );

  /**
   * 渲染菜单图标
   * route.icon / route.selectIcon 在配置中以字符串路径形式声明(指向 public/files 下 svg)。
   * svg 内部用 currentColor 描边/填充,这里用 CSS mask + background:currentColor 渲染,
   * 使图标随菜单文字色变化(未选中灰、选中白),避免 <img> 那样拿到固定黑色。
   */
  const renderRouteIcon = useCallback(
    (route: RouteConfigItem, selected: boolean) => {
      const src = (selected && route.selectIcon) || route.icon;
      if (!src) return undefined;
      if (typeof src !== 'string') return src;
      return (
        <i
          className={styles.menuIcon}
          style={{
            maskImage: `url(${src})`,
            WebkitMaskImage: `url(${src})`
          }}
        />
      );
    },
    []
  );

  //
  useEffect(() => {
    const { routes } = getRouteByPathName(location.pathname);
    const openRoutes = [...routes];
    openRoutes.pop();
    setSliderMenuConfig({
      openKeys: openRoutes.map((item) => item.fullPath),
      selectKeys: routes.map((item) => item.fullPath)
    });
  }, [location.pathname]);

  useEffect(() => {
    // 只取「系统」下的「后台管理系统」那一支,大屏(/screen)不在后台菜单展示
    const systemRoute = RouterConfig.find((item) => item.name === '系统');
    const bgRoute = systemRoute?.children?.find((item) => item.name === '后台管理系统');
    // 后台管理系统是 AuthLayout 包裹的 Background 布局,其 children 才是实际菜单项
    const bgLayoutRoute = bgRoute?.children?.find((item) => item.name === '后台管理系统');
    setMenus(bgLayoutRoute?.children || []);
  }, []);

  /**
   * 面包屑层级与左侧菜单保持一致:
   * 在菜单树(menus)中找到当前路径对应的节点链,作为面包屑。
   * 这样面包屑只展示菜单里真正可见的层级,不会掺入布局包裹层(系统/AuthLayout/Background)。
   */
  const breadcrumbRoutes = useMemo(() => {
    const findMenuPath = (
      items: RouteConfigItem[],
      targetPath: string,
      acc: RouteConfigItem[] = []
    ): RouteConfigItem[] | null =>
      items
        .filter((it) => it.name && !it.hideInMenu)
        .reduce<RouteConfigItem[] | null>((found, it) => {
          if (found) return found;
          const cur = [...acc, it];
          if (it.fullPath === targetPath) return cur;
          if (it.children?.length) {
            const r = findMenuPath(it.children, targetPath, cur);
            if (r) return r;
          }
          return null;
        }, null);
    return findMenuPath(menus, location.pathname) || [];
  }, [menus, location.pathname]);

  /**
   * 渲染菜单Items
   */
  const getMenuItems = (menus: RouteConfigItem[], target: RouteConfigItem[] = []) =>
    menus
      .filter((item) => item.name && !item.hideInMenu)
      .map((item) => {
        const selected = sliderMenuConfig.selectKeys.includes(item.fullPath);
        const hasVisibleChildren =
          item.children?.filter((c) => c.name && !c.hideInMenu).length > 0;
        return hasVisibleChildren
          ? {
            key: item.fullPath,
            icon: renderRouteIcon(item, selected),
            label: item.name,
            children: getMenuItems(item.children, [...target, item])
          }
          : {
            key: item.fullPath,
            icon: renderRouteIcon(item, selected),
            label: item.name
          };
      });

  const userDropdownItems = [
    {
      key: 'logout',
      label: '退出系统',
      icon: <LogoutOutlined />,
      onClick: () => {
        api.admin.user.logout().then((res) => {
          if (res) {
            navigate(`/login?redirect=${encodeURIComponent(location.pathname + location.search)}`);
          }
        });
      }
    }
  ];

  return (
    <ConfigProvider locale={ZhCN} theme={airtableTheme}>
      <div style={{ width: '100vw', height: '100vh' }}>
        <div className={styles.background} ref={backgroundElementRef}>
          {/* 顶部导航 */}
          <div className={styles.header}>
            <img className={styles.logo} alt="logo" src="/logo.svg" />
            <span className={styles.logotext}>{ProjectConfig.title}</span>
            <div style={{ flex: 1 }} />
            <div className={styles.userview}>
              <span className={styles.version}>{__APP_VERSION__}</span>
              {/* 进入大屏侧入口:版本号右侧图标,当前页路由跳转 /screen */}
              <button
                type="button"
                className={styles.screenEntry}
                title="进入大屏"
                onClick={() => navigate('/screen')}
              >
                <DesktopOutlined />
              </button>
              <Dropdown
                menu={{
                  items: userDropdownItems
                }}
              >
                <div className={styles.userInfo}>
                  <Avatar
                    style={{ backgroundColor: 'transparent', border: '2px solid #d1d1d1' }}
                    icon={<UserOutlined />}
                  />
                  <span style={{ margin: '0 10px' }}>admin</span>
                  <DownOutlined />
                </div>
              </Dropdown>
            </div>
          </div>

          {/* 菜单视图 */}
          <div className={styles.bottom}>
            {/* 左侧菜单 */}
            <div
              className={styles.slider}
              style={{ width: collapsed ? 64 : 240 }}
            >
              <div className={styles.menuWrap}>
                <Menu
                  mode="inline"
                  inlineCollapsed={collapsed}
                  items={getMenuItems(menus)}
                  onSelect={(item) => {
                    navigate(item.key);
                  }}
                  selectedKeys={sliderMenuConfig.selectKeys}
                  openKeys={collapsed ? [] : sliderMenuConfig.openKeys}
                  onOpenChange={(keys) => {
                    setSliderMenuConfig({
                      ...sliderMenuConfig,
                      openKeys: keys
                    });
                  }}
                />
              </div>
              {/* 折叠/收起 按钮 */}
              <div
                className={styles.sliderFooter}
                onClick={() => setCollapsed((v) => !v)}
                role="button"
                tabIndex={0}
              >
                {collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
                {!collapsed && <span className={styles.collapseText}>收起菜单</span>}
              </div>
            </div>
            <div className={styles.right}>
              <div className={styles.route}>
                <Breadcrumb
                  items={breadcrumbRoutes.map((item) => ({
                    key: item.name,
                    title: item.name,
                    path: item.fullPath
                  }))}
                  className={styles.breadcrumb}
                  itemRender={BreadcrumbRenderItem}
                />
              </div>
              <div className={styles.contentview}>
                <Outlet />
              </div>
            </div>
          </div>
        </div>
      </div>
    </ConfigProvider>
  );
}
