"use client";

import { memo } from "react";
import { History, LoaderCircle, MessageSquarePlus, Trash2 } from "lucide-react";

import { AppImage as Image } from "@/components/app-image";
import { Button } from "@/components/ui/button";
import type { ImageConversation, ImageMode } from "@/store/image-conversations";
import { cn } from "@/lib/utils";

type HistorySidebarProps = {
  conversations: ImageConversation[];
  selectedConversationId: string | null;
  isLoadingHistory: boolean;
  hasActiveTasks: boolean;
  activeConversationIds: Set<string>;
  modeLabelMap: Record<ImageMode, string>;
  buildConversationPreviewSource: (conversation: ImageConversation) => string;
  formatConversationTime: (value: string) => string;
  onCreateDraft: () => void;
  onClearHistory: () => Promise<void>;
  onFocusConversation: (id: string) => void;
  onDeleteConversation: (id: string) => Promise<void>;
  standalone?: boolean;
  compact?: boolean;
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

export const HistorySidebar = memo(
  function HistorySidebar({
    conversations,
    selectedConversationId,
    isLoadingHistory,
    hasActiveTasks,
    activeConversationIds,
    modeLabelMap,
    buildConversationPreviewSource,
    formatConversationTime,
    onCreateDraft,
    onClearHistory,
    onFocusConversation,
    onDeleteConversation,
    standalone = false,
    compact = false,
  }: HistorySidebarProps) {
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
                {conversations.map((conversation) => {
                  const active = conversation.id === selectedConversationId;
                  const previewSrc =
                    buildConversationPreviewSource(conversation);
                  return (
                    <div
                      key={conversation.id}
                        className={cn(
                          "group relative rounded-[22px] border transition",
                          compact
                            ? "mx-auto grid size-16 place-items-center p-0"
                            : "p-2",
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
                          onClick={() => onFocusConversation(conversation.id)}
                          className={cn(
                            "items-center",
                            compact
                              ? "grid h-full w-full place-items-center"
                              : "flex min-w-0 flex-1 gap-3 text-left",
                          )}
                          title={compact ? conversation.title : undefined}
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
                                alt={conversation.title}
                                width={compact ? 48 : 56}
                                height={compact ? 48 : 56}
                                unoptimized
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
                                  {modeLabelMap[conversation.mode]}
                                </span>
                                <span className="truncate text-xs text-stone-400">
                                  {formatConversationTime(conversation.createdAt)}
                                </span>
                              </div>
                              <div className="mt-2 truncate text-sm font-medium text-stone-800">
                                {conversation.title}
                              </div>
                              <div className="mt-1 line-clamp-2 text-xs leading-5 text-stone-500">
                                {conversation.prompt || "无额外提示词"}
                              </div>
                            </div>
                          ) : null}
                        </button>
                        {!compact ? (
                          <button
                            type="button"
                            onClick={() =>
                              void onDeleteConversation(conversation.id)
                            }
                            disabled={activeConversationIds.has(conversation.id)}
                            title={
                              activeConversationIds.has(conversation.id)
                                ? "当前会话仍在处理中，暂时不能删除"
                                : "删除会话"
                            }
                            className="inline-flex size-8 shrink-0 items-center justify-center rounded-xl text-stone-400 opacity-100 transition hover:bg-stone-100 hover:text-rose-500 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-stone-400 lg:opacity-0 lg:group-hover:opacity-100 lg:disabled:opacity-40"
                            aria-label="删除会话"
                          >
                            <Trash2 className="size-4" />
                          </button>
                        ) : null}
                      </div>
                    </div>
                  );
                })}
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
      prev.modeLabelMap === next.modeLabelMap &&
      prev.buildConversationPreviewSource ===
        next.buildConversationPreviewSource &&
      prev.formatConversationTime === next.formatConversationTime &&
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
