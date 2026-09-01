#!/usr/bin/env bash
###
 # Description  docker 部署 apply:从 current/ context build 镜像 → 停删旧容器 → run 新容器
###
# 由顶层 install.sh / versionswitch.sh 派发(APP_ROOT/MODE 已导出)。
# env 从 APP_ROOT/.env 注入(持久权威);data 走 volume 挂载 /app/data。
# 镜像 tag = <version>-<14位ts>(read_tag 读 current/package.json + .build-ts);每次部署一个新 tag,旧 tag 留作回滚。
set -euo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$DIR/config.sh"

command -v docker >/dev/null 2>&1 || { echo "✗ docker 不存在(PATH 无 docker)" >&2; exit 1; }
[[ -f "$CURRENT_DIR/package.json" ]] || { echo "✗ $CURRENT_DIR/package.json 不存在" >&2; exit 1; }
[[ -f "$CURRENT_DIR/dist/main.js" ]] || { echo "✗ $CURRENT_DIR/dist/main.js 不存在" >&2; exit 1; }
[[ -f "$CURRENT_DIR/Dockerfile" ]] || { echo "✗ $CURRENT_DIR/Dockerfile 不存在(release 包应在 releases/<version>-<ts>/ 内带 Dockerfile)" >&2; exit 1; }

# 便携 sed 原地改(GNU/BSD 兼容)
_sed_i() { local f="$1"; shift; sed "$@" "$f" > "$f.__sed_i" && mv "$f.__sed_i" "$f"; }

TAG="$(read_tag)"
[[ -n "$TAG" ]] || { echo "✗ 无法从 $CURRENT_DIR/package.json 读 version(作镜像 tag)" >&2; exit 1; }
IMAGE_TAG="$IMAGE:$TAG"

echo "▶ docker build $IMAGE_TAG (context=$CURRENT_DIR) ..."

# 直接以 current/ 为 build context:Dockerfile 与 .dockerignore 都在 current/ 根,
# .dockerignore 排除 ops/ 等非镜像文件,context 仅含 package.json/dist/config/Dockerfile。
# Dockerfile 的 COPY package.json/dist/config 即从 current/ 根取,与目录布局对齐。
if [[ ! -f "$CURRENT_DIR/config/config.prod.yaml" ]]; then
  echo "⚠ current/config/config.prod.yaml 不存在,镜像将无默认配置(全靠 -e env)"
fi

docker build -t "$IMAGE_TAG" "$CURRENT_DIR"
echo "✓ 镜像构建: $IMAGE_TAG"

# env:APP_ROOT/.env 为权威(顶层 install.sh 已保证存在且空值已阻断)
ENV_FLAG=""
if [[ -f "$ENV_FILE" ]]; then
  # 对齐本次部署的 IMAGE/TAG/DATA_DIR/CONTAINER_NAME(PORT 在 .env 由运维权威,不覆盖)
  # (IMAGE/TAG 与 config.sh 的构建一致;--env-file 把 .env 全量灌进容器,含 PORT/密钥)
  _sed_i "$ENV_FILE" \
    -e "s|^IMAGE=.*|IMAGE=$IMAGE|" \
    -e "s|^TAG=.*|TAG=$TAG|" \
    -e "s|^DATA_DIR=.*|DATA_DIR=$DATA_DIR|" \
    -e "s|^CONTAINER_NAME=.*|CONTAINER_NAME=$CONTAINER_NAME|"
  ENV_FLAG="--env-file $ENV_FILE"
else
  echo "⚠ 缺 $ENV_FILE,用空 env 起容器(仅限调试,密钥将为空)"
fi

echo "▶ 重建容器 $CONTAINER_NAME ..."
docker stop "$CONTAINER_NAME" 2>/dev/null || true
docker rm "$CONTAINER_NAME" 2>/dev/null || true

# 端口权威 = .env 的 PORT(config.sh::read_env_port 读);-e PORT 注入 app 监听,-p 映射同值。
# DB_DIR/UPLOAD_STORAGE_PATH 随 /app/data mount 目标锁定,容器内布局固定。
docker run -d \
  --name "$CONTAINER_NAME" \
  --restart "$RESTART_POLICY" \
  -p "$HOST_PORT:$CONTAINER_PORT" \
  $ENV_FLAG \
  -e NODE_ENV=prod \
  -e PORT="$PORT" \
  -e DB_DIR="$CONTAINER_DATA_DIR" \
  -e UPLOAD_STORAGE_PATH="$CONTAINER_DATA_DIR/uploads" \
  -v "$DATA_DIR:$CONTAINER_DATA_DIR" \
  "$IMAGE_TAG"

echo "✓ 容器已起: $CONTAINER_NAME (宿主 $HOST_PORT → $CONTAINER_PORT, tag $TAG)"
echo "  状态: ./status.sh | 日志: ./logs.sh"
