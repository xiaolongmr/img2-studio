"use client";

import { memo, useEffect, useMemo, useRef, useState } from "react";
import { History, LoaderCircle, MessageSquarePlus, Trash2 } from "lucide-react";

import { AppImage as Image } from "@/components/app-image";
import { Button } from "@/components/ui/button";
import type { ImageConversation, ImageMode } from "@/store/image-conversations";
import { cn } from "@/lib/utils";

const INITIAL_VISIBLE_CONVERSATIONS = 24;
const VISIBLE_CONVERSATION_STEP = 24;
const PREVIEW_THUMBNAIL_SIZE = 112;
const PREVIEW_THUMBNAIL_QUALITY = 0.76;
const MAX_PREVIEW_THUMBNAIL_CACHE_SIZE = 240;

const previewThumbnailCache = new Map<string, string>();
const previewThumbnailPromiseCache = new Map<string, Promise<string>>();

function runOnIdle(callback: () => void) {
  if (typeof window !== "undefined" && "requestIdleCallback" in window) {
    const requestIdleCallback = window.requestIdleCallback as (
      handler: () => void,
      options?: { timeout: number },
    ) => number;
    const idleId = requestIdleCallback(callback, { timeout: 160 });
    return () => {
      const cancelIdleCallback = window.cancelIdleCallback as (id: number) => void;
      cancelIdleCallback(idleId);
    };
  }
  const timeoutId = window.setTimeout(callback, 16);
  return () => window.clearTimeout(timeoutId);
}

function buildPreviewThumbnailCacheKey(conversationId: string, src: string) {
  const value = String(src || "");
  if (!value) {
    return "";
  }
  if (value.startsWith("data:")) {
    return `${conversationId}:data:${value.length}:${value.slice(0, 48)}:${value.slice(-24)}`;
  }
  return `${conversationId}:url:${value}`;
}

function rememberPreviewThumbnail(key: string, value: string) {
  if (!key || !value) {
    return;
  }
  previewThumbnailCache.set(key, value);
  while (previewThumbnailCache.size > MAX_PREVIEW_THUMBNAIL_CACHE_SIZE) {
    const oldestKey = previewThumbnailCache.keys().next().value as string | undefined;
    if (!oldestKey) {
      break;
    }
    previewThumbnailCache.delete(oldestKey);
    previewThumbnailPromiseCache.delete(oldestKey);
  }
}

function loadPreviewImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new window.Image();
    img.decoding = "async";
    if (!src.startsWith("data:")) {
      img.crossOrigin = "anonymous";
    }
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("preview image load failed"));
    img.src = src;
  });
}

async function createPreviewThumbnail(src: string) {
  const source = String(src || "").trim();
  if (!source) {
    return "";
  }
  const image = await loadPreviewImage(source);
  const naturalWidth = Math.max(1, image.naturalWidth || image.width || 1);
  const naturalHeight = Math.max(1, image.naturalHeight || image.height || 1);
  const scale = Math.min(
    1,
    PREVIEW_THUMBNAIL_SIZE / Math.max(naturalWidth, naturalHeight),
  );
  const outputWidth = Math.max(1, Math.round(naturalWidth * scale));
  const outputHeight = Math.max(1, Math.round(naturalHeight * scale));
  if (
    outputWidth >= naturalWidth &&
    outputHeight >= naturalHeight &&
    source.startsWith("data:")
  ) {
    return source;
  }
  const canvas = document.createElement("canvas");
  canvas.width = outputWidth;
  canvas.height = outputHeight;
  const context = canvas.getContext("2d");
  if (!context) {
    return source;
  }
  context.drawImage(image, 0, 0, outputWidth, outputHeight);
  return canvas.toDataURL("image/webp", PREVIEW_THUMBNAIL_QUALITY);
}

function resolvePreviewThumbnail(
  conversationId: string,
  src: string,
): Promise<string> {
  const key = buildPreviewThumbnailCacheKey(conversationId, src);
  if (!key) {
    return Promise.resolve("");
  }
  const cached = previewThumbnailCache.get(key);
  if (cached) {
    return Promise.resolve(cached);
  }
  const pending = previewThumbnailPromiseCache.get(key);
  if (pending) {
    return pending;
  }
  const task = createPreviewThumbnail(src)
    .then((thumbnail) => {
      const normalized = thumbnail || src;
      rememberPreviewThumbnail(key, normalized);
      return normalized;
    })
    .catch(() => {
      rememberPreviewThumbnail(key, src);
      return src;
    })
    .finally(() => {
      previewThumbnailPromiseCache.delete(key);
    });
  previewThumbnailPromiseCache.set(key, task);
  return task;
}

type HistorySidebarProps = {
  conversations: ImageConversation[];
  selectedConversationId: string | null;
  isLoadingHistory: boolean;
  hasActiveTasks: boolean;
  activeConversationIds: Set<string>;
  activeConversationElapsedSecondsById: Record<string, number>;
  modeLabelMap: Record<ImageMode, string>;
  buildConversationPreviewSource: (conversation: ImageConversation) => string;
  formatConversationTime: (value: string) => string;
  formatTimerClock: (totalSeconds: number) => string;
  onCreateDraft: () => void;
  onClearHistory: () => Promise<void>;
  onFocusConversation: (id: string) => void;
  onDeleteConversation: (id: string) => Promise<void>;
  standalone?: boolean;
  compact?: boolean;
};

type HistoryConversationCardProps = {
  id: string;
  title: string;
  prompt: string;
  modeLabel: string;
  previewSrc: string;
  createdAtLabel: string;
  active: boolean;
  compact: boolean;
  elapsedSeconds: number;
  elapsedLabel: string;
  disabled: boolean;
  onFocusConversation: (id: string) => void;
  onDeleteConversation: (id: string) => Promise<void>;
};

function hasSameConversationIdSet(left: Set<string>, right: Set<string>) {
  if (left === right) {
    return true;
  }
  if (left.size !== right.size) {
    return false;
  }
  for (const value of left) {
    if (!right.has(value)) {
      return false;
    }
  }
  return true;
}

function hasSameElapsedMap(
  left: Record<string, number>,
  right: Record<string, number>,
) {
  if (left === right) {
    return true;
  }
  const leftKeys = Object.keys(left);
  const rightKeys = Object.keys(right);
  if (leftKeys.length !== rightKeys.length) {
    return false;
  }
  for (const key of leftKeys) {
    if (left[key] !== right[key]) {
      return false;
    }
  }
  return true;
}

const HistoryConversationCard = memo(
  function HistoryConversationCard({
    id,
    title,
    prompt,
    modeLabel,
    previewSrc,
    createdAtLabel,
    active,
    compact,
    elapsedSeconds,
    elapsedLabel,
    disabled,
    onFocusConversation,
    onDeleteConversation,
  }: HistoryConversationCardProps) {
    return (
      <div
        data-conversation-id={id}
        style={{
          contentVisibility: "auto",
          containIntrinsicSize: compact ? "64px 64px" : "96px 320px",
        }}
        className={cn(
          "group relative rounded-[22px] border transition",
          compact ? "mx-auto grid size-16 place-items-center p-0" : "p-2",
          active
            ? "border-stone-200 bg-white shadow-sm dark:border-[var(--studio-border)] dark:bg-[var(--studio-panel-soft)]"
            : "border-transparent bg-transparent hover:border-stone-200/80 hover:bg-white/70 dark:hover:border-[var(--studio-border)] dark:hover:bg-[var(--studio-panel-soft)]",
        )}
      >
        <div
          className={cn(
            "flex items-center",
            compact ? "h-full w-full justify-center" : "gap-3",
          )}
        >
          <button
            type="button"
            onClick={() => onFocusConversation(id)}
            className={cn(
              "items-center",
              compact
                ? "grid h-full w-full place-items-center"
                : "flex min-w-0 flex-1 gap-3 text-left",
            )}
            title={compact ? title : undefined}
          >
            <div
              className={cn(
                "flex shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-stone-100",
                compact ? "size-12" : "size-14",
              )}
            >
              {previewSrc ? (
                <Image
                  src={previewSrc}
                  alt={title}
                  width={compact ? 48 : 56}
                  height={compact ? 48 : 56}
                  unoptimized
                  loading="lazy"
                  decoding="async"
                  fetchPriority="low"
                  className="h-full w-full object-cover"
                />
              ) : (
                <History className="size-4 text-stone-400" />
              )}
            </div>
            {!compact ? (
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="rounded-full bg-stone-100 px-2 py-0.5 text-[11px] font-medium text-stone-500">
                    {modeLabel}
                  </span>
                  {elapsedSeconds > 0 ? (
                    <span className="rounded-full bg-sky-50 px-2 py-0.5 text-[11px] font-medium text-sky-700">
                      生成中 {elapsedLabel}
                    </span>
                  ) : null}
                  <span className="truncate text-xs text-stone-400">
                    {createdAtLabel}
                  </span>
                </div>
                <div className="mt-2 truncate text-sm font-medium text-stone-800">
                  {title}
                </div>
                <div className="mt-1 line-clamp-2 text-xs leading-5 text-stone-500">
                  {prompt || "无额外提示词"}
                </div>
              </div>
            ) : null}
          </button>
          {!compact ? (
            <button
              type="button"
              onClick={() => void onDeleteConversation(id)}
              disabled={disabled}
              title={disabled ? "当前会话仍在处理中，暂时不能删除" : "删除会话"}
              className="inline-flex size-8 shrink-0 items-center justify-center rounded-xl text-stone-400 opacity-100 transition hover:bg-stone-100 hover:text-rose-500 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-stone-400 lg:opacity-0 lg:group-hover:opacity-100 lg:disabled:opacity-40"
              aria-label="删除会话"
            >
              <Trash2 className="size-4" />
            </button>
          ) : null}
        </div>
      </div>
    );
  },
  (prev, next) =>
    prev.id === next.id &&
    prev.title === next.title &&
    prev.prompt === next.prompt &&
    prev.modeLabel === next.modeLabel &&
    prev.previewSrc === next.previewSrc &&
    prev.createdAtLabel === next.createdAtLabel &&
    prev.active === next.active &&
    prev.compact === next.compact &&
    prev.elapsedSeconds === next.elapsedSeconds &&
    prev.elapsedLabel === next.elapsedLabel &&
    prev.disabled === next.disabled &&
    prev.onFocusConversation === next.onFocusConversation &&
    prev.onDeleteConversation === next.onDeleteConversation,
);

export const HistorySidebar = memo(
  function HistorySidebar({
    conversations,
    selectedConversationId,
    isLoadingHistory,
    hasActiveTasks,
    activeConversationIds,
    activeConversationElapsedSecondsById,
    modeLabelMap,
    buildConversationPreviewSource,
    formatConversationTime,
    formatTimerClock,
    onCreateDraft,
    onClearHistory,
    onFocusConversation,
    onDeleteConversation,
    standalone = false,
    compact = false,
  }: HistorySidebarProps) {
    const scrollContainerRef = useRef<HTMLDivElement | null>(null);
    const [previewThumbnailByConversationId, setPreviewThumbnailByConversationId] =
      useState<Record<string, string>>({});
    const [visibleCount, setVisibleCount] = useState(
      INITIAL_VISIBLE_CONVERSATIONS,
    );
    const visibleConversations = useMemo(
      () => conversations.slice(0, visibleCount),
      [conversations, visibleCount],
    );
    const visibleConversationPreviewInputs = useMemo(
      () =>
        visibleConversations.map((conversation) => ({
          id: conversation.id,
          src: buildConversationPreviewSource(conversation),
        })),
      [buildConversationPreviewSource, visibleConversations],
    );
    const hasMoreConversations = visibleCount < conversations.length;

    useEffect(() => {
      setVisibleCount((current) => {
        const minVisible = Math.min(
          conversations.length,
          INITIAL_VISIBLE_CONVERSATIONS,
        );
        if (current < minVisible) {
          return minVisible;
        }
        if (current > conversations.length) {
          return conversations.length;
        }
        return current;
      });
    }, [conversations.length]);

    useEffect(() => {
      setPreviewThumbnailByConversationId((current) => {
        const validConversationIds = new Set(conversations.map((item) => item.id));
        let changed = false;
        const next: Record<string, string> = {};
        for (const [conversationId, src] of Object.entries(current)) {
          if (!validConversationIds.has(conversationId)) {
            changed = true;
            continue;
          }
          next[conversationId] = src;
        }
        return changed ? next : current;
      });
    }, [conversations]);

    useEffect(() => {
      if (visibleConversationPreviewInputs.length === 0) {
        return;
      }
      let cancelled = false;
      const cancelIdle = runOnIdle(() => {
        const tasks = visibleConversationPreviewInputs
          .map(({ id, src }) => ({
            id,
            src: String(src || "").trim(),
          }))
          .filter((item) => item.src)
          .map(async ({ id, src }) => {
            const nextSrc = await resolvePreviewThumbnail(id, src);
            return { id, src: nextSrc || src };
          });
        if (tasks.length === 0) {
          return;
        }
        void Promise.all(tasks).then((entries) => {
          if (cancelled) {
            return;
          }
          setPreviewThumbnailByConversationId((current) => {
            let changed = false;
            const next = { ...current };
            for (const entry of entries) {
              if (next[entry.id] === entry.src) {
                continue;
              }
              next[entry.id] = entry.src;
              changed = true;
            }
            return changed ? next : current;
          });
        });
      });

      return () => {
        cancelled = true;
        cancelIdle();
      };
    }, [visibleConversationPreviewInputs]);

    useEffect(() => {
      const container = scrollContainerRef.current;
      if (!container || !hasMoreConversations) {
        return;
      }
      const handleScroll = () => {
        const remainingHeight =
          container.scrollHeight - container.clientHeight - container.scrollTop;
        if (remainingHeight > 360) {
          return;
        }
        setVisibleCount((current) =>
          Math.min(conversations.length, current + VISIBLE_CONVERSATION_STEP),
        );
      };

      handleScroll();
      container.addEventListener("scroll", handleScroll, { passive: true });
      return () => {
        container.removeEventListener("scroll", handleScroll);
      };
    }, [conversations.length, hasMoreConversations]);

    useEffect(() => {
      if (!selectedConversationId) {
        return;
      }
      const container = scrollContainerRef.current;
      if (!container) {
        return;
      }
      const selectedItem = container.querySelector<HTMLElement>(
        `[data-conversation-id="${selectedConversationId}"]`,
      );
      if (!selectedItem) {
        return;
      }
      selectedItem.scrollIntoView({ block: "nearest", inline: "nearest" });
    }, [selectedConversationId, visibleConversations]);

    return (
      <aside
        className={cn(
          "overflow-hidden rounded-[28px] border border-stone-200 bg-[#f8f8f7] shadow-[0_8px_30px_rgba(15,23,42,0.04)] transition-colors duration-200 dark:border-[var(--studio-border)] dark:bg-[var(--studio-panel)] dark:shadow-[0_20px_50px_-32px_rgba(0,0,0,0.7)]",
          standalone
            ? "min-h-[420px]"
            : "order-2 max-h-[36vh] lg:order-none lg:h-full lg:max-h-none lg:min-h-0",
          compact ? "lg:rounded-[22px]" : "",
        )}
      >
        <div className="flex h-full min-h-0 flex-col">
          {compact ? (
            <div className="border-b border-stone-200/80 px-2 py-3">
              <div className="flex flex-col items-center gap-2">
                <span
                  className="inline-flex min-w-8 justify-center rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-stone-500 shadow-sm dark:bg-[var(--studio-panel-soft)] dark:text-[var(--studio-text)]"
                  title={`会话数 ${conversations.length}`}
                >
                  {conversations.length}
                </span>
                <Button
                  className="h-10 w-10 rounded-xl bg-stone-950 px-0 text-white hover:bg-stone-800 dark:bg-[var(--studio-accent-strong)] dark:text-[var(--studio-accent-foreground)] dark:hover:bg-[var(--studio-accent)]"
                  onClick={onCreateDraft}
                  title="新建对话"
                  aria-label="新建对话"
                >
                  <MessageSquarePlus className="size-5" />
                </Button>
                <Button
                  variant="outline"
                  className="h-10 w-10 rounded-xl border-stone-200 bg-white px-0 text-stone-600 hover:bg-stone-50 dark:border-[var(--studio-border)] dark:bg-[var(--studio-panel-soft)] dark:text-[var(--studio-text)] dark:hover:bg-[var(--studio-panel-muted)]"
                  onClick={() => void onClearHistory()}
                  disabled={conversations.length === 0 || hasActiveTasks}
                  title={
                    hasActiveTasks ? "有任务运行中时不能清空历史" : "清空历史记录"
                  }
                  aria-label="清空历史记录"
                >
                  <Trash2 className="size-5" />
                </Button>
              </div>
            </div>
          ) : (
            <div className="border-b border-stone-200/80 px-4 py-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold tracking-tight text-stone-900 dark:text-[var(--studio-text-strong)]">
                    历史记录
                  </h2>
                </div>
                <span className="rounded-full bg-white px-3 py-1 text-xs font-medium text-stone-500 shadow-sm dark:bg-[var(--studio-panel-soft)] dark:text-[var(--studio-text)]">
                  {conversations.length}
                </span>
              </div>
              <div className="mt-4 flex items-center gap-2">
                <Button
                  className="h-11 flex-1 rounded-2xl bg-stone-950 text-white hover:bg-stone-800 dark:bg-[var(--studio-accent-strong)] dark:text-[var(--studio-accent-foreground)] dark:hover:bg-[var(--studio-accent)]"
                  onClick={onCreateDraft}
                >
                  <MessageSquarePlus className="size-4" />
                  新建对话
                </Button>
                <Button
                  variant="outline"
                  className="h-11 rounded-2xl border-stone-200 bg-white px-3 text-stone-600 hover:bg-stone-50 dark:border-[var(--studio-border)] dark:bg-[var(--studio-panel-soft)] dark:text-[var(--studio-text)] dark:hover:bg-[var(--studio-panel-muted)]"
                  onClick={() => void onClearHistory()}
                  disabled={conversations.length === 0 || hasActiveTasks}
                  title={
                    hasActiveTasks ? "有任务运行中时不能清空历史" : "清空历史记录"
                  }
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>
            </div>
          )}

          <div
            ref={scrollContainerRef}
            className={cn(
              "history-scrollbar min-h-0 flex-1 overflow-y-auto py-3",
              compact ? "px-1.5" : "px-2",
            )}
          >
            {isLoadingHistory ? (
              <div className="flex items-center gap-2 rounded-2xl px-3 py-3 text-sm text-stone-500">
                <LoaderCircle className="size-4 animate-spin" />
                {compact ? null : "正在读取会话记录"}
              </div>
            ) : conversations.length === 0 ? (
              <div
                className={cn(
                  "px-3 py-4 text-sm leading-6 text-stone-500",
                  compact ? "flex justify-center px-0 py-5" : "",
                )}
              >
                {compact ? (
                  <History className="size-5 text-stone-400" />
                ) : (
                  "还没有历史记录。创建第一条图片任务后，会在这里保留缩略图和提示词摘要。"
                )}
              </div>
            ) : (
              <div className="space-y-2">
                {visibleConversations.map((conversation) => {
                  const conversationElapsedSeconds =
                    activeConversationElapsedSecondsById[conversation.id] ?? 0;
                  const promptPreview = String(conversation.prompt || "")
                    .replace(/\s+/g, " ")
                    .trim()
                    .slice(0, 160);
                  const previewSrc =
                    previewThumbnailByConversationId[conversation.id] || "";
                  return (
                    <HistoryConversationCard
                      key={conversation.id}
                      id={conversation.id}
                      title={conversation.title}
                      prompt={promptPreview}
                      modeLabel={modeLabelMap[conversation.mode]}
                      previewSrc={previewSrc}
                      createdAtLabel={formatConversationTime(conversation.createdAt)}
                      active={conversation.id === selectedConversationId}
                      compact={compact}
                      elapsedSeconds={conversationElapsedSeconds}
                      elapsedLabel={formatTimerClock(conversationElapsedSeconds)}
                      disabled={activeConversationIds.has(conversation.id)}
                      onFocusConversation={onFocusConversation}
                      onDeleteConversation={onDeleteConversation}
                    />
                  );
                })}
                {hasMoreConversations ? (
                  <div className="px-3 py-2 text-center text-[11px] text-stone-400">
                    滚动继续加载更多会话
                  </div>
                ) : null}
              </div>
            )}
          </div>
        </div>
      </aside>
    );
  },
  (prev, next) => {
    return (
      prev.conversations === next.conversations &&
      prev.selectedConversationId === next.selectedConversationId &&
      prev.isLoadingHistory === next.isLoadingHistory &&
      prev.hasActiveTasks === next.hasActiveTasks &&
      hasSameConversationIdSet(
        prev.activeConversationIds,
        next.activeConversationIds,
      ) &&
      hasSameElapsedMap(
        prev.activeConversationElapsedSecondsById,
        next.activeConversationElapsedSecondsById,
      ) &&
      prev.modeLabelMap === next.modeLabelMap &&
      prev.buildConversationPreviewSource === next.buildConversationPreviewSource &&
      prev.formatConversationTime === next.formatConversationTime &&
      prev.formatTimerClock === next.formatTimerClock &&
      prev.onCreateDraft === next.onCreateDraft &&
      prev.onClearHistory === next.onClearHistory &&
      prev.onFocusConversation === next.onFocusConversation &&
      prev.onDeleteConversation === next.onDeleteConversation &&
      prev.standalone === next.standalone &&
      prev.compact === next.compact
    );
  },
);

HistorySidebar.displayName = "HistorySidebar";
