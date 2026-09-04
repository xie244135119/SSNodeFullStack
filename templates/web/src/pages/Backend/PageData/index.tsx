import React, { useEffect, useState, useCallback } from 'react';
import { Button, Table, Modal, Form, Input, Switch, Space, Tag, message } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import api from '@/services/api';
import type { PageDataItem } from '@/services/api/admin/page-data';
import styles from './index.module.less';

/**
 * 页面数据管理(后台 CRUD 示例)
 * 对接 backend page-data 模块(/api/getList|add|edit|deleteById)。
 * screenKey 关联大屏 key,section 区分同屏多区块,content 为 JSON 文本;
 * 大屏端按 screenKey+section 拉取 content 渲染(后台配置 → 大屏消费主线)。
 */
export default function PageDataManage() {
  const [list, setList] = useState<PageDataItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [screenKey, setScreenKey] = useState('');
  const [loading, setLoading] = useState(false);

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<PageDataItem | null>(null);
  const [form] = Form.useForm();
  const [saving, setSaving] = useState(false);

  const reload = useCallback(() => {
    setLoading(true);
    api.admin.pageData
      .getList({ page, pageSize, screenKey: screenKey || undefined })
      .then((res) => {
        setList(res?.data?.list || []);
        setTotal(res?.data?.total || 0);
      })
      .finally(() => setLoading(false));
  }, [page, pageSize, screenKey]);

  useEffect(() => {
    reload();
  }, [reload]);

  const openModal = (item?: PageDataItem) => {
    setEditing(item || null);
    form.setFieldsValue({
      screenKey: item?.screenKey || '',
      section: item?.section || '',
      content: item?.content || '{}',
      enabled: item?.enabled ?? true
    });
    setModalOpen(true);
  };

  const onSave = async () => {
    const values = await form.validateFields();
    // content 必须是合法 JSON(与大屏端解析约定)
    try {
      JSON.parse(values.content || '{}');
    } catch {
      message.error('配置内容必须是合法 JSON');
      return;
    }
    setSaving(true);
    try {
      if (editing) {
        await api.admin.pageData.edit({ id: editing.id, ...values });
        message.success('修改成功');
      } else {
        await api.admin.pageData.add(values);
        message.success('新增成功');
      }
      setModalOpen(false);
      reload();
    } finally {
      setSaving(false);
    }
  };

  const onDelete = (item: PageDataItem) => {
    Modal.confirm({
      title: '确认删除',
      content: `确定删除页面配置「${item.screenKey}${item.section ? ` / ${item.section}` : ''}」吗?`,
      okType: 'danger',
      onOk: async () => {
        await api.admin.pageData.deleteById(item.id);
        message.success('删除成功');
        reload();
      }
    });
  };

  const columns = [
    { title: '大屏 Key', dataIndex: 'screenKey', width: 160 },
    { title: '区块', dataIndex: 'section', width: 140, render: (v: string) => v || '-' },
    {
      title: '配置内容',
      dataIndex: 'content',
      ellipsis: true,
      render: (v: string) => <span className={styles.contentPreview}>{v}</span>
    },
    {
      title: '配置人',
      dataIndex: 'updatedBy',
      width: 110,
      render: (v: string) => v || '-'
    },
    {
      title: '启用',
      dataIndex: 'enabled',
      width: 80,
      render: (v: boolean) => (v ? <Tag color="green">是</Tag> : <Tag>否</Tag>)
    },
    {
      title: '更新时间',
      dataIndex: 'updateTime',
      width: 170,
      render: (v?: string) => (v ? dayjs(v).format('YYYY-MM-DD HH:mm') : '-')
    },
    {
      title: '操作',
      width: 140,
      fixed: 'right' as const,
      render: (_: unknown, item: PageDataItem) => (
        <Space>
          <Button type="link" size="small" icon={<EditOutlined />} onClick={() => openModal(item)}>
            编辑
          </Button>
          <Button
            type="link"
            size="small"
            danger
            icon={<DeleteOutlined />}
            onClick={() => onDelete(item)}
          >
            删除
          </Button>
        </Space>
      )
    }
  ];

  return (
    <div className={styles.container}>
      <div className={styles.toolbar}>
        <Space>
          <Input
            className={styles.searchInput}
            placeholder="按大屏 Key 筛选"
            value={screenKey}
            allowClear
            onChange={(e) => {
              setScreenKey(e.target.value);
              setPage(1);
            }}
          />
          <Button onClick={reload}>查询</Button>
        </Space>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => openModal()}>
          新增页面配置
        </Button>
      </div>
      <Table
        rowKey="id"
        loading={loading}
        columns={columns}
        dataSource={list}
        scroll={{ x: 1100 }}
        pagination={{
          current: page,
          pageSize,
          total,
          showTotal: (t) => `共 ${t} 条`,
          onChange: (p, ps) => {
            setPage(p);
            setPageSize(ps);
          }
        }}
      />
      <Modal
        title={editing ? '编辑页面配置' : '新增页面配置'}
        open={modalOpen}
        onOk={onSave}
        confirmLoading={saving}
        onCancel={() => setModalOpen(false)}
        destroyOnClose
      >
        <Form form={form} layout="vertical" className={styles.form}>
          <Form.Item
            label="大屏 Key"
            name="screenKey"
            rules={[{ required: true, message: '必填' }]}
          >
            <Input placeholder="如:main / overview(对应大屏标识)" />
          </Form.Item>
          <Form.Item label="区块" name="section" tooltip="同屏多区块时区分,可留空">
            <Input placeholder="如:top / carousel,留空表示整屏默认配置" />
          </Form.Item>
          <Form.Item
            label="配置内容(JSON)"
            name="content"
            rules={[{ required: true, message: '必填' }]}
          >
            <Input.TextArea rows={6} placeholder='{"title": "标题", "items": []}' />
          </Form.Item>
          <Form.Item label="启用" name="enabled" valuePropName="checked">
            <Switch />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
