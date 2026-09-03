import React, { useEffect, useState, useCallback } from 'react';
import {
  Button,
  Table,
  Modal,
  Form,
  Input,
  InputNumber,
  Switch,
  Space,
  Tabs,
  Upload,
  Tag,
  Image as AntImage,
  Select,
  DatePicker,
  message
} from 'antd';
import type { FormListFieldData, FormInstance } from 'antd';
import {
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
  UploadOutlined,
  MinusCircleOutlined
} from '@ant-design/icons';
import dayjs from 'dayjs';
import api from '@/services/api';
import { UPLOAD_MAX_SIZE } from '@/services/api/admin/upload';
import type { ColumnItem, ColumnImageItem } from '@/services/api/admin/column';
import {
  COLUMN_HALLS,
  COLUMN_STATUS_OPTIONS,
  COLUMN_STATUS_MAP
} from '@/config/column-hall.config';
import ImagePreview from '@/components/ImagePreview';
import styles from './index.module.less';

type ImageForm = Omit<ColumnImageItem, 'time'> & {
  uid?: string;
  time?: dayjs.Dayjs | string;
};

let uidSeq = 0;
const nextUid = () => `_${++uidSeq}`;

const toFormImages = (images?: ColumnImageItem[]): ImageForm[] =>
  (images || []).map((im) => ({
    ...im,
    uid: nextUid(),
    time: im.time ? dayjs(im.time) : undefined
  }));

/** 单行设计稿:图 + 描述 + 时间 + 排序。imageUrl 用 useWatch 响应式刷新预览。 */
function ImageRow({
  field,
  form,
  onRemove
}: {
  field: FormListFieldData;
  form: FormInstance;
  onRemove: () => void;
}) {
  const imageUrl = Form.useWatch(['images', field.name, 'imageUrl'], form) as string | undefined;
  const [uploading, setUploading] = useState(false);

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
        form.setFieldValue(['images', field.name, 'imageUrl'], res.data.url);
        message.success('上传成功');
      }
    } finally {
      setUploading(false);
    }
    return false;
  };

  return (
    <div className={styles.imageRow} key={field.key}>
      <div className={styles.imageUpload}>
        {imageUrl ? (
          <AntImage
            src={imageUrl}
            width={64}
            height={40}
            style={{ objectFit: 'cover', borderRadius: 6 }}
          />
        ) : (
          <span className={styles.imagePlaceholder}>未上传</span>
        )}
        <Upload
          showUploadList={false}
          beforeUpload={onUpload}
          accept=".jpg,.jpeg,.png,.webp,.gif"
        >
          <Button size="small" loading={uploading} icon={<UploadOutlined />}>
            {imageUrl ? '换图' : '上传'}
          </Button>
        </Upload>
      </div>
      <Form.Item label="描述" name={[field.name, 'description']} className={styles.imageField}>
        <Input placeholder="该版描述" size="small" />
      </Form.Item>
      <Form.Item label="时间" name={[field.name, 'time']} className={styles.imageField}>
        <DatePicker size="small" style={{ width: 130 }} />
      </Form.Item>
      <Form.Item label="排序" name={[field.name, 'sort']} className={styles.imageFieldSort}>
        <InputNumber size="small" min={0} style={{ width: 70 }} />
      </Form.Item>
      <Form.Item name={[field.name, 'imageUrl']} hidden>
        <Input />
      </Form.Item>
      <MinusCircleOutlined className={styles.removeIcon} onClick={onRemove} />
    </div>
  );
}

/** 列表行图片预览:与大屏同款 ImagePreview(全屏蒙层 + 描述/时间顶部浮层) */
function RowPreview({ images }: { images?: ColumnImageItem[] }) {
  if (!images?.length) return <>-</>;
  return <ImagePreview images={images} thumbnailSrc={images[0].imageUrl} />;
}

export default function ColumnManage() {
  const [list, setList] = useState<ColumnItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [keyword, setKeyword] = useState('');
  const [category, setCategory] = useState<string>('');
  const [loading, setLoading] = useState(false);

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<ColumnItem | null>(null);
  const [form] = Form.useForm();
  const [saving, setSaving] = useState(false);

  const reload = useCallback(() => {
    setLoading(true);
    api.admin.column
      .list({ page, pageSize, keyword, category: category || undefined })
      .then((res) => {
        setList(res?.data?.list || []);
        setTotal(res?.data?.total || 0);
      })
      .finally(() => setLoading(false));
  }, [page, pageSize, keyword, category]);

  useEffect(() => {
    reload();
  }, [reload]);

  const openModal = (item?: ColumnItem) => {
    setEditing(item || null);
    form.setFieldsValue({
      category: item?.category || category || COLUMN_HALLS[0].key,
      title: item?.title || '',
      time: item?.time ? dayjs(item.time) : undefined,
      status: item?.status || 'designing',
      route: item?.route || '',
      resolution: item?.resolution || '',
      sort: item?.sort ?? 0,
      enabled: item?.enabled ?? true,
      images: toFormImages(item?.images)
    });
    setModalOpen(true);
  };

  const onSave = async () => {
    const values = await form.validateFields();
    const dto = {
      category: values.category,
      title: values.title,
      time: values.time ? dayjs(values.time).format('YYYY-MM-DD') : '',
      status: values.status,
      route: values.route || null,
      resolution: values.resolution || null,
      sort: values.sort ?? 0,
      enabled: values.enabled ?? true,
      images: (values.images || []).map((im: ImageForm, idx: number) => ({
        imageUrl: im.imageUrl,
        description: im.description || '',
        time: im.time ? dayjs(im.time).format('YYYY-MM-DD') : '',
        sort: im.sort ?? idx
      }))
    };
    setSaving(true);
    try {
      if (editing) {
        await api.admin.column.update(editing.id, dto);
        message.success('修改成功');
      } else {
        await api.admin.column.create(dto);
        message.success('新增成功');
      }
      setModalOpen(false);
      reload();
    } finally {
      setSaving(false);
    }
  };

  const onDelete = (item: ColumnItem) => {
    Modal.confirm({
      title: '确认删除',
      content: `确定删除「${item.title}」吗?该栏目的全部设计稿将一并删除。`,
      okType: 'danger',
      onOk: async () => {
        await api.admin.column.remove(item.id);
        message.success('删除成功');
        reload();
      }
    });
  };

  const columns = [
    {
      title: '分组',
      dataIndex: 'category',
      width: 150,
      render: (key: string) => COLUMN_HALLS.find((h) => h.key === key)?.name || key
    },
    { title: '标题', dataIndex: 'title', width: 220, fixed: 'left' as const },
    {
      title: '状态',
      dataIndex: 'status',
      width: 110,
      render: (s: string) => {
        const meta = COLUMN_STATUS_MAP[s] || { label: s, color: 'default' };
        return <Tag color={meta.color}>{meta.label}</Tag>;
      }
    },
    { title: '时间', dataIndex: 'time', width: 120 },
    {
      title: '分辨率',
      dataIndex: 'resolution',
      width: 120,
      render: (v?: string | null) => v || '-'
    },
    {
      title: '设计稿',
      dataIndex: 'images',
      width: 110,
      render: (imgs?: ColumnImageItem[]) =>
        imgs?.length ? <Space><RowPreview images={imgs} /><span className={styles.imgCount}>{imgs.length}版</span></Space> : '-'
    },
    { title: '排序', dataIndex: 'sort', width: 80 },
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
      render: (_: unknown, item: ColumnItem) => (
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
        <Tabs
          activeKey={category || 'all'}
          onChange={(key) => {
            setCategory(key === 'all' ? '' : key);
            setPage(1);
          }}
          items={[
            { key: 'all', label: '全部' },
            ...COLUMN_HALLS.map((h) => ({ key: h.key, label: h.name }))
          ]}
          className={styles.tabs}
        />
        <Space>
          <Input.Search
            allowClear
            placeholder="搜索标题"
            onSearch={(v) => {
              setKeyword(v);
              setPage(1);
            }}
            style={{ width: 200 }}
          />
          <Button type="primary" icon={<PlusOutlined />} onClick={() => openModal()}>
            新增栏目
          </Button>
        </Space>
      </div>

      <Table
        rowKey="id"
        loading={loading}
        dataSource={list}
        columns={columns as any}
        scroll={{ x: 'max-content' }}
        pagination={{
          showTotal: (t) => `共 ${t} 条`,
          showSizeChanger: true,
          current: page,
          pageSize,
          total,
          onShowSizeChange: (_, size) => {
            setPageSize(size);
            setPage(1);
          },
          onChange: (p) => setPage(p)
        }}
      />

      <Modal
        title={editing ? '编辑栏目' : '新增栏目'}
        open={modalOpen}
        onOk={onSave}
        confirmLoading={saving}
        onCancel={() => setModalOpen(false)}
        destroyOnClose
        width={720}
        maskClosable={false}
      >
        <Form form={form} layout="vertical" preserve={false}>
          <Form.Item label="分组" name="category" rules={[{ required: true, message: '请选择分组' }]}>
            <Select
              placeholder="选择分组"
              options={COLUMN_HALLS.map((h) => ({ value: h.key, label: h.name }))}
            />
          </Form.Item>
          <Form.Item label="标题" name="title" rules={[{ required: true, message: '请输入标题' }]}>
            <Input placeholder="区块标题" />
          </Form.Item>
          <Space wrap>
            <Form.Item label="时间" name="time">
              <DatePicker style={{ width: 180 }} />
            </Form.Item>
            <Form.Item label="状态" name="status">
              <Select
                style={{ width: 160 }}
                options={COLUMN_STATUS_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
              />
            </Form.Item>
            <Form.Item label="排序" name="sort">
              <InputNumber min={0} style={{ width: 100 }} />
            </Form.Item>
            <Form.Item label="启用" name="enabled" valuePropName="checked">
              <Switch />
            </Form.Item>
          </Space>
          <Form.Item label="进入路由(预留)" name="route">
            <Input placeholder="如 /screen/lanmu,可留空(留空时大屏隐藏「进入」按钮)" />
          </Form.Item>
          <Form.Item label="分辨率(非必填)" name="resolution">
            <Input placeholder="如 1920×1080,仅展示用" />
          </Form.Item>

          {/* 设计稿子表(整列替换) */}
          <div className={styles.imagesTitle}>
            设计稿图片(每版:图 + 描述 + 时间,可增删排序)
            <span className={styles.imagesLimit}>单张 ≤ {Math.round(UPLOAD_MAX_SIZE / 1024 / 1024)}MB</span>
          </div>
          <Form.List name="images">
            {(fields, { add, remove }) => (
              <div className={styles.imageList}>
                {fields.map((field) => (
                  <ImageRow
                    key={field.key}
                    field={field}
                    form={form}
                    onRemove={() => remove(field.name)}
                  />
                ))}
                <Button
                  type="dashed"
                  icon={<PlusOutlined />}
                  onClick={() => add({ uid: nextUid() })}
                  block
                >
                  添加一版设计稿
                </Button>
              </div>
            )}
          </Form.List>
        </Form>
      </Modal>
    </div>
  );
}
