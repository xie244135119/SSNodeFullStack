import { defineConfig, loadEnv } from 'vite';
import path from 'path';
import react from '@vitejs/plugin-react-swc';
import lagacy from '@vitejs/plugin-legacy';
import browserslist from 'browserslist';
import svgr from 'vite-plugin-svgr';

export default defineConfig(({ mode }) => {
  // 加载 .env / .env.[mode] 文件(prefix '' = 不限 VITE_ 前缀,全部读入对象)。
  // 注意:vite 不会把 .env 文件变量灌进 process.env,故必须用 loadEnv 主动取,
  // 否下面 define 读 process.env.VITE_APP_SIGN_KEY 恒为 undefined → 回退 dev 占位密钥 → 签名失败。
  const env = loadEnv(mode, process.cwd(), '');
  return {
  plugins: [
    react(),
    // SVG as React 组件：import X from './x.svg?react' （当前项目图标仍走静态资源方式，此插件仅备用，便于后续可改色图标）
    svgr(),
    lagacy({
      targets: browserslist.defaults
    })
  ],
  define: {
    __APP_VERSION__: JSON.stringify(`v${process.env.npm_package_version}`),
    // 大屏 API 签名密钥(HMAC-SHA256),构建期内联进 bundle,不再走 public/env.config.js。
    // 取自 .env / .env.[mode] 的 VITE_APP_SIGN_KEY,须与 backend yaml appSign.signKey 一致。
    // import.meta.env.VITE_APP_SIGN_KEY 经 define 静态替换,需 JSON.stringify 包裹。
    'import.meta.env.VITE_APP_SIGN_KEY': JSON.stringify(
      env.VITE_APP_SIGN_KEY || ''
    )
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      config: path.resolve(__dirname, './config')
    },
    mainFields: ['module', 'jsnext:main', 'jsnext'],
    extensions: ['.mjs', '.js', '.mts', '.ts', '.jsx', '.tsx', '.json']
  },
  publicDir: 'public',
  base: '/',
  server: {
    open: true,
    hmr: true,
    port: 6177,
    host: true,
    proxy: {
      // 后端 NestJS 接口,dev 时转发到本地 3000
      '/api': {
        target: 'http://127.0.0.1:3001',
        // target: 'http://<your-server-ip>:3001',
        changeOrigin: true
      },
      // 上传的静态资源转发到 backend 静态目录
      '/static/uploads': {
        target: 'http://127.0.0.1:3001',
        changeOrigin: true
      },
      // WebSocket 通道
      '/ws': {
        target: 'ws://127.0.0.1:3001',
        ws: true,
        changeOrigin: true
      }
    }
  },
  optimizeDeps: {
    exclude: []
  },
  build: {
    // target: 'modules',
    outDir: 'dist',
    assetsDir: 'assets',
    assetsInlineLimit: 4 * 1024,
    cssCodeSplit: true,
    copyPublicDir: true,
    sourcemap: false,
    minify: 'esbuild',
    write: true,
    reportCompressedSize: true,
    chunkSizeWarningLimit: 500,
    rollupOptions: {
      output: {
        // 手动分包：把体积大、变动频率低的依赖从业务 base chunk 拆出，
        // 使首屏可与业务 chunk 并行下载、长期独立缓存。改业务代码不再让
        // vendor 包 hash 失效。
        //
        // 注意：不要把 react/react-dom 单独拆成一个与 antd 并列的 chunk。
        // antd/rc-util 在模块顶层执行 `Number(react.version.split(".")[0])`
        // 等读取，若 react chunk 晚于 antd chunk 求值，react 为 undefined 会抛
        // "Cannot read properties of undefined (reading 'version')" 致整站白屏。
        // 故 react/react-dom/recoil/react-router 与 antd 同置于 antd-vendor，
        // 由 Rollup 按 import 图保证 react 先于 antd 求值；仅 echarts 独立成 chunk。
        manualChunks(id) {
          if (id.includes('node_modules')) {
            if (id.includes('echarts') || id.includes('zrender')) {
              return 'echarts-vendor';
            }
            return 'vendor';
          }
          return undefined;
        }
      }
    }
  },
  preview: {
    open: true
  },
  css: {
    modules: {},
    preprocessorOptions: {
      less: {
        javascriptEnabled: true,
        additionalData: `@import "${path.resolve(__dirname, 'src/styles/vars.less')}";`
      },
      scss: {}
    }
  },
  json: {
    namedExports: true,
    stringify: false
  },
  logLevel: 'info',
  clearScreen: false
  };
});
