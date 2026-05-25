"use client";

export type PromptLibraryItem = {
  id: string;
  title: string;
  preview?: string;
  referenceImageUrls?: string[];
  summary?: string;
  prompt: string;
  model: string;
  mode: "generate" | "edit";
  category: string;
  subCategory?: string;
  tags: string[];
  language: string;
  author?: string;
  link?: string;
  sourceUrl?: string;
  createdAt: string;
  updatedAt: string;
};

type PendingPromptPayload = {
  title?: string;
  prompt: string;
  mode?: "generate" | "edit";
  model?: string;
};

const PROMPT_LIBRARY_KEY = "studio.prompt-library.items.v1";
const PENDING_PROMPT_KEY = "studio.prompt-library.pending.v1";
const PROMPT_FAVORITES_KEY = "studio.prompt-library.favorites.v1";

function safeJsonParse<T>(raw: string | null, fallback: T): T {
  if (!raw) {
    return fallback;
  }
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function normalizeTags(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((tag) => String(tag || "").trim())
    .filter(Boolean)
    .slice(0, 16);
}

function normalizePromptItem(value: unknown): PromptLibraryItem | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const record = value as Record<string, unknown>;
  const title = String(record.title || "").trim();
  const prompt = String(record.prompt || "").trim();
  if (!title || !prompt) {
    return null;
  }
  const now = new Date().toISOString();
  return {
    id: String(record.id || `${Date.now()}-${Math.random().toString(16).slice(2)}`),
    title,
    preview: String(record.preview || "").trim() || undefined,
    referenceImageUrls: Array.isArray(record.referenceImageUrls)
      ? record.referenceImageUrls
          .map((item) => String(item || "").trim())
          .filter(Boolean)
      : Array.isArray(record.reference_image_urls)
        ? record.reference_image_urls
            .map((item) => String(item || "").trim())
            .filter(Boolean)
        : undefined,
    summary: String(record.summary || "").trim() || undefined,
    prompt,
    model: String(record.model || "gpt-image-2").trim() || "gpt-image-2",
    mode: String(record.mode || "generate").trim() === "edit" ? "edit" : "generate",
    category: String(record.category || "通用").trim() || "通用",
    subCategory:
      String(record.subCategory || record.sub_category || "").trim() || undefined,
    tags: normalizeTags(record.tags),
    language: String(record.language || "zh").trim() || "zh",
    author: String(record.author || "").trim() || undefined,
    link: String(record.link || "").trim() || undefined,
    sourceUrl: String(record.sourceUrl || "").trim() || undefined,
    createdAt: String(record.createdAt || now),
    updatedAt: String(record.updatedAt || now),
  };
}

export function listPromptLibraryItems(): PromptLibraryItem[] {
  if (typeof window === "undefined") {
    return [];
  }
  const raw = window.localStorage.getItem(PROMPT_LIBRARY_KEY);
  const parsed = safeJsonParse<unknown[]>(raw, []);
  const normalized = parsed
    .map(normalizePromptItem)
    .filter((item): item is PromptLibraryItem => Boolean(item));
  return normalized.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export function savePromptLibraryItems(items: PromptLibraryItem[]) {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.setItem(PROMPT_LIBRARY_KEY, JSON.stringify(items));
}

export function upsertPromptLibraryItem(
  payload: Omit<PromptLibraryItem, "id" | "createdAt" | "updatedAt"> & {
    id?: string;
  },
) {
  const now = new Date().toISOString();
  const existing = listPromptLibraryItems();
  const nextItem: PromptLibraryItem = {
    ...payload,
    id: payload.id || `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    createdAt:
      existing.find((item) => item.id === payload.id)?.createdAt || now,
    updatedAt: now,
  };
  const next = [
    nextItem,
    ...existing.filter((item) => item.id !== nextItem.id),
  ];
  savePromptLibraryItems(next);
  return nextItem;
}

export function deletePromptLibraryItem(id: string) {
  const next = listPromptLibraryItems().filter((item) => item.id !== id);
  savePromptLibraryItems(next);
}

export function setPendingPromptForWorkspace(payload: PendingPromptPayload) {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.setItem(PENDING_PROMPT_KEY, JSON.stringify(payload));
}

export function consumePendingPromptForWorkspace(): PendingPromptPayload | null {
  if (typeof window === "undefined") {
    return null;
  }
  const raw = window.localStorage.getItem(PENDING_PROMPT_KEY);
  if (!raw) {
    return null;
  }
  window.localStorage.removeItem(PENDING_PROMPT_KEY);
  const parsed = safeJsonParse<PendingPromptPayload | null>(raw, null);
  if (!parsed || !String(parsed.prompt || "").trim()) {
    return null;
  }
  return {
    title: String(parsed.title || "").trim() || undefined,
    prompt: String(parsed.prompt || "").trim(),
    mode: String(parsed.mode || "").trim() === "edit" ? "edit" : "generate",
    model: String(parsed.model || "").trim() || undefined,
  };
}

export function getPromptFavoriteIds(): string[] {
  if (typeof window === "undefined") {
    return [];
  }
  const raw = window.localStorage.getItem(PROMPT_FAVORITES_KEY);
  const parsed = safeJsonParse<unknown[]>(raw, []);
  return parsed
    .map((item) => String(item || "").trim())
    .filter(Boolean);
}

export function setPromptFavoriteIds(ids: string[]) {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.setItem(
    PROMPT_FAVORITES_KEY,
    JSON.stringify(
      ids
        .map((item) => String(item || "").trim())
        .filter(Boolean),
    ),
  );
}
