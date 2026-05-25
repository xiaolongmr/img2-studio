# 部署说明

本文档描述当前二次开发版本的推荐部署方式，适用于：

1. 前端静态站点（`web/dist`）
2. OpenAI 兼容图片接口（如 `gpt-image-2`）
3. 可选 `image-relay` 中转层

## 架构模式

### 模式 A：前端直连 API（最简单）

- 前端在登录/设置页保存 `API URL` 与 `API Key`。
- 直接请求目标站点的 `/v1/models`、`/v1/images/generations`、`/v1/images/edits`。
- 适合个人本地使用或你已有稳定上游。

### 模式 B：前端 + image-relay（推荐可控）

- 前端请求你自己的中转层。
- `image-relay` 转发到 `UPSTREAM_BASE_URL`。
- 支持异步 job 轮询、模型名映射、统一超时/重试策略。

## 前端部署

```bash
cd web
npm ci
npm run build
```

将 `web/dist` 作为静态根目录托管（Nginx、Caddy、Cloudflare Pages 均可）。

## image-relay 部署

```bash
cd image-relay
cp .env.example .env
docker network create new-api-network
docker compose -f compose.yaml up -d --build
```

默认监听：`127.0.0.1:8320`

健康检查：

```bash
curl http://127.0.0.1:8320/healthz
```

## 关键环境变量（image-relay）

- `UPSTREAM_BASE_URL`：上游 `/v1` 基础地址
- `EXTERNAL_MODEL`：对前端暴露的标准模型名
- `EXTERNAL_4K_MODEL`：对前端暴露的高分模型名
- `INTERNAL_MODEL`：上游真实模型名
- `UPSTREAM_API_KEY`：可选，服务端兜底密钥

## 反向代理示例（Nginx）

```nginx
location /v1/images/ {
    proxy_pass http://127.0.0.1:8320;
    proxy_read_timeout 1200s;
    proxy_send_timeout 1200s;
}

location /v1/models {
    proxy_pass http://127.0.0.1:8320;
}

location / {
    root /path/to/web/dist;
    try_files $uri $uri/ /index.html;
}
```

## 前端路由（当前版本）

- `/image/history`
- `/image/workspace`
- `/prompt-library`
- `/settings`
- `/login`

## 安全建议

- 不要提交 `.env`、密钥、Token、Cookie。
- 生产环境建议启用 HTTPS。
- 对外暴露中转层时，务必加访问控制与限流。

## 相关文档

- Cloudflare Worker 一体部署：`docs/cloudflare-deploy.md`
- 性能优化与后续计划：`docs/optimization.md`
