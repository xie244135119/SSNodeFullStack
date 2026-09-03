import React, { useEffect, useState, useCallback } from 'react';
import { Button, ConfigProvider, Form, Input } from 'antd';
import { UserOutlined, LockOutlined, SafetyCertificateOutlined } from '@ant-design/icons';
import { useLocation, useNavigate } from 'react-router-dom';
import styles from './index.module.less';
import api from '@/services/api';
import ProjectConfig from '../../../config/project.config';
import { airtableTheme } from '@/styles/theme';

function Login() {
  const [loginForm] = Form.useForm();
  const navigate = useNavigate();
  const location = useLocation();
  // 验证码:svg 字符串 + captchaId
  const [captchaSvg, setCaptchaSvg] = useState('');
  const [captchaId, setCaptchaId] = useState('');
  // 登录中
  const [loading, setLoading] = useState(false);

  /** 拉取验证码(svg-captcha,后端返回 svg 字符串 + captchaId) */
  const refreshCaptcha = useCallback(() => {
    api.admin.user.getCaptcha().then((res) => {
      if (res?.svg) {
        setCaptchaSvg(res.svg);
        setCaptchaId(res.captchaId);
      }
    });
  }, []);

  /** 登录(走真实后端 /api/login,带验证码) */
  const onLogin = async () => {
    const values = await loginForm.validateFields();
    setLoading(true);
    api.admin.user
      .login({
        username: values.username,
        password: values.password,
        captchaId,
        verifycode: values.verifycode
      })
      .then((ok) => {
        if (ok) {
          const redirect = decodeURIComponent(location.search.replace('?', '')).replace(
            'redirect=',
            ''
          );
          navigate(redirect || '/background');
        } else {
          refreshCaptcha();
        }
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    refreshCaptcha();
  }, [refreshCaptcha]);

  return (
    <ConfigProvider theme={airtableTheme}>
      <div className={styles.LoginWrapper}>
        {/* 左侧品牌区 */}
        <div className={styles.brandPanel}>
          <div className={styles.brandInner}>
            <div className={styles.brandTitle}>
              <span className={styles.brandLine} />
              {ProjectConfig.title}
            </div>
            {/* <div className={styles.brandSlogan}>
              数据驱动 · 大屏可视 · 一体管理
            </div> */}
            <div className={styles.brandFoot}>
              可视化大屏与后台管理系统
            </div>
          </div>
          {/* 装饰光斑 */}
          <div className={`${styles.blob} ${styles.blob1}`} />
          <div className={`${styles.blob} ${styles.blob2}`} />
        </div>

        {/* 右侧登录卡 */}
        <div className={styles.formPanel}>
          <div className={styles.loginCard}>
            <div className={styles.title}>
              <h1>欢迎登录</h1>
              <p>请使用账号密码登录后台管理系统</p>
            </div>
            <Form
              form={loginForm}
              layout="vertical"
              onFinish={onLogin}
              requiredMark={false}
            >
              <Form.Item
                name="username"
                rules={[{ required: true, message: '请输入用户名' }]}
              >
                <Input
                  size="large"
                  allowClear
                  prefix={<UserOutlined style={{ color: '#9297a0' }} />}
                  placeholder="用户名"
                />
              </Form.Item>
              <Form.Item
                name="password"
                rules={[{ required: true, message: '请输入密码' }]}
              >
                <Input.Password
                  size="large"
                  prefix={<LockOutlined style={{ color: '#9297a0' }} />}
                  placeholder="密码"
                />
              </Form.Item>
              <div className={styles.captchaRow}>
                <Form.Item
                  name="verifycode"
                  rules={[{ required: true, message: '请输入验证码' }]}
                  noStyle
                >
                  <Input
                    size="large"
                    allowClear
                    prefix={<SafetyCertificateOutlined style={{ color: '#9297a0' }} />}
                    placeholder="验证码"
                  />
                </Form.Item>
                <div
                  className={styles.captchaBox}
                  dangerouslySetInnerHTML={{ __html: captchaSvg }}
                  onClick={refreshCaptcha}
                  title="点击刷新验证码"
                />
              </div>
              <Button
                type="primary"
                size="large"
                block
                htmlType="submit"
                loading={loading}
                className={styles.submitBtn}
              >
                登录
              </Button>
              <p className={styles.forgetPasswordTip}>如果忘记密码，请联系管理员</p>
            </Form>
          </div>
        </div>
      </div>
    </ConfigProvider>
  );
}

Login.propTypes = {};

export default Login;
