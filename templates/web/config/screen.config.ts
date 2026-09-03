/**
 * 大屏分辨率集中声明
 * 模板默认 1 套示例大屏(栏目展示),供路由 meta 与 Screen 布局统一引用。
 * 新增大屏时,只需在此追加一项,路由与布局自动生效。
 */
export type ScreenHallKey = 'demo';

export interface ScreenConfigItem {
  /** 唯一标识 */
  key: string;
  /** 大屏名称 */
  name: string;
  /** 子路由路径（相对 /screen） */
  path: string;
  /** 对应页面组件路径（相对 src） */
  component: string;
  /** 所属分组 */
  hall: ScreenHallKey;
  /** 基准分辨率宽 */
  width: number;
  /** 基准分辨率高 */
  height: number;
}

/**
 * 大屏分组清单（菜单分组顺序）
 * 真实项目按需增删分组(如多分组/多场景)。
 */
export const ScreenHallList: { key: ScreenHallKey; name: string }[] = [
  { key: 'demo', name: '示例分组' }
];

export const ScreenList: ScreenConfigItem[] = [
  {
    key: 'lanmu',
    name: '栏目展示',
    path: '/lanmu',
    component: './pages/ScreenLanMu/LanMu/index',
    hall: 'demo',
    width: 1920,
    height: 1080
  }
];
