import React, { useEffect, useState, useCallback } from 'react';
import { Card, Button, Table, Tag, Space, Empty, Spin, Tooltip, message } from 'antd';
import { ReloadOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import api from '@/services/api';
import type {
  OpsProbeResult,
  OpsStatusDetail,
  OpsTableDetail,
  OpsLogDetail
} from '@/services/api/admin/ops';
import styles from './index.module.less';

/**
 * 运维监控页（只读）
 *
 * 数据驱动渲染：拉 /api/ops/overview 拿到探针数组，按 probe.kind 分发到对应卡片。
 *   - status → 状态卡（健康灯 + items 键值列表）
 *   - table  → 明细表（columns + rows，后端给列定义）
 *   - log    → 日志尾（只读文本行）
 *
 * 后端新增探针（B 阶段）只要返回已有 kind，本页自动多一张卡片，无需改前端。
 * 全部只读，无任何写入 / 触发按钮。
 */
export default function OpsMonitor() {
  const [probes, setProbes] = useState<OpsProbeResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshingKey, setRefreshingKey] = useState<string | null>(null);

  const reload = useCallback(() => {
    setLoading(true);
    api.admin.ops
      .overview()
      .then((res) => setProbes(res?.data || []))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  // 单探针刷新（点卡片右上角刷新按钮）
  const refreshOne = useCallback((key: string) => {
    setRefreshingKey(key);
    api.admin.ops
      .probe(key)
      .then((res) => {
        const one = res?.data;
        if (!one) return;
        setProbes((prev) => prev.map((p) => (p.key === key ? one : p)));
      })
      .finally(() => setRefreshingKey(null));
  }, []);

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <span className={styles.title}>运维监控</span>
        <Space>
          <span className={styles.updated}>
            数据更新于 {probes.length ? dayjs(probes[0].collectedAt).format('YYYY-MM-DD HH:mm:ss') : '--'}
          </span>
          <Button icon={<ReloadOutlined />} onClick={reload} loading={loading}>
            全部刷新
          </Button>
        </Space>
      </div>

      <Spin spinning={loading && probes.length === 0}>
        {probes.length === 0 && !loading ? (
          <Empty description="暂无探针数据" />
        ) : (
          <div className={styles.cards}>
            {probes.map((p) => (
              <ProbeCard
                key={p.key}
                probe={p}
                loading={refreshingKey === p.key}
                onRefresh={() => refreshOne(p.key)}
              />
            ))}
          </div>
        )}
      </Spin>
    </div>
  );
}

// ── 探针卡片：按 kind 分发 ──
function ProbeCard({
  probe,
  loading,
  onRefresh
}: {
  probe: OpsProbeResult;
  loading: boolean;
  onRefresh: () => void;
}) {
  return (
    <Card
      className={styles.card}
      title={
        <Space>
          <HealthTag healthy={probe.healthy} />
          <span>{probe.name}</span>
        </Space>
      }
      extra={
        <Space size={8}>
          <span className={styles.summary}>{probe.summary}</span>
          <Tooltip title="刷新">
            <Button type="text" size="small" icon={<ReloadOutlined />} loading={loading} onClick={onRefresh} />
          </Tooltip>
        </Space>
      }
    >
      <ProbeBody probe={probe} />
    </Card>
  );
}

// 健康灯
function HealthTag({ healthy }: { healthy: boolean | 'unknown' }) {
  if (healthy === true) return <Tag color="success">正常</Tag>;
  if (healthy === false) return <Tag color="error">异常</Tag>;
  return <Tag color="default">未知</Tag>;
}

// 按 kind 分发：新增 kind 才需在此加 case（B 阶段若引入新 kind）
function ProbeBody({ probe }: { probe: OpsProbeResult }) {
  const d = probe.detail;
  if (d.kind === 'status') return <StatusBody detail={d} />;
  if (d.kind === 'table') return <TableBody detail={d} />;
  if (d.kind === 'log') return <LogBody detail={d} />;
  return <Empty description={`未知类型: ${probe.kind}`} />;
}

// status：键值列表
function StatusBody({ detail }: { detail: OpsStatusDetail }) {
  return (
    <div className={styles.statusItems}>
      {detail.items.map((it) => (
        <div className={styles.statusRow} key={it.label}>
          <span className={styles.statusLabel}>{it.label}</span>
          <span className={styles.statusValue}>{it.value}</span>
        </div>
      ))}
    </div>
  );
}

// table：明细表（列定义来自后端）
function TableBody({ detail }: { detail: OpsTableDetail }) {
  const columns = detail.columns.map((c) => ({
    title: c.title,
    dataIndex: c.key,
    key: c.key,
    render: (v: string | number) => (typeof v === 'number' && c.key === 'mainBytes' ? formatBytes(v) : String(v))
  }));
  return (
    <Table
      size="small"
      rowKey={(r) => String(r.dirName ?? r.ts)}
      columns={columns}
      dataSource={detail.rows}
      pagination={detail.rows.length > 10 ? { pageSize: 10 } : false}
    />
  );
}

// log：只读文本尾
function LogBody({ detail }: { detail: OpsLogDetail }) {
  if (detail.lines.length === 0) {
    return <Empty description="无日志" />;
  }
  return (
    <pre className={styles.logBox}>
      {detail.lines.map((line, i) => (
        <div key={i} className={line.includes('❌') || line.includes('ALERT') ? styles.logErr : undefined}>
          {line}
        </div>
      ))}
    </pre>
  );
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / 1024 ** i).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}
