/**
 * 单文件打包配置（仅运维 pack.cjs 调用，不影响 dev / nest build）。
 *
 * 目的：把 backend/src 下 ~50 个 .ts 合并成一个 dist/main.js，消除 common/config/
 * database/entities/modules 多目录结构。保留 tsc 的 emitDecoratorMetadata
 * （NestJS 依赖注入 design:paramtypes 必需，esbuild 不产出故不用）。
 * 迁移经 sqlite.config.ts 显式 import 随 bundle 走(prod migrationsRun 仍可建表)。
 *
 * 边界：所有 node_modules 依赖一律外部化（better-sqlite3 原生模块 / socket.io /
 * swagger 等不进 bundle），运行期从目标机 node_modules 解析（package.json npm i）。
 * 故产物 = 仅业务源码单文件，依赖靠 npm i 还原。
 *
 * 用法：node_modules/.bin/webpack -c webpack.pack.cjs
 */
const path = require('path');

module.exports = {
  // ★ mode:'none'(非 'production'):production mode 自带 DefinePlugin 会把
  // process.env.NODE_ENV 在构建期静态替换成 "production",而本应用按 'prod'/'develop'
  // 选 yaml、判 isProd——替换后 env 恒为 "production" → config.production.yaml 不存在 →
  // 回退 develop、isProd 恒 false(prod 没跑迁移、synchronize 被误开)。none 保留运行期读取。
  // 本来就 optimization.minimize:false,production mode 唯一的"收益"是 minify/树摇,
  // 都不需要,故 none 无损失。
  mode: 'none',
  target: 'node',
  entry: path.resolve(__dirname, 'src/main.ts'),
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: 'main.js',
    clean: true
  },
  resolve: { extensions: ['.ts', '.js'] },
  devtool: false,
  module: {
    rules: [
      {
        test: /\.ts$/,
        exclude: /node_modules/,
        loader: 'ts-loader',
        options: { transpileOnly: true, configFile: 'tsconfig.build.json' }
      }
    ]
  },
  // 关键：把一切 node_modules 依赖外部化，只打包业务源码
  externals: [
    ({ context, request }, callback) => {
      // 相对路径(自家源码)才打进 bundle
      if (request.startsWith('.') || request.startsWith('/')) return callback();
      // 其余（含 node 内建 + 三方包 + scoped 包）运行期 require
      callback(null, 'commonjs2 ' + request);
    }
  ],
  // 保留 __dirname/__filename 真值（main.ts 走 process.cwd()，不依赖，但保险）
  node: { __dirname: false, __filename: false },
  // 不混淆：仅做合并，可读、低风险、体积本就小（<200KB）
  optimization: { minimize: false }
};
