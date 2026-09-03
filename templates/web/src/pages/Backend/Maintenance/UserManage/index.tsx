import React, { useEffect, useState, useCallback } from 'react';
import {
  Card,
  Table,
  Tag,
  Space,
  Input,
  Button,
  Modal,
  Form,
  Input as AntInput,
  Select,
  message
} from 'antd';
import {
  ReloadOutlined,
  SearchOutlined,
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
  KeyOutlined,
  PoweroffOutlined
} from '@ant-design/icons';
import dayjs from 'dayjs';
import api from '@/services/api';
import type { UserManageItem } from '@/services/api/admin/user-manage';
import styles from './index.module.less';

/**
 * 用户管理页(admin-only,后台轨 JWT)
 *
 * CRUD + 状态切换 + 重置密码。受后端约束:
 *   - 不能删 admin、不能删自己、不能改自己的角色、不能切换自己的状态
 *   - 重置密码由后端生成 12 位强密码并返回明文(一次性展示)
 * 「当前登录用户」由 /api/user/info 取一次,用于禁用对自身的非法操作。
 */
export default function UserManage() {
  const [list, setList] = useState<UserManageItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [size, setSize] = useState(20);
  const [keyword, setKeyword] = useState('');

  const [selfId, setSelfId] = useState<number | undefined>();
  const [selfRole, setSelfRole] = useState<string>('');

  const [createOpen, setCreateOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editing, setEditing] = useState<UserManageItem | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [createForm] = Form.useForm();
  const [editForm] = Form.useForm();

  const reload = useCallback(() => {
    setLoading(true);
    api.admin.userManage
      .listUsers({ page, size, username: keyword || undefined })
      .then((res) => {
        if (res.code === 200 && res.data) {
          setList(res.data.list);
          setTotal(res.data.total);
        }
      })
      .finally(() => setLoading(false));
  }, [page, size, keyword]);

  useEffect(() => {
    reload();
  }, [reload]);

  // 取当前登录用户(用于禁用对自身的非法操作)
  useEffect(() => {
    api.admin.user.getInfo().then((res: any) => {
      if (res?.status === 'SUCCESS' && res.data) {
        setSelfId(res.data.id);
        setSelfRole(res.data.role);
      }
    });
  }, []);

  // 新增
  const submitCreate = () => {
    createForm
      .validateFields()
      .then((vals) => {
        setSubmitting(true);
        api.admin.userManage
          .createUser(vals)
          .then((res) => {
            if (res.code === 200) {
              message.success('新增成功');
              setCreateOpen(false);
              createForm.resetFields();
              reload();
            }
          })
          .finally(() => setSubmitting(false));
      })
      .catch(() => {});
  };

  // 编辑
  const openEdit = (record: UserManageItem) => {
    setEditing(record);
    editForm.setFieldsValue({
      nickname: record.nickname,
      role: record.role,
      status: record.status
    });
    setEditOpen(true);
  };

  const submitEdit = () => {
    if (!editing) return;
    editForm
      .validateFields()
      .then((vals) => {
        setSubmitting(true);
        api.admin.userManage
          .updateUser({ id: editing.id, ...vals })
          .then((res) => {
            if (res.code === 200) {
              message.success('修改成功');
              setEditOpen(false);
              setEditing(null);
              reload();
            }
          })
          .finally(() => setSubmitting(false));
      })
      .catch(() => {});
  };

  // 删除
  const confirmDelete = (record: UserManageItem) => {
    Modal.confirm({
      title: '确认删除',
      content: `确定删除用户「${record.username}」?该操作不可恢复。`,
      okType: 'danger',
      onOk: () =>
        api.admin.userManage.deleteUser(record.id).then((res) => {
          if (res.code === 200) {
            message.success('已删除');
            reload();
          }
        })
    });
  };

  // 切换状态
  const toggleStatus = (record: UserManageItem) => {
    api.admin.userManage.toggleUserStatus(record.id).then((res) => {
      if (res.code === 200) {
        message.success(record.status === '1' ? '已禁用' : '已启用');
        reload();
      }
    });
  };

  // 重置密码
  const resetPassword = (record: UserManageItem) => {
    Modal.confirm({
      title: '重置密码',
      content: `将重置用户「${record.username}」的密码,生成新随机密码。继续?`,
      onOk: () =>
        api.admin.userManage.resetUserPassword(record.id).then((res) => {
          if (res.code === 200 && res.data?.password) {
            Modal.info({
              title: '重置成功',
              content: (
                <div>
                  新密码(仅显示一次,请妥善保管):
                  <AntInput.Password
                    value={res.data.password}
                    readOnly
                    style={{ marginTop: 8 }}
                  />
                </div>
              )
            });
            reload();
          }
        })
    });
  };

  return (
    <Card
      title="用户管理"
      extra={
        <Space>
          <Input
            allowClear
            placeholder="用户名搜索"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            onPressEnter={() => {
              setPage(1);
              reload();
            }}
            style={{ width: 180 }}
          />
          <Button icon={<SearchOutlined />} onClick={() => { setPage(1); reload(); }}>
            搜索
          </Button>
          <Button icon={<PlusOutlined />} type="primary" onClick={() => setCreateOpen(true)}>
            新增用户
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
          onChange: (p, s) => { setPage(p); setSize(s); }
        }}
        columns={[
          { title: 'ID', dataIndex: 'id', width: 60 },
          { title: '用户名', dataIndex: 'username' },
          { title: '昵称', dataIndex: 'nickname' },
          {
            title: '角色',
            dataIndex: 'role',
            width: 100,
            render: (v: string) =>
              v === 'superadmin' ? (
                <Tag color="red">超管</Tag>
              ) : v === 'admin' ? (
                <Tag color="blue">管理员</Tag>
              ) : (
                <Tag>普通</Tag>
              )
          },
          {
            title: '状态',
            dataIndex: 'status',
            width: 80,
            render: (v: string) => (v === '1' ? <Tag color="green">启用</Tag> : <Tag>禁用</Tag>)
          },
          {
            title: '创建时间',
            dataIndex: 'createTime',
            width: 180,
            render: (v: string) => (v ? dayjs(v).format('YYYY-MM-DD HH:mm:ss') : '-')
          },
          {
            title: '操作',
            key: 'op',
            width: 240,
            fixed: 'right',
            render: (_, record) => {
              const isSelf = selfId !== undefined && record.id === selfId;
              const isAdmin = record.role === 'admin' || record.role === 'superadmin';
              return (
                <Space size="small">
                  <Button
                    size="small"
                    icon={<EditOutlined />}
                    onClick={() => openEdit(record)}
                    disabled={isAdmin && selfRole !== 'admin' && selfRole !== 'superadmin'}
                  >
                    编辑
                  </Button>
                  <Button
                    size="small"
                    icon={<KeyOutlined />}
                    onClick={() => resetPassword(record)}
                  >
                    重置密码
                  </Button>
                  <Button
                    size="small"
                    icon={<PoweroffOutlined />}
                    onClick={() => toggleStatus(record)}
                    disabled={isSelf}
                  >
                    {record.status === '1' ? '禁用' : '启用'}
                  </Button>
                  <Button
                    size="small"
                    danger
                    icon={<DeleteOutlined />}
                    onClick={() => confirmDelete(record)}
                    disabled={isSelf || isAdmin}
                  >
                    删除
                  </Button>
                </Space>
              );
            }
          }
        ]}
      />

      {/* 新增用户弹窗 */}
      <Modal
        title="新增用户"
        open={createOpen}
        onCancel={() => { setCreateOpen(false); createForm.resetFields(); }}
        onOk={submitCreate}
        confirmLoading={submitting}
        destroyOnClose
      >
        <Form form={createForm} layout="vertical" preserve={false}>
          <Form.Item
            name="username"
            label="用户名"
            rules={[{ required: true, message: '请输入用户名' }]}
          >
            <AntInput placeholder="登录用户名" />
          </Form.Item>
          <Form.Item
            name="password"
            label="密码"
            rules={[{ required: true, message: '请输入密码' }]}
          >
            <AntInput.Password placeholder="初始密码" />
          </Form.Item>
          <Form.Item name="nickname" label="昵称">
            <AntInput placeholder="显示名" />
          </Form.Item>
          <Form.Item name="role" label="角色" initialValue="web">
            <Select
              options={[
                { value: 'web', label: '普通' },
                { value: 'admin', label: '管理员' }
              ]}
            />
          </Form.Item>
          <Form.Item name="status" label="状态" initialValue="1">
            <Select
              options={[
                { value: '1', label: '启用' },
                { value: '0', label: '禁用' }
              ]}
            />
          </Form.Item>
        </Form>
      </Modal>

      {/* 编辑用户弹窗 */}
      <Modal
        title={`编辑用户 - ${editing?.username || ''}`}
        open={editOpen}
        onCancel={() => { setEditOpen(false); setEditing(null); }}
        onOk={submitEdit}
        confirmLoading={submitting}
        destroyOnClose
      >
        <Form form={editForm} layout="vertical" preserve={false}>
          <Form.Item name="nickname" label="昵称">
            <AntInput placeholder="显示名" />
          </Form.Item>
          <Form.Item name="role" label="角色">
            <Select
              options={[
                { value: 'web', label: '普通' },
                { value: 'admin', label: '管理员' }
              ]}
              disabled={editing?.id === selfId}
            />
          </Form.Item>
          <Form.Item name="status" label="状态">
            <Select
              options={[
                { value: '1', label: '启用' },
                { value: '0', label: '禁用' }
              ]}
              disabled={editing?.id === selfId}
            />
          </Form.Item>
        </Form>
      </Modal>
    </Card>
  );
}
