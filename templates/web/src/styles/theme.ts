import type { ThemeConfig } from 'antd';

/**
 * 后台管理系统主题(Airtable 风格 → AntD5)
 * 详见 docs/design.md §10
 *
 * 设计源:awesome-design-md/design-md/airtable/DESIGN.md
 * canvas=#ffffff, primary=#181d26(近黑按钮), hairline 边框为主,弱 shadow
 *
 * 仅作用于 /background 路由树;大屏端各自深色科技风,不套此主题。
 */
export const airtableTheme: ThemeConfig = {
  token: {
    // 主色:近黑(Airtable primary)
    colorPrimary: '#181d26',
    colorPrimaryActive: '#0d1218',
    colorPrimaryHover: '#2a323d',

    // 画布与文字
    colorBgContainer: '#ffffff',
    colorBgLayout: '#f8fafc',
    colorText: '#181d26',
    colorTextSecondary: '#333840',
    colorTextTertiary: '#41454d',
    colorTextQuaternary: '#9297a0',

    // 边框(hairline 为主)
    colorBorder: '#dddddd',
    colorBorderSecondary: '#e0e2e6',

    // 圆角:控件 6,卡片 12(对齐 Airtable sm=6 / lg=12)
    borderRadius: 6,
    borderRadiusLG: 12,
    borderRadiusSM: 4,
    borderRadiusXS: 2,

    // 字号沿用 AntD 默认,不照搬 design.md 的 16/48 大字
    // 按钮尺寸收 AntD 默认(后台工具栏密集),不照搬 design.md 大按钮
    controlHeight: 32,

    // 弱化 shadow:Airtable 以 hairline 承载层次
    boxShadow: '0 1px 2px rgba(24,29,38,0.04)',
    boxShadowSecondary: '0 1px 2px rgba(24,29,38,0.06)'
  },
  components: {
    // 冲突处置 §10.3-1:按钮黑 vs 链接蓝分离
    // AntD 把 colorPrimary 同时喂给 Link,这里回填 Airtable link 色
    Typography: {
      colorLink: '#1b61c9',
      colorLinkActive: '#1a3866',
      colorLinkHover: '#2b73e0'
    },
    Button: {
      // 主按钮近黑底白字
      colorPrimary: '#181d26',
      colorPrimaryActive: '#0d1218',
      colorPrimaryHover: '#2a323d'
    },
    Menu: {
      // 深色侧栏:选中态用更亮的高亮色,黑色主题下清晰可辨
      colorPrimary: '#3399ff',
      colorItemBg: '#1d1f25',
      colorSubItemBg: '#1d1f25',
      colorItemBgSelected: '#2a5ca8',
      colorItemText: '#d0d6e0',
      colorItemTextSelected: '#ffffff',
      colorItemTextHover: '#ffffff',
      colorItemBgHover: '#272b34',
      // 选中项左侧指示条
      colorPrimaryActive: '#3399ff'
    },
    Card: {
      // 卡片弱 shadow,靠 hairline 边框
      boxShadowTertiary: '0 1px 2px rgba(24,29,38,0.04)'
    }
    // 语义色 success/error/warning/info 保留 AntD 默认(§10.3-2),不覆盖
  }
};
