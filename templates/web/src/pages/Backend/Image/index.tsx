import React, { useEffect, useState, useCallback } from 'react';
import { Button, Table, Modal, Form, Input, Space, Upload, message } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, UploadOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import api from '@/services/api';
import { UPLOAD_MAX_SIZE } from '@/services/api/admin/upload';
import type { ImageItem } from '@/services/api/admin/image';
import ImagePreview from '@/components/ImagePreview';
import styles from './index.module.less';

/** 文件大小格式化 */
const fmtSize = (bytes: number) => {
  if (!bytes) return '-';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
};

/**
 * 图片管理(后台 CRUD 示例:上传 + 预览 + 改名 + 删除)
 * 对接 backend image 模块(/api/image/*)+ upload 模块(/api/upload)。
 * 流程:Upload 选图 → /api/upload 上传拿 url → /api/image/add 登记 → 列表展示。
 * 删除时后端同步删物理文件(UploadService.delete 按 url 反查)。
 * 预览用与大屏同款 ImagePreview 组件(全屏蒙层,可多图翻页)。
 */
export default function ImageManage() {
  const [list, setList] = useState<ImageItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(12);
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);

  const [renameOpen, setRenameOpen] = useState(false);
  const [renaming, setRenaming] = useState<ImageItem | null>(null);
  const [form] = Form.useForm();
  const [saving, setSaving] = useState(false);

  const reload = useCallback(() => {
    setLoading(true);
    api.admin.image
      .getList({ page, pageSize, name: name || undefined })
      .then((res) => {
        setList(res?.data?.list || []);
        setTotal(res?.data?.total || 0);
      })
      .finally(() => setLoading(false));
  }, [page, pageSize, name]);

  useEffect(() => {
    reload();
  }, [reload]);

  const onUpload = async (file: File) => {
    // 大小守卫:与 backend upload.maxSize 一致,超限前端拦截不发请求
    if (file.size > UPLOAD_MAX_SIZE) {
      message.error(`图片大小不能超过 ${Math.round(UPLOAD_MAX_SIZE / 1024 / 1024)}MB`);
      return false;
    }
    setUploading(true);
    try {
      const res = await api.admin.upload.upload(file);
      if (res?.data?.url) {
        // 上传成功后登记记录(默认名取文件名,后续可改名)
        await api.admin.image.add({
          name: res.data.filename || file.name,
          url: res.data.url,
          size: res.data.size ?? file.size
        });
        message.success('上传成功');
        reload();
      }
    } finally {
      setUploading(false);
    }
    return false; // 阻止 antd 默认上传
  };

  const openRename = (item: ImageItem) => {
    setRenaming(item);
    form.setFieldsValue({ name: item.name });
    setRenameOpen(true);
  };

  const onRename = async () => {
    const values = await form.validateFields();
    if (!renaming) return;
    setSaving(true);
    try {
      await api.admin.image.edit({ id: renaming.id, name: values.name });
      message.success('改名成功');
      setRenameOpen(false);
      reload();
    } finally {
      setSaving(false);
    }
  };

  const onDelete = (item: ImageItem) => {
    Modal.confirm({
      title: '确认删除',
      content: `确定删除图片「${item.name}」吗?物理文件将一并删除。`,
      okType: 'danger',
      onOk: async () => {
        await api.admin.image.deleteById(item.id);
        message.success('删除成功');
        reload();
      }
    });
  };

  /** 列表行预览:与大屏同款 ImagePreview(点击缩略图全屏预览,可翻页) */
  const RowPreview = ({ item }: { item: ImageItem }) => (
    <ImagePreview
      images={[{ imageUrl: item.url, description: item.name }]}
      thumbnailSrc={item.url}
      thumbnailSize={{ width: 56, height: 40 }}
    />
  );

  const columns = [
    {
      title: '预览',
      dataIndex: 'url',
      width: 90,
      render: (_: string, item: ImageItem) => <RowPreview item={item} />
    },
    { title: '名称', dataIndex: 'name', ellipsis: true },
    {
      title: '地址',
      dataIndex: 'url',
      width: 260,
      ellipsis: true,
      render: (v: string) => <span className={styles.urlText}>{v}</span>
    },
    { title: '大小', dataIndex: 'size', width: 100, render: (v: number) => fmtSize(v) },
    {
      title: '上传时间',
      dataIndex: 'createTime',
      width: 170,
      render: (v?: string) => (v ? dayjs(v).format('YYYY-MM-DD HH:mm') : '-')
    },
    {
      title: '操作',
      width: 140,
      fixed: 'right' as const,
      render: (_: unknown, item: ImageItem) => (
        <Space>
          <Button type="link" size="small" icon={<EditOutlined />} onClick={() => openRename(item)}>
            改名
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
            placeholder="按名称搜索"
            value={name}
            allowClear
            onChange={(e) => {
              setName(e.target.value);
              setPage(1);
            }}
          />
          <Button onClick={reload}>查询</Button>
        </Space>
        <Upload
          showUploadList={false}
          beforeUpload={onUpload}
          accept=".jpg,.jpeg,.png,.webp,.gif"
        >
          <Button type="primary" icon={<UploadOutlined />} loading={uploading}>
            上传图片
          </Button>
        </Upload>
      </div>
      <Table
        rowKey="id"
        loading={loading}
        columns={columns}
        dataSource={list}
        scroll={{ x: 1000 }}
        pagination={{
          current: page,
          pageSize,
          total,
          showTotal: (t) => `共 ${t} 张`,
          onChange: (p, ps) => {
            setPage(p);
            setPageSize(ps);
          }
        }}
      />
      <Modal
        title="图片改名"
        open={renameOpen}
        onOk={onRename}
        confirmLoading={saving}
        onCancel={() => setRenameOpen(false)}
        destroyOnClose
      >
        <Form form={form} layout="vertical" className={styles.form}>
          <Form.Item label="名称" name="name" rules={[{ required: true, message: '必填' }]}>
            <Input placeholder="图片显示名" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
