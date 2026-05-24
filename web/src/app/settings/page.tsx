"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, KeyRound, LoaderCircle } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { login } from "@/lib/api";
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

  const handleSave = async () => {
    const normalized = apiKey.trim();
    if (!normalized) {
      toast.error("请输入 NewAPI key");
      return;
    }

    setIsSaving(true);
    try {
      setStoredApiBaseUrl(apiBaseUrl);
      setImageAsyncRelayForceEnabled(forceAsyncRelay);
      setImageStreamPartialImages(streamPartialImages);
      await login(normalized);
      await setStoredAuthKey(normalized);
      toast.success("已验证 gpt-image-2，并保存到本机浏览器");
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
              这里保存你的 API URL 和 NewAPI key 到当前浏览器本地，用于调用 gpt-image-2，不会写入服务端。
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
            htmlFor="newapi-key"
            className="block text-sm font-medium text-stone-700 dark:text-[var(--studio-text)]"
          >
            NewAPI key
          </label>
          <Input
            id="newapi-key"
            type="password"
            value={apiKey}
            onChange={(event) => setApiKey(event.target.value)}
            placeholder="sk-..."
            className="h-12 rounded-2xl border-stone-200 bg-stone-50 px-4 shadow-none focus-visible:ring-1 dark:border-[var(--studio-border)] dark:bg-[var(--studio-panel-soft)]"
          />
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
                开启后会在图片请求中发送 stream=true（不再附带 X-Rivermoon-Async 头），适合支持流式图片返回的中转站，避免长任务被 2 分钟超时截断。
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
              0 表示不请求中间图，仅保留流式最终图；数值越大，中间预览越丰富，但会带来少量额外 token 花费。
            </p>
          </div>
        </div>

        <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
          <div className="inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-700 dark:bg-[var(--studio-panel-soft)] dark:text-[var(--studio-text)]">
            <CheckCircle2 className="size-4" />
            验证接口：/v1/models · 模型：gpt-image-2
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
