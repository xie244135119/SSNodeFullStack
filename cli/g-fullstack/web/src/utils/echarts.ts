/**
 * echarts 按需入口（统一聚合点）
 *
 * 全项目禁止再 `import * as echarts from 'echarts'`（全量入口，约 1MB，
 * 进首屏 base chunk 致白屏）。一律从本文件 import，仅注册实际用到的
 * 图表/组件/渲染器，tree-shake 掉未用部分。
 *
 * 当前用到：
 *  - 图表：line / bar / scatter / pie
 *  - 组件：grid / tooltip / legend / title / dataset / axisPointer / graphic / markLine
 *  - 渲染器：canvas
 *
 * 新增图表类型或组件时，在此处补注册对应模块即可，使用方无需改动。
 * 命名空间兼容：re-export 自 echarts/core，故 echarts.init / echarts.use /
 * echarts.graphic.LinearGradient / echarts.EChartsOption / echarts.ECharts 均可用，
 * 原有 `import * as echarts from 'echarts'` 写法只需把来源换成本文件。
 */
import * as echarts from 'echarts/core';
import { LineChart, BarChart, ScatterChart, PieChart } from 'echarts/charts';
import {
  GridComponent,
  TooltipComponent,
  LegendComponent,
  TitleComponent,
  DatasetComponent,
  AxisPointerComponent,
  GraphicComponent,
  MarkLineComponent
} from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';

echarts.use([
  // 图表
  LineChart,
  BarChart,
  ScatterChart,
  PieChart,
  // 组件
  GridComponent,
  TooltipComponent,
  LegendComponent,
  TitleComponent,
  DatasetComponent,
  AxisPointerComponent,
  GraphicComponent,
  MarkLineComponent,
  // 渲染器
  CanvasRenderer
]);

// echarts/core 仅具名导出（init/use/graphic/EChartsOption 等），无 default。
// 这里把上面 `import * as echarts` 的命名空间对象作为 default 导出，
// 并透传其全部具名绑定，使使用方两种写法都成立：
//   import * as echarts from '@/utils/echarts'   ← 命名空间，echarts.init / echarts.graphic 可用
//   import echarts from '@/utils/echarts'        ← 默认，同上
export * from 'echarts/core';
export default echarts;
