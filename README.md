# Rivermoon Image Studio (二次开发版)

基于 [peiyizhi0724/ChatGpt-Image-Studio](https://github.com/peiyizhi0724/ChatGpt-Image-Studio) 的二次开发版本，定位为本地优先的图片工作台，面向 OpenAI 兼容接口（如 `gpt-image-2`）进行生成与编辑。

## 当前能力

- 生成与编辑双模式，支持多图 fan-out。
- 生成模式和编辑模式都支持参考图（不是仅编辑可用）。
- 支持 `JPEG` / `PNG` / `WebP` 输出。
- 支持流式预览与步骤图进度显示（如 `步骤图 1 · 1/2`）。
- 会话级实时用时、处理中状态、历史记录状态同步。
- 提示词库页面（`/prompt-library`）：
  - 内置 JSON 提示词；
  - 本地自定义提示词（可新增/编辑）；
  - 收藏、筛选、搜索、复制、一键使用。
- 自定义提示词支持本地预览图上传（Base64 本地存储）。
- 登录页/设置页支持调用 `/v1/models` 拉取模型并选择默认模型。
- 支持粘贴、点击上传、拖拽上传参考图；支持 `@图N` 引用。
- 历史记录侧栏已做缩略图与分批渲染，减轻大记录量卡顿。

## 路由概览

- `/image/history`：会话历史视图
- `/image/workspace`：图片工作台
- `/prompt-library`：提示词库
- `/changelog`：更新记录
- `/settings`：本地设置
- `/login`：登录

## 维护约定

- 每次功能更新或修复后，追加记录到 `web/public/CHANGELOG.md`。
- `/changelog` 页面会直接渲染上述 Markdown，作为版本更新说明。

## 目录结构

```text
.
├─ web/                # Vite + React 前端
├─ image-relay/        # Python 中转（/v1/models, /v1/images/*）
├─ cloudflare/         # Cloudflare Worker 版本入口
├─ docs/               # 文档
├─ backend/static/     # 前端静态构建产物（同步目录）
└─ wrangler.toml       # Worker 配置
```

## 本地启动

### 1) 前端

```bash
cd web
npm install
npm run dev
```

默认前端开发端口通常为 `5174`（Vite）。

### 2) 图片中转（可选）

```bash
cd image-relay
cp .env.example .env
docker network create new-api-network
docker compose -f compose.yaml up -d --build
```

默认监听：`127.0.0.1:8320`

## 配置说明

- 前端 `API URL` 与 `API Key` 保存在浏览器本地存储。
- 推荐通过登录页或设置页拉取 `/v1/models` 后选择模型。
- `image-relay/.env.example` 中可配置：
  - `UPSTREAM_BASE_URL`
  - `EXTERNAL_MODEL`
  - `EXTERNAL_4K_MODEL`
  - `INTERNAL_MODEL`
  - `UPSTREAM_API_KEY`（可选）

## 部署文档

- 通用部署说明：`docs/deployment.md`
- Cloudflare 部署：`docs/cloudflare-deploy.md`
- 性能优化与后续计划：`docs/optimization.md`

## 致谢

- 原项目作者：`peiyizhi0724`
- 二开维护：`codex with 爱吃馍`

## License

See [LICENSE](LICENSE).
