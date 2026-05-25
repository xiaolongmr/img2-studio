"use client";

const IMAGE_MODEL_KEY = "studio.image-model.selected.v1";
const IMAGE_MODELS_KEY = "studio.image-model.available.v1";

export function getStoredImageModel(defaultModel = "gpt-image-2") {
  if (typeof window === "undefined") {
    return defaultModel;
  }
  try {
    const value = window.localStorage.getItem(IMAGE_MODEL_KEY);
    const normalized = String(value || "").trim();
    return normalized || defaultModel;
  } catch {
    return defaultModel;
  }
}

export function setStoredImageModel(model: string) {
  const normalized = String(model || "").trim();
  if (typeof window === "undefined") {
    return;
  }
  try {
    if (!normalized) {
      window.localStorage.removeItem(IMAGE_MODEL_KEY);
      return;
    }
    window.localStorage.setItem(IMAGE_MODEL_KEY, normalized);
  } catch {
    // ignore localStorage write failures
  }
}

export function getStoredImageModels() {
  if (typeof window === "undefined") {
    return [] as string[];
  }
  try {
    const raw = window.localStorage.getItem(IMAGE_MODELS_KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : [];
    if (!Array.isArray(parsed)) {
      return [] as string[];
    }
    return parsed
      .map((item) => String(item || "").trim())
      .filter(Boolean);
  } catch {
    return [] as string[];
  }
}

export function setStoredImageModels(models: string[]) {
  if (typeof window === "undefined") {
    return;
  }
  try {
    const normalized = models
      .map((item) => String(item || "").trim())
      .filter(Boolean);
    window.localStorage.setItem(IMAGE_MODELS_KEY, JSON.stringify(normalized));
  } catch {
    // ignore localStorage write failures
  }
}
