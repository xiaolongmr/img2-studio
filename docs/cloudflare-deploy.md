# Cloudflare Deploy

This project can be deployed as a single Cloudflare Workers app with static assets.

## What is deployed

- `web/` is built into static assets.
- `cloudflare/worker.mjs` handles `/v1/models`, `/v1/images/generations`, `/v1/images/edits`, `/healthz`, and `/version`.
- All other routes are served by the built frontend.

## GitHub + Cloudflare setup

1. Push this repository to GitHub.
2. In Cloudflare, create a new Worker and choose GitHub import.
3. Use the repository root as the build context.
4. Set the build command to:

```bash
cd web && npm ci && npm run build
```

5. Make sure the asset directory is `web/dist`.
6. Bind the static assets to `ASSETS`.
7. Set these environment variables:

```bash
UPSTREAM_BASE_URL=https://your-newapi-domain/v1
EXTERNAL_MODEL=gpt-image-2
EXTERNAL_4K_MODEL=gpt-image-2
INTERNAL_MODEL=gpt-image-2
```

8. Deploy.

## Notes

- The frontend can stay on the same domain as the Worker.
- The login and settings pages can keep using the same origin API URL.
- If your upstream needs a fixed server key, set `UPSTREAM_API_KEY` as a secret.
- If you only want to proxy a subset of APIs, extend `cloudflare/worker.mjs`.
