# g-fullstack backend (NestJS + better-sqlite3)
# 多阶段:deps 阶段装构建工具 + 编译原生模块;runtime 阶段只拷编译好的 node_modules(无 python/g++,精简)。
#   - deps 层 COPY deps/(version 归一 0.0.0 的 package*.json,build.cjs buildOps 生成)→ 依赖层 cache 不被
#     每次 version bump 打断,better-sqlite3 编译只在依赖树真变时重跑;稳态 build 仅 COPY dist,秒级。
#   - host 的 current/package.json(真 version)由 config.sh::read_tag 读拼 <version>-<ts> tag,不受镜像内归一影响。
#   - 两阶段同 node:22-slim(debian glibc)→ better-sqlite3 .node ABI 一致,可直接拷。
#   - 配置注入:镜像带 config.<env>.yaml 作默认值,环境敏感值由 docker run -e 覆盖(configuration.ts 支持 env
#     override):PORT/CORS_ORIGINS/DB_DIR/JWT_SECRET/APP_SIGN_KEY/ADMIN_PASSWORD/UPLOAD_STORAGE_PATH/LOG_LEVEL 等。
#   - data(sqlite+uploads)持久化走 volume 挂载 /app/data,不进镜像。
# 改代码:重 build(runtime 的 dist 层变,deps 层 cache 命中,秒级);改依赖:deps 层 cache miss,重装+编译。
#
# base:docker.1ms.run/library/node:22-slim(Docker Hub 国内直连不稳,1ms 可用),首次 build 联网。

# ── deps 阶段:构建工具 + npm ci + 编译 better-sqlite3 ──
FROM docker.1ms.run/library/node:22-slim AS deps
WORKDIR /app
# better-sqlite3 v13 无预编译二进制(GitHub release 0 asset、npmmirror 仅镜像源码包),prebuild-install
# 取不到必回退 node-gyp 源码编译,需 python3/make/g++。node:22-slim 无,装之。
# apt 源换阿里云镜像(deb.debian.org 国内慢;bookworm 源在 sources.list.d/debian.sources,DEB822)。
RUN sed -i 's|deb.debian.org|mirrors.aliyun.com|g; s|security.debian.org|mirrors.aliyun.com|g' \
        /etc/apt/sources.list.d/debian.sources 2>/dev/null || true \
    && apt-get update \
    && apt-get install -y --no-install-recommends python3 make g++ \
    && rm -rf /var/lib/apt/lists/*
# version 归一的 deps 副本(build.cjs buildOps 生成,version=0.0.0):使依赖层 cache 不被每次 version bump 打断
COPY deps/package.json deps/package-lock.json ./
RUN npm config set registry https://registry.npmmirror.com \
    && npm ci --omit=dev --legacy-peer-deps

# ── runtime 阶段:精简,只带运行所需(无构建工具)──
FROM docker.1ms.run/library/node:22-slim AS runtime
WORKDIR /app
# 编译好的 node_modules(含 better-sqlite3 .node;两阶段同 node:22-slim → ABI 一致)
COPY --from=deps /app/node_modules ./node_modules
# 代码层:每次改代码这层变(deps 层仍 cache 命中)
COPY dist ./dist
# 默认配置(非敏感值兜底;敏感值由 env 覆盖)
COPY config ./config
# 真 package.json(带 version;运行时/镜像内一致;read_tag 读的是 host current/package.json)
COPY package.json ./package.json

ENV NODE_ENV=prod
# 运行端口权威 = PORT env(install.sh/compose 从 .env 注入,app 读 PORT 监听;迁移换端口只改 .env)。
# 镜像内 config/config.prod.yaml 的 app.port 仅作未注入 PORT 时的兜底默认值。
# EXPOSE 仅为元数据(默认 3001),实际端口由运行期 PORT env 决定。
EXPOSE 3001
CMD ["node", "dist/main.js"]
