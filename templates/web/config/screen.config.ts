/**
 * 大屏分辨率集中声明
 * 模板不带示例大屏(保持干净):新增大屏时在 ScreenList 追加一项、
 * ScreenHallList 按需加分组,路由与布局自动生效(router 按 ScreenHallList 展开)。
 */
export type ScreenHallKey = string;

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
export const ScreenHallList: { key: ScreenHallKey; name: string }[] = [];

export const ScreenList: ScreenConfigItem[] = [];
