/**
 * 兜底 mock 数据
 *
 * 用途:大屏接口返回为空或异常时的本地兜底,保证大屏离线/后端未就绪时仍有内容可展示。
 * 字段与后端 ResponseItem.data 对齐,不与 MockJs 拦截器混用(本仓库已不依赖 MockJs)。
 *
 * 模板占位:只保留示例分组 'demo' 的两条数据,供 ScreenLanMu 示例大屏兜底。
 * 真实项目按自己的分组(见 web/src/config/column-hall.config.ts)替换。
 */
import type { ColumnScreenGroup } from './api/screen/column';

/** 生成封面占位图(SVG data URI,135° 双色渐变),仅供 mock 兜底 */
const cover = (from: string, to: string) =>
  `data:image/svg+xml;utf8,${encodeURIComponent(
    `<svg xmlns='http://www.w3.org/2000/svg' width='800' height='450'><defs><linearGradient id='g' x1='0' y1='0' x2='1' y2='1'><stop offset='0' stop-color='${from}'/><stop offset='1' stop-color='${to}'/></linearGradient></defs><rect width='800' height='450' fill='url(#g)'/></svg>`
  )}`;

const d = (from: string, to: string, description: string, time: string) => ({
  imageUrl: cover(from, to),
  description,
  time
});

/**
 * 栏目展示 兜底分组(与大屏 UI 字段对齐)
 * 状态英文 enum 与后端一致:designing/confirming/done。
 */
export const columnSections: ColumnScreenGroup[] = [
  {
    category: 'demo',
    name: '示例分组',
    subtitle: '示例动态',
    items: [
      {
        id: 1,
        category: 'demo',
        title: '示例栏目项一',
        time: '2026-08-12',
        status: 'done',
        route: '/directory',
        sort: 1,
        enabled: true,
        images: [
          d('#1f3a5f', '#2c5f8a', '首版概念方案', '2026-07-10'),
          d('#2a5298', '#3a7bd5', '终版确认稿', '2026-08-12')
        ]
      },
      {
        id: 2,
        category: 'demo',
        title: '示例栏目项二',
        time: '2026-08-08',
        status: 'designing',
        sort: 2,
        enabled: true,
        images: [
          d('#2c5f8a', '#3a7bd5', '首版交互草图', '2026-07-25'),
          d('#2a5298', '#4a6fa5', '二版视觉稿', '2026-08-05')
        ]
      }
    ]
  }
];
