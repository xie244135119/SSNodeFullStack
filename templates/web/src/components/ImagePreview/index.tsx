/**
 * 图片预览器(通用组件)
 *
 * 封装 AntD Image.PreviewGroup 全屏蒙层 + 当前版「描述 + 时间」顶部浮层,
 * 供后台列表与大屏栏目页共用,统一预览交互与文字浮层位置。
 *
 * 两种触发方式:
 * 1. 外部受控(大屏栏目页:由 [预览] 按钮触发,所有图 1px 隐藏,仅承载预览器)
 *    传 visible / onVisibleChange / current / onCurrentChange,不传 thumbnailSrc。
 * 2. 自带缩略图(后台列表行:点缩略图打开)
 *    传 thumbnailSrc,可见性/索引由组件内部自管。
 */
import React, { useState, type CSSProperties, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Image } from 'antd';
import { CalendarOutlined } from '@ant-design/icons';
import styles from './index.module.less';

export interface ImagePreviewImage {
  imageUrl: string;
  description?: string;
  time?: string;
}

export interface ImagePreviewProps {
  images: ImagePreviewImage[];
  /** 受控可见(外部按钮触发用);不传则组件内部自管 */
  visible?: boolean;
  onVisibleChange?: (v: boolean) => void;
  /** 受控当前索引;不传则内部自管 */
  current?: number;
  onCurrentChange?: (i: number) => void;
  /** 缩略图 src(传入则渲染可点击缩略图,点击打开预览);不传则全部隐藏,纯靠外部 visible 触发 */
  thumbnailSrc?: string;
  thumbnailSize?: { width: number; height: number };
  thumbnailStyle?: CSSProperties;
  /** 无图时占位 */
  emptyText?: ReactNode;
}

/** 受控/非受控状态合一:传 controlled 则受控,否则用内部 state */
function useControlledState<T>(
  controlled: T | undefined,
  onChange: ((v: T) => void) | undefined,
  defaultVal: T
) {
  const [internal, setInternal] = useState<T>(defaultVal);
  const isControlled = controlled !== undefined;
  const value = isControlled ? (controlled as T) : internal;
  const setValue = (next: T | ((prev: T) => T)) => {
    const v = typeof next === 'function' ? (next as (p: T) => T)(value) : next;
    if (!isControlled) setInternal(v);
    onChange?.(v);
  };
  return [value, setValue] as const;
}

export default function ImagePreview({
  images,
  visible,
  onVisibleChange,
  current,
  onCurrentChange,
  thumbnailSrc,
  thumbnailSize = { width: 48, height: 32 },
  thumbnailStyle,
  emptyText = '-'
}: ImagePreviewProps) {
  const [vis, setVis] = useControlledState(visible, onVisibleChange, false);
  const [idx, setIdx] = useControlledState(current, onCurrentChange, 0);

  if (!images?.length) return <span>{emptyText}</span>;

  const cur = images[idx] || images[0];
  // 有缩略图时,缩略图(=images[0])承载首图,其余隐藏;无缩略图时全部隐藏。
  const restFrom = thumbnailSrc ? 1 : 0;

  return (
    <>
      <Image.PreviewGroup
        preview={{
          visible: vis,
          onVisibleChange: setVis,
          current: idx,
          onChange: setIdx
        }}
      >
        {thumbnailSrc && (
          <Image
            src={thumbnailSrc}
            width={thumbnailSize.width}
            height={thumbnailSize.height}
            style={{
              objectFit: 'cover',
              borderRadius: 6,
              cursor: 'pointer',
              ...thumbnailStyle
            }}
          />
        )}
        <div className={styles.host}>
          {images.slice(restFrom).map((im) => (
            <Image
              key={im.imageUrl + (im.description || '')}
              src={im.imageUrl}
              alt={im.description}
              width={1}
              height={1}
              style={{ display: 'block' }}
            />
          ))}
        </div>
      </Image.PreviewGroup>

      {/* 当前版描述 + 时间浮层(同步预览器索引,叠在蒙层上方,顶部)
          用 Portal 挂到 body:AntD PreviewGroup 的蒙层本身也 Portal 到 body,
          同处一个层叠上下文,z-index 才能压过蒙层;否则在 /screen 等带
          transform: scale 的祖先下,fixed 会被困进缩放容器、蒙层盖住文字。 */}
      {vis &&
        cur &&
        createPortal(
          <div className={styles.caption}>
            <span className={styles.captionDesc}>{cur.description}</span>
            <span className={styles.captionTime}>
              <CalendarOutlined />
              <span>{cur.time}</span>
            </span>
          </div>,
          document.body
        )}
    </>
  );
}
