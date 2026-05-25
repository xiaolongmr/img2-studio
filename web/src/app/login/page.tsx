"use client";

import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { CircleAlert, LoaderCircle, LockKeyhole, Sparkles } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { fetchAvailableModels, login } from "@/lib/api";
import { getStoredApiBaseUrl, setStoredApiBaseUrl } from "@/store/api-base-url";
import { setStoredAuthKey } from "@/store/auth";
import {
  getStoredImageModel,
  getStoredImageModels,
  setStoredImageModel,
  setStoredImageModels,
} from "@/store/image-model";

export default function LoginPage() {
  const navigate = useNavigate();
  const [apiBaseUrl, setApiBaseUrl] = useState(getStoredApiBaseUrl());
  const [authKey, setAuthKey] = useState("");
  const [availableModels, setAvailableModels] = useState<string[]>(
    getStoredImageModels(),
  );
  const [selectedModel, setSelectedModel] = useState(getStoredImageModel());
  const [isLoadingModels, setIsLoadingModels] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleFetchModels = async () => {
    const normalizedAuthKey = authKey.trim();
    if (!normalizedAuthKey) {
      toast.error("请输入 API 密钥");
      return;
    }
    setIsLoadingModels(true);
    try {
      setStoredApiBaseUrl(apiBaseUrl);
      const models = await fetchAvailableModels(normalizedAuthKey);
      setAvailableModels(models);
      setStoredImageModels(models);
      if (models.length === 0) {
        toast.error("未获取到可用模型");
        return;
      }
      if (!models.includes(selectedModel)) {
        setSelectedModel(models.includes("gpt-image-2") ? "gpt-image-2" : models[0]);
      }
      toast.success(`已获取 ${models.length} 个模型`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "获取模型失败");
    } finally {
      setIsLoadingModels(false);
    }
  };

  const handleLogin = async () => {
    const normalizedAuthKey = authKey.trim();
    if (!normalizedAuthKey) {
      toast.error("请输入 API 密钥");
      return;
    }
    const model = String(selectedModel || "").trim();
    if (!model) {
      toast.error("请先选择模型");
      return;
    }

    setIsSubmitting(true);
    try {
      setStoredApiBaseUrl(apiBaseUrl);
      await login(normalizedAuthKey, model);
      await setStoredAuthKey(normalizedAuthKey);
      setStoredImageModel(model);
      navigate("/image", { replace: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : "登录失败";
      toast.error(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="grid h-full min-h-0 w-full place-items-center overflow-y-auto">
      <div className="grid w-full max-w-[1120px] overflow-hidden rounded-[32px] border border-stone-200 bg-white shadow-[0_24px_80px_rgba(15,23,42,0.08)] lg:grid-cols-[1.05fr_0.95fr]">
        <div className="hidden bg-[radial-gradient(circle_at_top_left,_rgba(255,255,255,0.78),_rgba(255,255,255,0.18)_38%,_rgba(28,25,23,0.08)_100%),linear-gradient(155deg,#111827_0%,#1f2937_52%,#374151_100%)] p-8 text-white lg:flex lg:flex-col lg:justify-between">
          <div className="flex items-center gap-3">
            <span className="flex size-11 items-center justify-center rounded-2xl bg-white/12 backdrop-blur">
              <Sparkles className="size-4" />
            </span>
            <div>
              <div className="text-sm font-semibold tracking-tight">Rivermoon Image Studio</div>
              <div className="mt-1 text-xs text-white/65">模型可选的图片工作台</div>
            </div>
          </div>

          <div className="space-y-6">
            <div className="space-y-3">
              <div className="text-sm font-medium uppercase tracking-[0.24em] text-white/55">Image Studio</div>
              <h1 className="max-w-[420px] text-[40px] font-semibold leading-[1.1] tracking-tight">
                先拉取模型，再选择模型进入工作台。
              </h1>
              <p className="max-w-[430px] text-sm leading-7 text-white/72">
                与 `curl /v1/models` 一致，直接从你的 API URL 拉可用模型。
              </p>
            </div>
          </div>

          <div className="text-xs text-white/50">密钥只保存在当前浏览器本地，不注入服务端后台。</div>
        </div>

        <div className="flex items-center justify-center px-5 py-8 sm:px-8 lg:px-10">
          <div className="w-full max-w-[420px] space-y-6">
            <div className="space-y-4">
              <div className="inline-flex size-14 items-center justify-center rounded-[18px] bg-stone-950 text-white shadow-sm">
                <LockKeyhole className="size-5" />
              </div>
              <div className="space-y-2">
                <h1 className="text-3xl font-semibold tracking-tight text-stone-950">进入图片工作区</h1>
                <p className="text-sm leading-7 text-stone-500">
                  输入 API URL 与 API 密钥，先获取模型列表，再选择模型验证登录。
                </p>
              </div>
            </div>

            <div className="space-y-3">
              <label htmlFor="api-base-url" className="block text-sm font-medium text-stone-700">
                API URL
              </label>
              <Input
                id="api-base-url"
                value={apiBaseUrl}
                onChange={(event) => setApiBaseUrl(event.target.value)}
                placeholder="https://api.denxio.top"
                className="h-13 rounded-2xl border-stone-200 bg-stone-50 px-4 shadow-none focus-visible:ring-1"
              />
            </div>

            <div className="space-y-3">
              <label htmlFor="auth-key" className="block text-sm font-medium text-stone-700">
                API 密钥
              </label>
              <Input
                id="auth-key"
                type="password"
                value={authKey}
                onChange={(event) => setAuthKey(event.target.value)}
                placeholder="sk-..."
                className="h-13 rounded-2xl border-stone-200 bg-stone-50 px-4 shadow-none focus-visible:ring-1"
              />
            </div>

            <div className="space-y-3">
              <label htmlFor="model-select" className="block text-sm font-medium text-stone-700">
                生图模型
              </label>
              <div className="flex gap-2">
                <select
                  id="model-select"
                  value={selectedModel}
                  onChange={(event) => setSelectedModel(event.target.value)}
                  className="h-13 flex-1 rounded-2xl border border-stone-200 bg-stone-50 px-4 text-sm"
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
                  className="h-13 rounded-2xl"
                  onClick={() => void handleFetchModels()}
                  disabled={isLoadingModels}
                >
                  {isLoadingModels ? <LoaderCircle className="size-4 animate-spin" /> : null}
                  获取模型
                </Button>
              </div>
            </div>

            <Button
              className="h-13 w-full rounded-2xl bg-stone-950 text-white hover:bg-stone-800"
              onClick={() => void handleLogin()}
              disabled={isSubmitting}
            >
              {isSubmitting ? <LoaderCircle className="size-4 animate-spin" /> : null}
              验证并进入
            </Button>

            <div className="rounded-2xl border border-stone-200 bg-stone-50 px-4 py-4 text-xs leading-6 text-stone-500">
              本页面会调用 `/v1/models`，并验证你选择的模型是否可用。
            </div>

            <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4 text-sm leading-6 text-amber-950">
              <div className="flex items-center gap-2 font-medium">
                <CircleAlert className="size-4" />
                使用与风险提示
              </div>
              <div className="mt-2">
                请确认你使用的是自己的 API 密钥，所有请求都按你的密钥账户计费。
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
