# 招聘 MCP 远程端点（Streamable HTTP）：与 npm 包 / stdio 入口共用同一 dist 产物与工具面
# 公网路径 https://www.ruyuejian.com/api/mcp 由 nginx location /api/mcp 反代到本容器（勿用主域 /mcp，那是站内落地页）
# 部署受发版门禁约束，见 mcp/PUBLISHING.md 第 4b 节

FROM node:22-alpine AS builder
ARG NPM_REGISTRY=https://registry.npmmirror.com
ENV npm_config_registry=${NPM_REGISTRY}

WORKDIR /app

COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm npm ci

COPY tsconfig.json ./
COPY src/ ./src/
RUN npm run build

# ---- 生产阶段 ----
FROM node:22-alpine
ARG NPM_REGISTRY=https://registry.npmmirror.com
ENV npm_config_registry=${NPM_REGISTRY}

WORKDIR /app

COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm npm ci --omit=dev

# 构建阶段编译产物（index.js = stdio 兜底入口，http.js = 容器主入口）
COPY --from=builder /app/dist/ ./dist/

ENV NODE_ENV=production

# healthz 为固定路径；容器内端口由 compose 传 RUYUEJIAN_MCP_HTTP_PORT（默认 8080）
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD node -e "fetch('http://127.0.0.1:8080/healthz').then(r=>r.ok?process.exit(0):process.exit(1)).catch(()=>process.exit(1))"

CMD ["node", "dist/http.js"]