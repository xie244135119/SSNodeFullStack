import React, { useEffect, useState } from 'react';
import { ConfigProvider, Tag } from 'antd';
import { useNavigate } from 'react-router-dom';
import ZhCN from 'antd/locale/zh_CN';
import {
  CalendarOutlined,
  EyeOutlined,
  ArrowRightOutlined,
  SettingOutlined
} from '@ant-design/icons';
import { airtableTheme } from '@/styles/theme';
import { COLUMN_STATUS_MAP } from '@/config/column-hall.config';
import ImagePreview from '@/components/ImagePreview';
import api from '@/services/api';
import { columnSections as fallbackSections } from '@/services/mock';
import type { ColumnScreenGroup } from '@/services/api/screen/column';
import type { ColumnItem } from '@/services/api/admin/column';
import styles from './index.module.less';

/** 顶部日期 YYYY-MM-DD(客户端当天) */
function formatToday(): string {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

/**
 * 栏目展示 大屏
 * 基准分辨率 1920×1080,缩放由 layouts/Screen 统一处理。
 * 走 airtable 浅色主题(本页局部 ConfigProvider,不污染其它大屏深色风格)。
 * 数据来自后端 /api/column/screen(前端 HMAC 签名);空/失败回退 mock 兜底。
 */

function ColumnCard({ item }: { item: ColumnItem }) {
  const [previewVisible, setPreviewVisible] = useState(false);
  const [previewIndex, setPreviewIndex] = useState(0);
  const navigate = useNavigate();

  const total = item.images?.length || 0;
  const statusMeta = COLUMN_STATUS_MAP[item.status] || { label: item.status, color: 'default' };

  const handleEnter = () => {
    if (item.route) {
      navigate(item.route);
    }
  };

  return (
    <div className={styles.card}>
      <div className={styles.cover}>
        {total > 0 && (
          <img
            className={styles.coverImg}
            src={item.images![0].imageUrl}
            alt={item.images![0].description || item.title}
          />
        )}
        <span className={styles.coverTag}>{total}套</span>
        {!!item.resolution && (
          <span className={styles.coverResolution}>{item.resolution}</span>
        )}
        <span className={styles.statusTag}>
          <Tag color={statusMeta.color}>{statusMeta.label}</Tag>
        </span>
        {/* hover 蒙层 */}
        <div className={styles.coverMask}>
          <button
            type="button"
            className={styles.maskBtn}
            onClick={() => {
              setPreviewIndex(0);
              setPreviewVisible(true);
            }}
          >
            <EyeOutlined />
            <span>预览</span>
          </button>
          {item.route && (
            <button type="button" className={styles.maskBtn} onClick={handleEnter}>
              <ArrowRightOutlined />
              <span>进入</span>
            </button>
          )}
        </div>
      </div>
      <div className={styles.cardBody}>
        <div className={styles.cardTitle} title={item.title}>
          {item.title}
        </div>
        <div className={styles.cardTime}>
          <CalendarOutlined />
          <span>{item.time}</span>
        </div>
      </div>

      {/* 图片预览器(全屏蒙层 + 描述/时间顶部浮层),由 [预览] 按钮受控触发 */}
      <ImagePreview
        images={item.images || []}
        visible={previewVisible}
        onVisibleChange={setPreviewVisible}
        current={previewIndex}
        onCurrentChange={setPreviewIndex}
      />
    </div>
  );
}

export default function SJScreenLanMuIndex() {
  const navigate = useNavigate();
  // 取消默认数据展示:接口未返回前留空,失败才回退 mock 兜底
  const [sections, setSections] = useState<ColumnScreenGroup[]>([]);

  // 顶部日期:客户端当天(展示用)
  const today = formatToday();

  useEffect(() => {
    api.screen.column
      .screenList()
      .then((res) => {
        const data = res?.data;
        if (data && data.length) {
          setSections(data);
        }
      })
      .catch(() => {
        // 仅失败时回退 mock 兜底
        setSections(fallbackSections);
      });
  }, []);

  return (
    <ConfigProvider locale={ZhCN} theme={airtableTheme}>
      <div className={styles.page}>
        {/* 顶部品牌栏 */}
        <div className={styles.header}>
          <div className={styles.brand}>
            <div className={styles.brandBar} />
            <div className={styles.brandText}>
              <div className={styles.brandTitle}>栏目展示</div>
              <div className={styles.brandSub}>示例大屏 · 端到端数据接入</div>
            </div>
          </div>
          <div className={styles.headerRight}>
            <div className={styles.headerDate}>{today}</div>
            {/* 进入后台管理入口:低调图标,不影响大屏展示 */}
            <button
              type="button"
              className={styles.adminEntry}
              title="进入后台管理"
              onClick={() => navigate('/background')}
            >
              <SettingOutlined />
            </button>
          </div>
        </div>

        {/* 栏目区(上下结构,一级标题 → 区块网格) */}
        <div className={styles.sections}>
          {sections.map((section) => (
            <section className={styles.section} key={section.category}>
              <div className={styles.sectionHeader}>
                <div className={styles.sectionBar} />
                <div className={styles.sectionTitle}>{section.name}</div>
                <div className={styles.sectionSubtitle}>{section.subtitle}</div>
                <div className={styles.sectionLine} />
              </div>
              <div className={styles.grid}>
                {section.items.map((item) => (
                  <ColumnCard key={item.id} item={item} />
                ))}
              </div>
            </section>
          ))}
        </div>
      </div>
    </ConfigProvider>
  );
}
