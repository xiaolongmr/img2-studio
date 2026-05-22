export default {
  async fetch(request, env) {
    try {
      const url = new URL(request.url);
      const path = url.pathname;

      if (request.method === "OPTIONS") {
        return new Response(null, { status: 204 });
      }

      if (path === "/healthz") {
        return jsonResponse({ ok: true, runtime: "cloudflare-worker" });
      }

      if (path === "/version") {
        return jsonResponse({
          version: String(env.APP_VERSION || "cloudflare-worker"),
        });
      }

      if (path === "/v1/models") {
        return handleModels(request, env);
      }

      if (path === "/v1/images/generations" || path === "/v1/images/edits") {
        return handleImages(request, env);
      }

      if (path.startsWith("/api/")) {
        return jsonResponse(
          {
            error: "not_supported",
            message:
              "This Cloudflare worker currently supports /v1/models and /v1/images/* only.",
          },
          404,
        );
      }

      return env.ASSETS.fetch(request);
    } catch (error) {
      return jsonResponse(
        {
          error: "worker_error",
          message: error instanceof Error ? error.message : "unknown error",
        },
        500,
      );
    }
  },
};

function jsonResponse(payload, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      ...extraHeaders,
    },
  });
}

function getUpstreamBaseUrl(env) {
  const configured = String(
    env.UPSTREAM_BASE_URL || env.NEWAPI_BASE_URL || "",
  ).trim();
  if (!configured) {
    throw new Error("Missing UPSTREAM_BASE_URL (or NEWAPI_BASE_URL)");
  }
  return configured.replace(/\/+$/, "");
}

function getExternalModel(env) {
  return String(env.EXTERNAL_MODEL || "gpt-image-2").trim() || "gpt-image-2";
}

function getExternal4kModel(env) {
  return (
    String(env.EXTERNAL_4K_MODEL || getExternalModel(env)).trim() ||
    getExternalModel(env)
  );
}

function getInternalModel(env) {
  return String(env.INTERNAL_MODEL || getExternalModel(env)).trim() || getExternalModel(env);
}

function mapIncomingModel(model, env) {
  const value = String(model || "").trim();
  if (!value) {
    return value;
  }
  if (value === getExternalModel(env) || value === getExternal4kModel(env)) {
    return getInternalModel(env);
  }
  return value;
}

function buildUpstreamHeaders(request, env) {
  const headers = new Headers(request.headers);
  headers.delete("host");

  const hasAuthorization = Boolean(headers.get("authorization"));
  if (!hasAuthorization) {
    const fallbackKey = String(env.UPSTREAM_API_KEY || "").trim();
    if (fallbackKey) {
      headers.set("authorization", `Bearer ${fallbackKey}`);
    }
  }

  return headers;
}

function buildUpstreamUrl(requestUrl, env) {
  const upstreamBase = getUpstreamBaseUrl(env);
  const target = new URL(requestUrl);
  const upstreamPath = target.pathname.startsWith("/v1")
    ? target.pathname.slice(3)
    : target.pathname;
  return `${upstreamBase}${upstreamPath}${target.search}`;
}

async function handleModels(request, env) {
  const headers = buildUpstreamHeaders(request, env);
  const upstreamUrl = buildUpstreamUrl(request.url, env);
  const upstreamResponse = await fetch(
    new Request(upstreamUrl, {
      method: "GET",
      headers,
    }),
  );

  const contentType = String(upstreamResponse.headers.get("content-type") || "");
  if (!contentType.includes("application/json")) {
    return passthroughResponse(upstreamResponse);
  }

  const bodyText = await upstreamResponse.text();
  let payload;
  try {
    payload = JSON.parse(bodyText);
  } catch {
    return new Response(bodyText, {
      status: upstreamResponse.status,
      statusText: upstreamResponse.statusText,
      headers: upstreamResponse.headers,
    });
  }

  const normalized = normalizeModelsPayload(payload, env);
  return jsonResponse(normalized, upstreamResponse.status);
}

function normalizeModelsPayload(payload, env) {
  const externalModel = getExternalModel(env);
  const external4kModel = getExternal4kModel(env);
  const internalModel = getInternalModel(env);

  const sourceItems = Array.isArray(payload?.data)
    ? payload.data.filter((item) => item && typeof item === "object")
    : [];

  const mapped = sourceItems.map((item) => {
    const next = { ...item };
    if (next.id === internalModel) {
      next.id = externalModel;
    }
    return next;
  });

  const byId = new Map();
  for (const item of mapped) {
    const id = String(item?.id || "").trim();
    if (id) {
      byId.set(id, item);
    }
  }

  if (!byId.has(externalModel)) {
    byId.set(externalModel, {
      id: externalModel,
      object: "model",
      created: Math.floor(Date.now() / 1000),
      owned_by: "cloudflare-worker",
    });
  }

  if (!byId.has(external4kModel)) {
    byId.set(external4kModel, {
      id: external4kModel,
      object: "model",
      created: Math.floor(Date.now() / 1000),
      owned_by: "cloudflare-worker",
    });
  }

  return {
    object: "list",
    data: [...byId.values()],
  };
}

async function handleImages(request, env) {
  const method = request.method.toUpperCase();
  if (method !== "POST") {
    return jsonResponse({ error: "method_not_allowed" }, 405, {
      allow: "POST",
    });
  }

  const headers = buildUpstreamHeaders(request, env);
  const upstreamUrl = buildUpstreamUrl(request.url, env);
  const contentType = String(request.headers.get("content-type") || "");

  if (contentType.includes("application/json")) {
    const body = await request.json().catch(() => null);
    if (body && typeof body === "object") {
      const mutable = { ...body };
      if (typeof mutable.model === "string") {
        mutable.model = mapIncomingModel(mutable.model, env);
      }
      headers.set("content-type", "application/json");
      return passthroughResponse(
        await fetch(
          new Request(upstreamUrl, {
            method,
            headers,
            body: JSON.stringify(mutable),
          }),
        ),
      );
    }
  }

  if (contentType.includes("multipart/form-data")) {
    const formData = await request.formData();
    const rawModel = formData.get("model");
    if (typeof rawModel === "string") {
      formData.set("model", mapIncomingModel(rawModel, env));
    }
    headers.delete("content-type");
    return passthroughResponse(
      await fetch(
        new Request(upstreamUrl, {
          method,
          headers,
          body: formData,
        }),
      ),
    );
  }

  return passthroughResponse(
    await fetch(
      new Request(upstreamUrl, {
        method,
        headers,
        body: request.body,
      }),
    ),
  );
}

function passthroughResponse(response) {
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
  });
}
