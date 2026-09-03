import React, { useEffect, useState, useCallback } from 'react';
import { Card, Table, Tag, Space, Input, Button } from 'antd';
import { ReloadOutlined, SearchOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import api from '@/services/api';
import type { AuditLogItem } from '@/services/api/admin/audit-log';
import styles from './index.module.less';

/**
 * 日志管理页(只读审计日志,admin-only,后台轨 JWT)
 *
 * 数据源:audit_log 表,记录登录成功/失败、用户增删改等操作。
 * 不含接口报错(本期不做)。
 */
const ACTION_LABEL: Record<string, string> = {
  login_success: '登录成功',
  login_fail: '登录失败',
  user_create: '新增用户',
  user_update: '修改用户',
  user_delete: '删除用户',
  user_reset_pwd: '重置密码',
  user_toggle_status: '切换状态'
};

const ACTION_COLOR: Record<string, string> = {
  login_success: 'green',
  login_fail: 'red',
  user_delete: 'red',
  user_reset_pwd: 'orange'
};

export default function AuditLog() {
  const [list, setList] = useState<AuditLogItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [size, setSize] = useState(20);
  const [actorName, setActorName] = useState('');
  const [action, setAction] = useState('');

  const reload = useCallback(() => {
    setLoading(true);
    api.admin.auditLog
      .listAuditLogs({
        page,
        size,
        actorName: actorName || undefined,
        action: action || undefined
      })
      .then((res) => {
        if (res.code === 200 && res.data) {
          setList(res.data.list);
          setTotal(res.data.total);
        }
      })
      .finally(() => setLoading(false));
  }, [page, size, actorName, action]);

  useEffect(() => {
    reload();
  }, [reload]);

  return (
    <Card
      title="日志管理"
      extra={
        <Space>
          <Input
            allowClear
            placeholder="操作者筛选"
            value={actorName}
            onChange={(e) => setActorName(e.target.value)}
            style={{ width: 160 }}
          />
          <Input
            allowClear
            placeholder="动作筛选(如 login_success)"
            value={action}
            onChange={(e) => setAction(e.target.value)}
            style={{ width: 200 }}
          />
          <Button
            icon={<SearchOutlined />}
            onClick={() => {
              setPage(1);
              reload();
            }}
          >
            搜索
          </Button>
          <Button icon={<ReloadOutlined />} onClick={reload} />
        </Space>
      }
    >
      <Table
        rowKey="id"
        loading={loading}
        dataSource={list}
        size="small"
        pagination={{
          current: page,
          pageSize: size,
          total,
          showSizeChanger: true,
          onChange: (p, s) => {
            setPage(p);
            setSize(s);
          }
        }}
        columns={[
          { title: 'ID', dataIndex: 'id', width: 70 },
          { title: '操作者', dataIndex: 'actorName', width: 140 },
          {
            title: '动作',
            dataIndex: 'action',
            width: 120,
            render: (v: string) => (
              <Tag color={ACTION_COLOR[v]}>{ACTION_LABEL[v] || v}</Tag>
            )
          },
          {
            title: '详情',
            dataIndex: 'detail',
            render: (v: string) => (
              <span style={{ wordBreak: 'break-all' }}>{v}</span>
            )
          },
          { title: 'IP', dataIndex: 'ip', width: 140 },
          {
            title: '时间',
            dataIndex: 'createTime',
            width: 180,
            render: (v: string) => (v ? dayjs(v).format('YYYY-MM-DD HH:mm:ss') : '-')
          }
        ]}
      />
    </Card>
  );
}
