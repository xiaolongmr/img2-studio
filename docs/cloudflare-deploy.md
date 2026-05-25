# Cloudflare Worker 部署

当前仓库可作为单 Worker + 静态资源方案部署。

## Worker 行为（当前版本）

`cloudflare/worker.mjs` 负责：

- `/v1/models`
- `/v1/images/generations`
- `/v1/images/edits`
- `/healthz`
- `/version`

其余路径由静态资源（`web/dist`）提供，支持 SPA 回退。

## 构建与资源

`wrangler.toml` 关键配置：

- `main = "cloudflare/worker.mjs"`
- `assets.directory = "web/dist"`
- `assets.not_found_handling = "single-page-application"`

本地构建前端：

```bash
cd web
npm ci
npm run build
```

## 环境变量

建议在 Cloudflare 项目中配置：

- `UPSTREAM_BASE_URL`：上游 `/v1` 地址（必填）
- `EXTERNAL_MODEL`：对前端暴露模型名，默认 `gpt-image-2`
- `EXTERNAL_4K_MODEL`：高分辨率模型名，默认 `gpt-image-2`
- `INTERNAL_MODEL`：上游真实模型名
- `UPSTREAM_API_KEY`：可选，作为无 Authorization 时的兜底密钥
- `APP_VERSION`：版本标识（显示在前端）

## 说明

- Worker 会对 `model` 做映射（外部名 -> 内部名）。
- `/v1/models` 返回会做模型名归一化。
- 当前 Worker 不支持完整后台管理 API（`/api/*` 会返回 not_supported）。

## GitHub + Cloudflare 流程

1. 推送仓库到 GitHub。
2. Cloudflare 创建 Worker，选择 GitHub 导入。
3. Build command：

```bash
cd web && npm ci && npm run build
```

4. Assets directory：`web/dist`
5. 绑定 `ASSETS`
6. 配置上述变量并部署

## 排障建议

- `/healthz` 用于连通性探活。
- `/version` 用于前端版本展示检查。
- 若出现 5xx，优先检查 `UPSTREAM_BASE_URL`、鉴权头、上游可用性。

## 相关文档

- 通用部署：`docs/deployment.md`
- 性能优化：`docs/optimization.md`
