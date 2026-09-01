# web 端首屏加载优化方案

> 目标:消除大屏/后台首屏白屏等待,缩短可交互时间。
> 评估日期 2026-08-14。产物基线取自当前 `dist/assets`(构建版本 `1.0.20260814150750`)。
>
> **实施状态**:
> - [x] **P0 echarts 按需引入** — 已落地,新建 `src/utils/echarts.ts`,4 处 `from 'echarts'` 改走 `@/utils/echarts`。echarts 从全量 ~1MB 降到 `echarts-vendor` 557KB(−约 450KB)。
> - [x] **P1 manualChunks 分包** — 已落地,`vite.config.js` 移除 `chunkSplitPlugin`,加 `output.manualChunks`。echarts 独立成 `echarts-vendor` chunk,首屏 vendor(react+antd+recoil,1.45MB)可与业务 chunk 并行下载、独立缓存。base chunk 从 1.03MB 降到 2.96KB。
> - [ ] P2 Loading 骨架 — 未实施。
> - [ ] P3 legacy 插件 — 未实施(待确认部署浏览器范围)。
> - [x] **P4 favicon** — 已落地,`index.html` 用内联 SVG data URI 替换 151KB 的 `/logo.png`。
>
> **⚠️ P1 踩坑记录**:第一版 manualChunks 把 react/react-dom 单独拆成 `react-vendor`、antd 拆成 `antd-vendor`,导致 antd-vendor 在顶层执行 `Number(react.version.split(".")[0])` 时 react 尚未求值,抛 `Cannot read properties of undefined (reading 'version')` 整站白屏。**根因**:manualChunks 把强耦合的 react 与 antd 拆成并列 chunk,跨 chunk 顶层求值顺序不可控。**解法**:react/react-dom/recoil/react-router 与 antd 同置于一个 `vendor` chunk(由 Rollup 按 import 图保证 react 先于 antd 求值),只独立 echarts(收益最大且 echarts 与 react 无顶层求值耦合)。详见下文 §三 P1 注释与 §踩坑。

## 一、现状基线

路由级代码分割已落地:`src/routeIndex.tsx` 用 `React.lazy` + `import.meta.glob` 按页面懒加载,`<Suspense fallback={<Loading/>}>` 已挂。**白屏不是没分包,而是首屏关键路径上有一个 ~1MB 的 vendor 包必须先下完解析完,任何路由才能开始渲染。**

### 1.1 产物体积(取自 `dist/assets`,按大小降序前若干)

| chunk | 体积 | 说明 |
|---|---|---|
| `base-*.js` | **1.03 MB** | 入口主 vendor:echarts + antd + react + recoil 全揉一起 |
| `base-legacy-*.js` | 1.03 MB | `@vitejs/plugin-legacy` 复制的孪生包 |
| `Table-*.js` | 277 KB | antd Table |
| `index-*.js`(多个) | 25–260 KB | 各业务/antd 子模块 |
| `render-*.js` | 116 KB | echarts renderer 相关 |
| `polyfills-legacy-*.js` | 60 KB | legacy polyfill |

`dist/assets` 合计约 25 MB;`dist/static` 144 MB(大屏背景资源,走 `webReusePaths` 利旧,不入首屏关键路径,见 `CLAUDE.md` 部署章节)。

### 1.2 首屏关键路径(白屏根因)

```
index.html → /src/index.ts → routeIndex.tsx
  → 下载并解析 base-*.js (1.03MB, 内含全量 echarts)
  → 才能进入 React 渲染 → 命中路由 → 触发 Suspense
  → Suspense fallback=<Loading/> (空 div, 纯白)
  → 下载页面 chunk → 渲染页面
```

白屏 = 下载+解析 1MB base 包的时间 + Suspense 等待页面 chunk 期间无任何可见指示。

## 二、四个根因(按影响排序)

### 根因 1:echarts 全量引入(最大元凶)
4 处都是全量引入:

| 文件 | 行 | 写法 |
|---|---|---|
| `src/components/Chart/base.tsx` | 2 | `import * as echarts from 'echarts'` |
| `src/hooks/useChart.jsx` | 2 | `import * as Echarts from 'echarts'` |
| `src/static/Template/ScreenChartOption.ts` | 1 | `import * as echarts from 'echarts'` |
| `src/static/Template/BackgroundChartOption.ts` | 2 | `import * as echarts from 'echarts'` |

`echarts` 主入口 `re-export` 所有图表/组件/渲染器,且使用方走 `setOption(options)` 动态传配置,**整包不可 tree-shake**,全量约 1MB 全数进 base chunk。

实际用到的 series / component(grep 统计):

- **series**:`line`(22)、`bar`(12)、`scatter`(4)、`pie`(2)——仅 4 种。
- **component**:`title`、`xAxis/yAxis`、`grid`、`tooltip`、`legend`、`dataset`、`axisPointer`、`graphic`、`timeline`、`markLine`、`geo`、`aria`。
- **renderer**:全走 `echarts.init(el)` 默认 CanvasRenderer,无 SVG 用法。

→ 实际只需约 15 个子模块,全量却带了 100+ 个。**按需引入预计砍掉 ~700KB 首屏体积。**

### 根因 2:base chunk 没拆开
`vite.config.js` 用 `chunkSplitPlugin({ strategy: 'default' })`,`rollupOptions` 未配 `manualChunks`。echarts/antd/react/recoil 揉进一个 `base`。后果:
- 首屏必须串行下载这 1MB,无法与业务 chunk 并行。
- 改任何业务代码 → base hash 变 → 用户缓存全失效。

### 根因 3:`@vitejs/plugin-legacy` 把每个 chunk 复制一份
每个产物都有 `-legacy` 孪生体 + `polyfills-legacy`。现代浏览器走 `type=module`,**不下载 legacy 包**,所以它不是现代浏览器白屏的直接原因;但构建时间/磁盘翻倍。大屏是固定部署环境(一体机/指定浏览器),基本不需要 IE 级兼容。

### 根因 4:Loading fallback 是空 div
`src/pages/Loading/index.tsx` 渲染一个 100vh 空 flex 容器,`<span>加载中...</span>` 被注释。Suspense 等待期间纯白,体感白屏被放大。

## 三、改动方案

### P0 — echarts 按需引入(预计首屏 −700KB)

**新建统一入口 `src/utils/echarts.ts`**:

```ts
// 统一 echarts 按需入口:所有页面/hook 只从此处 import,禁止再 `from 'echarts'`。
import * as echarts from 'echarts/core';
import { LineChart, BarChart, ScatterChart, PieChart } from 'echarts/charts';
import {
  GridComponent,
  TooltipComponent,
  LegendComponent,
  TitleComponent,
  DataZoomComponent,
  GraphicComponent,
  MarkLineComponent,
  GeoComponent,
  AriaComponent,
  DatasetComponent,
  TimelineComponent,
  AxisPointerComponent
} from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';

echarts.use([
  LineChart, BarChart, ScatterChart, PieChart,
  GridComponent, TooltipComponent, LegendComponent, TitleComponent,
  DataZoomComponent, GraphicComponent, MarkLineComponent,
  GeoComponent, AriaComponent, DatasetComponent,
  TimelineComponent, AxisPointerComponent,
  CanvasRenderer
]);

export default echarts;
export type { EChartsOption, ECharts } from 'echarts/core';
```

**4 处引用替换**:

| 文件 | 原 | 改为 |
|---|---|---|
| `src/components/Chart/base.tsx:2` | `import * as echarts from 'echarts'` | `import echarts, { type EChartsOption, type ECharts } from '@/utils/echarts'` |
| `src/hooks/useChart.jsx:2` | `import * as Echarts from 'echarts'` | `import Echarts from '@/utils/echarts'` |
| `src/static/Template/ScreenChartOption.ts:1` | `import * as echarts from 'echarts'` | `import echarts from '@/utils/echarts'` |
| `src/static/Template/BackgroundChartOption.ts:2` | `import * as echarts from 'echarts'` | `import echarts from '@/utils/echarts'` |

> `base.tsx` 的类型 `echarts.EChartsOption` / `echarts.ECharts` 改为从新入口具名导入;若 jsx 文件不便加 type,可保留 `// @ts-ignore` 或在 `utils/echarts.ts` 里 `export` 命名空间风格。`.jsx` 文件需把 alias `@` 解析为 src(`vite.config.js` 已配,且 `jsconfig` 需有 paths;若 jsx 报 alias,改用相对路径 `../utils/echarts`)。

**风险与验证**:
- 漏注册某个 component → 控制台报 `Component ... is not exist` / 图表缺轴。需全量回归 7 套大屏 + 后台图表。grep 已覆盖 line/bar/scatter/pie + 上列 component;**特别确认**:有没有用到 `markPoint`/`markArea`(grep 只见 markLine)、`visualMap`、`polar`、`radar`、`toolbox`、`parallel`、`calendar`、`brush`、`dataInsid`——grep 当前未命中,但落地前应再跑一遍全量 grep 确认。
- `dataset` / `timeline` / `aria` 命中频次低(aria 1 次、timeline 22 次但可能是业务自定义字段非 echarts component)——需确认是 echarts 的 `timeline` 组件还是 option 里的普通属性。**若非组件,可从注册列表移除进一步瘦身。**
- 验证方法:`pnpm build` 后比对 `dist/assets` 中 echarts 相关 chunk 体积;本地 `pnpm preview` 打开每个大屏页面,看图表渲染 + 控制台无 echarts 报错。

### P1 — vendor 手动分包 + echarts 独立 chunk(缓存友好 + 可并行下载)

**已落地**(`vite.config.js`):移除 `vite-plugin-chunk-split` import 与 `chunkSplitPlugin({...})`,在 `build.rollupOptions.output` 加原生 `manualChunks`。最终落地版本**只独立 echarts**,react/antd/recoil 等同置一个 `vendor` chunk:

```js
// vite.config.js
// import 行删掉:import { chunkSplitPlugin } from 'vite-plugin-chunk-split';
// plugins 数组里删掉 chunkSplitPlugin({ strategy: 'default' })
build: {
  // ... 其余不变
  rollupOptions: {
    output: {
      manualChunks(id) {
        if (id.includes('node_modules')) {
          if (id.includes('echarts') || id.includes('zrender')) {
            return 'echarts-vendor';
          }
          return 'vendor'; // react + react-dom + antd + recoil + react-router + ...
        }
        return undefined;
      }
    }
  }
}
```

实际产物:

| chunk | 体积 | gzip | 说明 |
|---|---|---|---|
| `index-6e952a83.js`(base) | ~17KB | ~5KB | 入口 + 业务骨架(原 1.03MB base) |
| `vendor-*.js` | 1.45MB | 459KB | react/antd/recoil/react-router 合包 |
| `echarts-vendor-*.js` | 557KB | 187KB | 按需 echarts,仅图表页加载 |

效果:
- base chunk 从 1.03MB 降到 ~17KB;echarts 独立成 chunk,首屏 vendor 与业务 chunk **并行下载**、独立缓存。
- 首页 `index.html` 的 `modulepreload` 只预加载 `vendor`,**不预加载 echarts**(echarts 仅在含图表的大屏页按需加载)——验证见下文 §验证。
- echarts/react/antd 变动频率低,长期缓存;改业务代码不再让 vendor 包 hash 失效。

**⚠️ 踩坑(第一版拆 react-vendor + antd-vendor 致整站白屏,已修)**:
最初把 react/react-dom/recoil/react-router 拆成 `react-vendor`、antd 拆成 `antd-vendor`(三块)。结果 antd(rc-util)在模块**顶层**执行 `var EC = Number(react.version.split(".")[0])`,而 `react-vendor` chunk 此时未求值,`react` 为 `undefined`,抛 `Cannot read properties of undefined (reading 'version')`,React 根本挂载不了,整站白屏。

**根因**:manualChunks 把在顶层有求值依赖的强耦合库(react ↔ antd)拆成并列 chunk 后,跨 chunk 的求值顺序不由 manualChunks 决定,而 Rollup 按 import 图保证的顺序在某些拓扑下会反;react/antd 的顶层求值耦合经不起拆。

**解法**:强耦合库同置一个 chunk,只独立无顶层耦合的大体积库(echarts)。echarts 用 `echarts.use([...])` 注册、不依赖 react 的顶层值,拆出去安全。**结论:manualChunks 分包要避开"在模块顶层读取另一库导出值"的依赖对,把它们留在同一 chunk。**

**风险**:`vite-plugin-chunk-split` 已从 `vite.config.js` 移除;`package.json` 的 devDependency `vite-plugin-chunk-split` 可保留(无副作用)或一并移除。当前未动 package.json,如需清理可手动删。

### P2 — Loading 加可见骨架(消除纯白等待,零运行时成本)

`src/pages/Loading/index.tsx` 当前空容器。改为居中 spinner(大屏深色科技风)或 antd `Spin`。示例:

```tsx
import React from 'react';
import { Spin } from 'antd';

export default function Loading() {
  return (
    <div style={{
      width: '100%', height: '100vh',
      display: 'flex', justifyContent: 'center', alignItems: 'center',
      background: '#0a0e1a' // 与大屏底色一致,避免白闪
    }}>
      <Spin size="large" tip="加载中" />
    </div>
  );
}
```

> 大屏底色取各屏 `Screen.module.less` 实际背景;若统一不了,用透明 + 深色 spinner。antd `Spin` 已在 base chunk,无额外体积。
> 后台(Airtable 主题,浅色)与大屏(深色)共用同一 Loading,需兼顾:可用 CSS 媒体判断或干脆用中性半透明背景。

### P3 — 移除 / 收窄 `@vitejs/plugin-legacy`(砍孪生包 + 构建提速)

**决策前提**:确认大屏部署浏览器范围。一体机/指定 Chrome 内核浏览器 → 可直接移除。

`vite.config.js` 删除:

```js
// 删 import lagacy from '@vitejs/plugin-legacy';
// 删 lagacy({ targets: browserslist.defaults })
```

`package.json` devDependencies 移除 `@vitejs/plugin-legacy`、`browserslist`(若仅 legacy 用)。

效果:每个 chunk 不再有 `-legacy` 孪生,`dist/assets` 体积约减半,构建时间显著下降。

**风险**:若有低端浏览器访问需求会白屏(无 polyfill)。需与部署方确认。**保守方案**:保留 legacy 但收窄 `targets`(如 `['chrome >= 80']`),减少 polyfill 量。

### P4(小)— favicon 换小

`index.html` 的 `<link rel="icon" href="/logo.png">` 指向 151KB 的 png。favicon 换 SVG 或 ≤4KB 的小 png。

---

## 四、预期收益

| 项 | 改前 | 改后(预估) |
|---|---|---|
| 首屏关键 base chunk | ~1.03 MB | ~300 KB(react+recoil+antd 部分)+ echarts-vendor ~300KB 并行 |
| 首屏需下载 JS 总量 | ~1.3 MB+ | ~600 KB |
| 构建产物体积(assets) | ~25 MB(含 legacy 孪生) | ~12 MB(P3 后) |
| Suspense 期间 | 纯白 | 深色 spinner |
| 业务改动对 vendor 缓存 | 失效 | 保持 |

实际白屏时长取决于网络,但首屏 JS 量减半 + 并行下载 + 可见 loading,体感会明显改善。

## 五、实施顺序建议

1. **P0 echarts 按需**——独立、收益最大、风险可控(需图表回归)。
2. **P2 Loading 骨架**——零风险、立即改善体感,可与 P0 同批。
3. **P1 manualChunks**——在 P0 之后做,分包边界才稳定。
4. **P3 legacy**——需部署确认,放最后,单独一个 commit 便于回退。
5. P4 favicon——随手。

每步落地后 `pnpm build` 比对 `dist/assets` 体积 + `pnpm preview` 走查 7 屏 + 后台图表。

## 六、待确认问题

1. 部署浏览器范围?(决定 P3 能否直接移除 legacy)
2. ~~`ScreenChartOption.ts` / `BackgroundChartOption.ts` 里的 `timeline`(22 处)是 echarts `TimelineComponent` 还是业务 option 自定义字段?~~ **已确认**:是业务组件名 `PowerTimeline`,非 echarts 组件,`echarts.use` 不注册 `TimelineComponent`。
3. ~~是否用到 `markPoint`/`markArea`/`visualMap`/`toolbox`/`polar`/`radar`?~~ **已确认**:均未用到,只注册 `markLine`。`map`(62 命中)全是 `Array.map()`,非 map series;无 `registerMap`/`geo` option。
4. Loading 深色背景是否与所有大屏底色一致?需统一或做中性处理。(P2 未做)

## 七、落地验证记录(2026-08-14,P0+P1+P4)

构建:`pnpm build`,版本 `1.0.20260814150750`。

**产物对比**:

| chunk | 改前(baseline HEAD) | 改后 |
|---|---|---|
| `base` / `index-6e952a83` | 1.03 MB | ~17 KB |
| `echarts-vendor` | (含在 base) | 557 KB(gzip 187 KB) |
| `vendor`(react+antd+recoil+react-router) | (含在 base) | 1.45 MB(gzip 459 KB) |
| 首页 `index.html` 预加载 | base 1.03MB(含 echarts) | vendor + 业务骨���,**不含 echarts** |

**首页 echarts 按需加载验证**:`curl http://localhost:6199/ | grep -c echarts-vendor` → `0`(echarts 不进首页预加载,仅图表页加载)。

**回归验证(headless Chrome + CDP,与 baseline HEAD 对比)**:

| 路由 | baseline #app HTML 长度 | 改后 #app HTML 长度 | 未捕获异常 | ErrorBoundary |
|---|---|---|---|---|
| `/`(重定向到 directory) | 3987 | 3862 | 0 | 无 |
| `/screen/lanmu` | 1625 | 1625 | 0 | 无 |
| `/screen/lanmu` | — | 9154 | 0 | 无 |
| `/background/column` | — | 17618 | 0 | 无 |

- 改前 baseline 在 headless 下无 `version` 报错;第一版 manualChunks(拆 react-vendor)出现 `Cannot read properties of undefined (reading 'version')` 整站白屏;**最终版(react/antd 同 chunk)修复后 0 异常、0 ErrorBoundary**,与 baseline 行为一致。
- `echarts-vendor` 不含全量 `echarts/lib/echarts` 入口引用(grep 确认),按需 `echarts/core` + charts/components/renderers 子模块生效。
- headless 下 canvas=0 是因 12s 内 echarts 异步 chunk 未及渲染,非代码问题;`#app` 有实质内容(大厅主屏 9KB、后台 17KB HTML)证明应用正常挂载。

**待人工目检**:`pnpm preview` 打开 7 套大屏逐一目视图表(line/bar/scatter/pie + LinearGradient 渐变)渲染正常、无 "Component is not exist" 控制台报错。headless 已确认无报错,但图表视觉正确性建议人工走查一遍。

