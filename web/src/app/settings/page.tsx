"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, KeyRound, LoaderCircle } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { fetchAvailableModels, login } from "@/lib/api";
import {
  getDefaultApiBaseUrl,
  getStoredApiBaseUrl,
  setStoredApiBaseUrl,
} from "@/store/api-base-url";
import {
  getImageAsyncRelayForceEnabled,
  setImageAsyncRelayForceEnabled,
} from "@/store/image-async-relay";
import {
  getStoredImageModel,
  getStoredImageModels,
  setStoredImageModel,
  setStoredImageModels,
} from "@/store/image-model";
import {
  getImageStreamPartialImages,
  setImageStreamPartialImages,
} from "@/store/image-stream-preview";
import { getStoredAuthKey, setStoredAuthKey } from "@/store/auth";

export default function SettingsPage() {
  const [apiBaseUrl, setApiBaseUrl] = useState(getStoredApiBaseUrl());
  const [apiKey, setApiKey] = useState("");
  const [forceAsyncRelay, setForceAsyncRelay] = useState(
    getImageAsyncRelayForceEnabled(),
  );
  const [streamPartialImages, setStreamPartialImages] = useState(
    getImageStreamPartialImages(),
  );
  const [availableModels, setAvailableModels] = useState<string[]>(
    getStoredImageModels(),
  );
  const [selectedModel, setSelectedModel] = useState(getStoredImageModel());
  const [isLoadingModels, setIsLoadingModels] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void getStoredAuthKey().then((value) => {
      if (!cancelled) {
        setApiKey(value);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleFetchModels = async () => {
    const normalized = apiKey.trim();
    if (!normalized) {
      toast.error("请输入 API 密钥");
      return;
    }
    setIsLoadingModels(true);
    try {
      setStoredApiBaseUrl(apiBaseUrl);
      const models = await fetchAvailableModels(normalized);
      if (models.length === 0) {
        toast.error("未获取到可用模型");
        return;
      }
      setAvailableModels(models);
      setStoredImageModels(models);
      const nextModel = models.includes(selectedModel)
        ? selectedModel
        : models.includes("gpt-image-2")
          ? "gpt-image-2"
          : models[0];
      setSelectedModel(nextModel);
      toast.success(`已获取 ${models.length} 个模型`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "获取模型失败");
    } finally {
      setIsLoadingModels(false);
    }
  };

  const handleSave = async () => {
    const normalized = apiKey.trim();
    const model = String(selectedModel || "").trim();
    if (!normalized) {
      toast.error("请输入 API 密钥");
      return;
    }
    if (!model) {
      toast.error("请选择模型");
      return;
    }

    setIsSaving(true);
    try {
      setStoredApiBaseUrl(apiBaseUrl);
      setImageAsyncRelayForceEnabled(forceAsyncRelay);
      setImageStreamPartialImages(streamPartialImages);
      await login(normalized, model);
      await setStoredAuthKey(normalized);
      setStoredImageModel(model);
      if (availableModels.length > 0) {
        setStoredImageModels(availableModels);
      }
      toast.success(`已验证并保存模型：${model}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "验证失败");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <section className="flex h-full min-h-0 items-center justify-center overflow-y-auto">
      <div className="w-full max-w-[760px] rounded-[30px] border border-stone-200 bg-white p-6 shadow-[0_18px_60px_rgba(15,23,42,0.06)] dark:border-[var(--studio-border)] dark:bg-[var(--studio-panel)] sm:p-8">
        <div className="flex items-start gap-4">
          <span className="inline-flex size-12 shrink-0 items-center justify-center rounded-2xl bg-stone-950 text-white dark:bg-[var(--studio-accent-strong)] dark:text-[var(--studio-accent-foreground)]">
            <KeyRound className="size-5" />
          </span>
          <div className="min-w-0">
            <h1 className="text-2xl font-semibold tracking-tight text-stone-950 dark:text-[var(--studio-text-strong)]">
              本地设置
            </h1>
            <p className="mt-2 text-sm leading-7 text-stone-500 dark:text-[var(--studio-text-muted)]">
              这里保存你的 API URL 与 API 密钥到浏览器本地，并可拉取模型后选择默认生图模型。
            </p>
          </div>
        </div>

        <div className="mt-8 space-y-3">
          <label
            htmlFor="api-base-url"
            className="block text-sm font-medium text-stone-700 dark:text-[var(--studio-text)]"
          >
            API URL
          </label>
          <Input
            id="api-base-url"
            value={apiBaseUrl}
            onChange={(event) => setApiBaseUrl(event.target.value)}
            placeholder={getDefaultApiBaseUrl() || "https://api.denxio.top"}
            className="h-12 rounded-2xl border-stone-200 bg-stone-50 px-4 shadow-none focus-visible:ring-1 dark:border-[var(--studio-border)] dark:bg-[var(--studio-panel-soft)]"
          />
        </div>

        <div className="mt-8 space-y-3">
          <label
            htmlFor="api-key"
            className="block text-sm font-medium text-stone-700 dark:text-[var(--studio-text)]"
          >
            API 密钥
          </label>
          <Input
            id="api-key"
            type="password"
            value={apiKey}
            onChange={(event) => setApiKey(event.target.value)}
            placeholder="sk-..."
            className="h-12 rounded-2xl border-stone-200 bg-stone-50 px-4 shadow-none focus-visible:ring-1 dark:border-[var(--studio-border)] dark:bg-[var(--studio-panel-soft)]"
          />
        </div>

        <div className="mt-8 space-y-3">
          <label
            htmlFor="model-select"
            className="block text-sm font-medium text-stone-700 dark:text-[var(--studio-text)]"
          >
            生图模型
          </label>
          <div className="flex gap-2">
            <select
              id="model-select"
              value={selectedModel}
              onChange={(event) => setSelectedModel(event.target.value)}
              className="h-12 flex-1 rounded-2xl border border-stone-200 bg-stone-50 px-4 text-sm dark:border-[var(--studio-border)] dark:bg-[var(--studio-panel-soft)]"
            >
              {availableModels.length === 0 ? (
                <option value={selectedModel || ""}>请先获取模型列表</option>
              ) : (
                availableModels.map((model) => (
                  <option key={model} value={model}>
                    {model}
                  </option>
                ))
              )}
            </select>
            <Button
              type="button"
              variant="outline"
              className="h-12 rounded-2xl"
              onClick={() => void handleFetchModels()}
              disabled={isLoadingModels}
            >
              {isLoadingModels ? <LoaderCircle className="size-4 animate-spin" /> : null}
              获取模型
            </Button>
          </div>
        </div>

        <div className="mt-6 rounded-2xl border border-stone-200 bg-stone-50/70 p-4 dark:border-[var(--studio-border)] dark:bg-[var(--studio-panel-soft)]">
          <label
            htmlFor="force-async-relay"
            className="flex cursor-pointer items-start gap-3"
          >
            <Checkbox
              id="force-async-relay"
              checked={forceAsyncRelay}
              onCheckedChange={(checked) => setForceAsyncRelay(Boolean(checked))}
              className="mt-0.5"
            />
            <span className="space-y-1">
              <span className="block text-sm font-medium text-stone-800 dark:text-[var(--studio-text-strong)]">
                强制启用流式/异步中转
              </span>
              <span className="block text-xs leading-6 text-stone-500 dark:text-[var(--studio-text-muted)]">
                开启后会在图片请求中发送 stream=true，适合支持流式返回的中转站。
              </span>
            </span>
          </label>
        </div>

        <div className="mt-4 rounded-2xl border border-stone-200 bg-stone-50/70 p-4 dark:border-[var(--studio-border)] dark:bg-[var(--studio-panel-soft)]">
          <div className="space-y-2">
            <label
              htmlFor="stream-partial-images"
              className="block text-sm font-medium text-stone-800 dark:text-[var(--studio-text-strong)]"
            >
              流式中间预览张数（0-3）
            </label>
            <Input
              id="stream-partial-images"
              type="number"
              min={0}
              max={3}
              step={1}
              value={streamPartialImages}
              onChange={(event) => {
                const next = Number(event.target.value);
                if (!Number.isFinite(next)) {
                  setStreamPartialImages(0);
                  return;
                }
                setStreamPartialImages(Math.min(3, Math.max(0, Math.floor(next))));
              }}
              className="h-10 w-[180px] rounded-xl border-stone-200 bg-white px-3 shadow-none focus-visible:ring-1 dark:border-[var(--studio-border)] dark:bg-[var(--studio-panel)]"
            />
            <p className="text-xs leading-6 text-stone-500 dark:text-[var(--studio-text-muted)]">
              0 表示不请求中间图，仅保留流式最终图。
            </p>
          </div>
        </div>

        <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
          <div className="inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-700 dark:bg-[var(--studio-panel-soft)] dark:text-[var(--studio-text)]">
            <CheckCircle2 className="size-4" />
            验证接口：/v1/models
          </div>
          <Button
            className="h-10 rounded-full bg-stone-950 px-5 text-white hover:bg-stone-800 dark:bg-[var(--studio-accent-strong)] dark:text-[var(--studio-accent-foreground)]"
            disabled={isSaving}
            onClick={() => void handleSave()}
          >
            {isSaving ? <LoaderCircle className="size-4 animate-spin" /> : null}
            保存并验证
          </Button>
        </div>
      </div>
    </section>
  );
}
