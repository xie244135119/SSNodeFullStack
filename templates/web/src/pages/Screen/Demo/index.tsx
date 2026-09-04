import React, { useMemo } from 'react';
import BaseChart from '@/components/Chart/base';
import FlowLight from '@/components/FlowLight';
import {
  getBaseBarChartOption,
  getPieChartOption,
  getBarAndLineOption
} from '@/static/Template/ScreenChartOption';
import styles from './index.module.less';

/**
 * 静态示例大屏(纯前端、零接口)
 *
 * 展示大屏框架能力:1920×1080 绝对布局 + Screen 布局的 transform:scale 自适配
 * (分辨率由路由 meta 携带)+ Chart/FlowLight 通用组件 + 大屏图表配置模板
 * (static/Template/ScreenChartOption)。
 * 真实大屏:复制本页面改造,数据从 services/api 拉取(大屏接口走 appRequest 签名)。
 */
export default function ScreenDemo() {
  // 静态数据:真实项目改为接口拉取
  const barOption = useMemo(() => getBaseBarChartOption(), []);
  const pieOption = useMemo(
    () =>
      getPieChartOption({
        series: [
          {
            name: '占比',
            data: [
              { name: '在线', value: 86 },
              { name: '离线', value: 9 },
              { name: '维护', value: 5 }
            ]
          }
        ]
      }),
    []
  );
  const barLineOption = useMemo(() => getBarAndLineOption(), []);

  return (
    <div className={styles.screen}>
      <header className={styles.header}>
        <FlowLight duration={4} delay={2}>
          <div className={styles.headerInner}>
            <h1 className={styles.title}>示例大屏 · SSNodeFullStack</h1>
            <span className={styles.subtitle}>静态数据 · 纯前端 · 1920×1080</span>
          </div>
        </FlowLight>
      </header>

      <main className={styles.body}>
        <section className={styles.panel}>
          <h2 className={styles.panelTitle}>月度趋势</h2>
          <BaseChart className={styles.chart} chartOption={barOption} />
        </section>

        <section className={`${styles.panel} ${styles.panelCenter}`}>
          <h2 className={styles.panelTitle}>运行状态</h2>
          <BaseChart className={styles.chart} chartOption={pieOption} />
          <ul className={styles.metrics}>
            <li>
              <span className={styles.metricLabel}>在线率</span>
              <span className={styles.metricValue}>86%</span>
            </li>
            <li>
              <span className={styles.metricLabel}>告警数</span>
              <span className={styles.metricValue}>3</span>
            </li>
            <li>
              <span className={styles.metricLabel}>今日请求</span>
              <span className={styles.metricValue}>12,806</span>
            </li>
          </ul>
        </section>

        <section className={styles.panel}>
          <h2 className={styles.panelTitle}>吞吐与响应</h2>
          <BaseChart className={styles.chart} chartOption={barLineOption} />
        </section>
      </main>
    </div>
  );
}
