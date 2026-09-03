import React, { useId } from 'react';
import styles from './index.module.less';

interface FlowLightProps {
  /**
   * 单次流光动画时长（秒）
   */
  duration?: number;
  /**
   * 两轮流光之间的等待间隔（秒）
   * 通过 keyframes 实现，每轮流光跑完 duration 后再等待 delay 秒进入下一轮
   */
  delay?: number;
  /**
   * 流光高亮颜色
   */
  color?: string;
  /**
   * 流光边框粗细（px）
   */
  thickness?: number;
  /**
   * 亮带宽度（占渐变总长的百分比，如 15 表示亮带占 30%）
   */
  band?: number;
  /**
   * 流光边框圆角，需与被包裹元素的圆角保持一致
   */
  radius?: number | string;
  /**
   * 容器类名
   */
  className?: string;
  /**
   * 容器样式
   */
  style?: React.CSSProperties;
  /**
   * 被流光包裹的内容
   */
  children?: React.ReactNode;
}

/**
 * 生成带等待间隔的 keyframes
 * delay=0 时返回 null，组件走 less 里的默认 flowH/flowV
 * delay>0 时：
 *   - 总周期 cycle = duration + delay
 *   - 0% → r% 流光从右下扫到左上（r = duration/cycle）
 *   - r% → 100% 亮带淡出并停在左上等待下一轮
 */
function buildKeyframes(uid: string, duration: number, delay: number) {
  if (delay <= 0) return null;

  const cycle = duration + delay;
  const runRatio = duration / cycle;
  const runPct = (runRatio * 100).toFixed(2);

  const hName = `${uid}-h`;
  const vName = `${uid}-v`;

  const css = `
@keyframes ${hName} {
  0% { background-position: 100% 100%; }
  ${runPct}% { background-position: 0% 0%; }
  ${runPct}% { opacity: 0; }
  100% { opacity: 0; }
}
@keyframes ${vName} {
  0% { background-position: 100% 100%; }
  ${runPct}% { background-position: 0% 0%; }
  ${runPct}% { opacity: 0; }
  100% { opacity: 0; }
}
`.trim();

  return { hName, vName, css };
}

export default function FlowLight(props: FlowLightProps) {
  const {
    duration = 2.8,
    delay = 0,
    color = 'rgba(255, 255, 255, 1)',
    thickness = 4,
    band = 15,
    radius = 0,
    className,
    style,
    children
  } = props;

  // useId 保证多实例各自注入独立的 keyframes 名
  const rawUid = useId().replace(/[:]/g, '');
  const uid = `flow${rawUid}`;

  const radiusValue = typeof radius === 'number' ? `${radius}px` : radius;
  const cycle = duration + delay;

  // 通过 CSS 变量把外开属性注入流光层
  const vars = {
    '--flow-cycle': `${cycle}s`,
    '--flow-color': color,
    '--flow-thickness': `${thickness}px`,
    '--flow-band': `${band}%`,
    '--flow-radius': radiusValue
  } as React.CSSProperties;

  // delay>0 才注入带间隔的 keyframes，并用独立动画名覆盖
  const keyframes = buildKeyframes(uid, duration, delay);
  if (keyframes) {
    (vars as Record<string, string>)['--flow-name-h'] = keyframes.hName;
    (vars as Record<string, string>)['--flow-name-v'] = keyframes.vName;
  }

  return (
    <>
      {keyframes ? <style>{keyframes.css}</style> : null}
      <div className={`${styles.wrap} ${className || ''}`} style={{ ...vars, ...style }}>
        <div className={`${styles.flow} ${styles.h}`} />
        <div className={`${styles.flow} ${styles.v}`} />
        {children}
      </div>
    </>
  );
}
