import path from 'path-browserify';
import React from 'react';
import { UserOutlined, FileTextOutlined } from '@ant-design/icons';
import { ScreenList, ScreenHallList } from './screen.config';

const RouterConfig: RouteConfigItem[] = [
  {
    path: '/',
    redirect: '/screen/lanmu'
  },
  {
    path: '/directory',
    name: '工程目录',
    component: './pages/directory/index'
  },
  {
    path: '/components',
    name: '前端组件库',
    component: './pages/directory/component'
  },
  {
    name: '登录',
    path: '/login',
    hideInMenu: true,
    component: './pages/Login/index'
  },
  {
    name: '系统',
    path: '/',
    children: [
      {
        name: '可视化大屏',
        path: '/screen',
        component: './layouts/Screen',
        children: [
          {
            path: '/',
            redirect: './lanmu'
          },
          // 大屏页面路由按分组维度展开（分辨率基准由 meta 携带，Screen 布局按需读取）
          ...ScreenHallList.map((hall) => ({
            name: hall.name,
            children: ScreenList.filter((item) => item.hall === hall.key).map((item) => ({
              name: item.name,
              path: item.path,
              hideInMenu: false,
              component: item.component,
              meta: {
                width: item.width,
                height: item.height,
                key: item.key
              }
            }))
          })),
          {
            component: './pages/404'
          }
        ]
      },
      {
        name: '后台管理系统',
        path: '/background',
        component: './layouts/AuthLayout',
        children: [
          {
            component: './layouts/Background',
            path: '/',
            name: '后台管理系统',
            children: [
              {
                path: '/',
                redirect: '/column'
              },
              {
                path: './column',
                name: '栏目管理',
                icon: React.createElement(FileTextOutlined),
                component: './pages/Backend/Column/index'
              },
              {
                name: '运维管理',
                path: './yunwei',
                children: [
                  {
                    name: '运维监控',
                    path: './ops',
                    icon: React.createElement(FileTextOutlined),
                    component: './pages/Backend/Maintenance/Ops/index'
                  },
                  {
                    name: '用户管理',
                    path: './user-manage',
                    icon: React.createElement(UserOutlined),
                    component: './pages/Backend/Maintenance/UserManage/index'
                  },
                  {
                    name: '日志管理',
                    path: './audit-log',
                    icon: React.createElement(FileTextOutlined),
                    component: './pages/Backend/Maintenance/AuditLog/index'
                  }
                ]
              },
              {
                component: './pages/404'
              }
            ]
          }
        ]
      }
    ]
  },
  {
    component: './pages/404'
  }
];

const recursion = (routes: RouteConfigItem[], targetResault: RouteConfigItem[] = []) => {
  for (let index = 0; index < routes.length; index++) {
    const route = routes[index];
    if (route.path) {
      // 分组节点可无 path（如 screen 分组），按空串参与 join 防止 undefined 崩溃
      route.fullPath = path.join(...[...targetResault, route].map((item) => item.path || ''));
    }
    if (route.children) {
      recursion(route.children, [...targetResault, route]);
    }
  }
};
recursion(RouterConfig);

/**
 * 根据 url地址 获取路由项目列表
 * @param urlPath url地址
 */
export const getRouteByPathName = (
  urlPath: string
): { urlPath: string; routes: RouteConfigItem[] } => {
  const recursion = (routes: RouteConfigItem[], targetResault = []) => {
    for (let index = 0; index < routes.length; index++) {
      const route = routes[index];
      if (route.fullPath === urlPath) {
        return [...targetResault, route];
      }
      if (route.children) {
        const childresault = recursion(route.children, [...targetResault, route]);
        if (childresault.length > 0) {
          return childresault;
        }
      }
    }
    return [];
  };
  const resault = recursion(RouterConfig);
  return {
    urlPath,
    routes: resault
  };
};
export default RouterConfig;
