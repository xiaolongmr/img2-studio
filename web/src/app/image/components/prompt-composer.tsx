"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ClipboardEvent as ReactClipboardEvent,
  type DragEvent as ReactDragEvent,
  type CSSProperties,
  type ReactNode,
  type RefObject,
} from "react";
import Zoom from "react-medium-image-zoom";
import { ArrowUp, Brush, ChevronDown, CircleHelp, ImagePlus, Tags, Trash2 } from "lucide-react";

import { AppImage as Image } from "@/components/app-image";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { ImageOutputFormat, ImageQuality } from "@/lib/api";
import type { ImageMode, StoredSourceImage } from "@/store/image-conversations";
import { cn } from "@/lib/utils";
import {
  buildSourceImageReferenceLabel,
  normalizeSourceImageMention,
  stripSelectedMentionMarkers,
} from "../submit-utils";
import { buildSourceImageUrl } from "../view-utils";

type PromptComposerProps = {
  mode: ImageMode;
  modeOptions: Array<{ label: string; value: ImageMode; description: string }>;
  imageCount: string;
  imageAspectRatio: string;
  imageAspectRatioOptions: Array<{ label: string; value: string }>;
  customAspectRatioValue?: string;
  imageResolutionTier: string;
  imageResolutionTierLabel: string;
  imageResolutionTierOptions: Array<{ label: string; value: string; disabled?: boolean }>;
  imageSizeHint: ReactNode;
  imageQuality: ImageQuality;
  imageQualityOptions: Array<{ label: string; value: ImageQuality; description: string }>;
  imageQualityDisabled: boolean;
  imageQualityDisabledReason: string;
  imageOutputFormat: ImageOutputFormat;
  imageOutputFormatOptions: Array<{ label: string; value: ImageOutputFormat; description: string }>;
  sourceImages: StoredSourceImage[];
  imagePrompt: string;
  textareaRef: RefObject<HTMLTextAreaElement | null>;
  uploadInputRef: RefObject<HTMLInputElement | null>;
  maskInputRef: RefObject<HTMLInputElement | null>;
  onModeChange: (mode: ImageMode) => void;
  onImageCountChange: (value: string) => void;
  onImageAspectRatioChange: (value: string) => void;
  onCustomAspectRatioValueChange?: (value: string) => void;
  onImageResolutionTierChange: (value: string) => void;
  onImageQualityChange: (value: string) => void;
  onImageOutputFormatChange: (value: string) => void;
  onPromptChange: (value: string) => void;
  onPromptPaste: (event: ReactClipboardEvent<HTMLTextAreaElement>) => void;
  onRemoveSourceImage: (id: string) => void;
  onUpdateSourceImageReference: (id: string, value: string) => void;
  onOpenSourceSelectionEditor: (sourceImageId: string) => void;
  onAppendFiles: (files: FileList | null, role: "image" | "mask") => Promise<void>;
  onMobileCollapsedChange?: (collapsed: boolean) => void;
  desktopPromptHeight?: number;
  onSubmit: () => Promise<void>;
};

export function PromptComposer({
  mode,
  modeOptions,
  imageCount,
  imageAspectRatio,
  imageAspectRatioOptions,
  customAspectRatioValue = "",
  imageResolutionTier,
  imageResolutionTierLabel,
  imageResolutionTierOptions,
  imageSizeHint,
  imageQuality,
  imageQualityOptions,
  imageQualityDisabled,
  imageQualityDisabledReason,
  imageOutputFormat,
  imageOutputFormatOptions,
  sourceImages,
  imagePrompt,
  textareaRef,
  uploadInputRef,
  maskInputRef,
  onModeChange,
  onImageCountChange,
  onImageAspectRatioChange,
  onCustomAspectRatioValueChange,
  onImageResolutionTierChange,
  onImageQualityChange,
  onImageOutputFormatChange,
  onPromptChange,
  onPromptPaste,
  onRemoveSourceImage,
  onUpdateSourceImageReference,
  onOpenSourceSelectionEditor,
  onAppendFiles,
  onMobileCollapsedChange,
  desktopPromptHeight,
  onSubmit,
}: PromptComposerProps) {
  const imageQualityLabel = imageQualityOptions.find((item) => item.value === imageQuality)?.label ?? imageQuality;
  const imageOutputFormatLabel =
    imageOutputFormatOptions.find((item) => item.value === imageOutputFormat)
      ?.label ?? imageOutputFormat.toUpperCase();
  const showImageOutputControls = mode === "edit" || mode === "generate";
  const sizeHintAriaLabel = mode === "edit" ? "查看编辑输出说明" : "查看分辨率说明";
  const imageQualityPrefix = mode === "edit" ? "输出质量" : "质量";
  const hasComposerContent = imagePrompt.trim().length > 0 || sourceImages.length > 0;
  const previousHasComposerContentRef = useRef(hasComposerContent);
  const promptValueRef = useRef(imagePrompt);
  const promptSelectionRef = useRef({
    start: imagePrompt.length,
    end: imagePrompt.length,
  });
  const [isMobileComposerExpanded, setIsMobileComposerExpanded] = useState(hasComposerContent);
  const [mentionPickerOpen, setMentionPickerOpen] = useState(false);
  const [mentionPickerIndex, setMentionPickerIndex] = useState(0);
  const [isDraggingReferenceImage, setIsDraggingReferenceImage] = useState(false);
  const dragLayerDepthRef = useRef(0);
  const mentionHighlightRef = useRef<HTMLDivElement | null>(null);
  const isMobileComposerCollapsed = !isMobileComposerExpanded;
  const showMobileExpandedSections = !isMobileComposerCollapsed;
  const imageReferenceSources = sourceImages.filter((item) => item.role === "image");
  const [isImeComposing, setIsImeComposing] = useState(false);
  const mentionTokens = useMemo(() => {
    const tokens = imageReferenceSources
      .map((source, sourceIndex) => {
        const indexInAll = sourceImages.findIndex((item) => item.id === source.id);
        const fallbackLabel = buildSourceImageReferenceLabel(
          source,
          indexInAll >= 0 ? indexInAll : sourceIndex,
        );
        const normalizedAlias = normalizeSourceImageMention(source.referenceAlias);
        return normalizedAlias || fallbackLabel;
      })
      .filter((item) => item.length > 1);
    return Array.from(new Set(tokens)).sort((a, b) => b.length - a.length);
  }, [imageReferenceSources, sourceImages]);

  function findMentionTriggerIndex(text: string) {
    return Math.max(text.lastIndexOf("@"), text.lastIndexOf("＠"));
  }

  function isCjkCharacter(char: string) {
    return /[\u3400-\u9fff]/.test(char);
  }

  function shouldInsertLeadingSpace(prefix: string) {
    if (prefix.length === 0) {
      return false;
    }
    const previousChar = prefix.charAt(prefix.length - 1);
    if (/\s/.test(previousChar)) {
      return false;
    }
    if (/[，。！？；：、,.!?;:()（）\[\]【】<>《》「」『』"'`]/.test(previousChar)) {
      return false;
    }
    return true;
  }

  function shouldInsertTrailingSpace(suffix: string) {
    if (suffix.length === 0) {
      return false;
    }
    const nextChar = suffix.charAt(0);
    if (/\s/.test(nextChar)) {
      return false;
    }
    
    if (/[，。！？；：、,.!?;:()（）\[\]【】<>《》「」『』"'`]/.test(nextChar)) {
      return false;
    }
    return true;
  }

  function hasMentionTokenInPrompt(value: string) {
    if (mentionTokens.length === 0) {
      return false;
    }
    const content = stripSelectedMentionMarkers(value);
    return mentionTokens.some((token) => content.includes(token));
  }

  function stripMentionMarkersWithSelection(
    value: string,
    selectionStart: number,
    selectionEnd: number,
  ) {
    const safeValue = String(value || "");
    const rawStart = Math.max(0, Math.min(selectionStart, safeValue.length));
    const rawEnd = Math.max(rawStart, Math.min(selectionEnd, safeValue.length));
    let sanitized = "";
    let mappedStart = 0;
    let mappedEnd = 0;
    for (let index = 0; index < safeValue.length; index += 1) {
      const char = safeValue.charAt(index);
      const isMarker = char === "\u2063" || char === "\u2064";
      if (!isMarker) {
        sanitized += char;
      }
      if (index < rawStart && !isMarker) {
        mappedStart += 1;
      }
      if (index < rawEnd && !isMarker) {
        mappedEnd += 1;
      }
    }
    return {
      value: sanitized,
      start: mappedStart,
      end: mappedEnd,
    };
  }

  function renderPromptWithMentionHighlight(value: string) {
    const content = stripSelectedMentionMarkers(value);
    if (mentionTokens.length === 0) {
      return content;
    }
    const escapedMentionTokens = mentionTokens
      .map((item) => item.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
    const mentionPattern = new RegExp(`(${escapedMentionTokens.join("|")})`, "g");
    const parts: ReactNode[] = [];
    let lastIndex = 0;
    let key = 0;

    for (const match of content.matchAll(mentionPattern)) {
      const mention = String(match[1] ?? "");
      const mentionIndex = match.index ?? -1;
      if (mentionIndex < 0) {
        continue;
      }
      const mentionHead = content.slice(Math.max(0, mentionIndex - 1), mentionIndex);
      if (mentionHead && /[@＠\w-]/.test(mentionHead)) {
        continue;
      }
      const mentionTail = content.slice(
        mentionIndex + mention.length,
        mentionIndex + mention.length + 1,
      );
      if (mentionTail && /[\w-]/.test(mentionTail)) {
        continue;
      }
      if (mentionIndex > lastIndex) {
        parts.push(
          <span key={`text-${key++}`}>
            {content.slice(lastIndex, mentionIndex)}
          </span>,
        );
      }
      parts.push(
        <span
          key={`mention-${key++}`}
          className="relative isolate text-sky-700 before:pointer-events-none before:absolute before:-inset-x-[3px] before:-inset-y-[1px] before:rounded-[6px] before:bg-sky-500/16 before:[box-shadow:inset_0_0_0_1px_rgba(14,165,233,0.36)] dark:text-sky-200 dark:before:bg-sky-500/20 dark:before:[box-shadow:inset_0_0_0_1px_rgba(56,189,248,0.5)]"
        >
          {mention}
        </span>,
      );
      lastIndex = mentionIndex + mention.length;
    }

    if (lastIndex < content.length) {
      parts.push(
        <span key={`text-${key++}`}>
          {content.slice(lastIndex)}
        </span>,
      );
    }

    if (parts.length === 0) {
      return content;
    }

    return parts;
  }

  function syncMentionHighlightScroll() {
    const textarea = textareaRef.current;
    const highlight = mentionHighlightRef.current;
    if (!textarea || !highlight) {
      return;
    }
    highlight.scrollTop = textarea.scrollTop;
    highlight.scrollLeft = textarea.scrollLeft;
  }

  useEffect(() => {
    if (hasComposerContent && !previousHasComposerContentRef.current) {
      setIsMobileComposerExpanded(true);
    } else if (!hasComposerContent && previousHasComposerContentRef.current) {
      const isSmallScreen =
        typeof window !== "undefined" &&
        window.matchMedia("(max-width: 639px)").matches;
      const keepFocusOnTextarea =
        typeof document !== "undefined" &&
        Boolean(textareaRef.current) &&
        document.activeElement === textareaRef.current;
      if (isSmallScreen && !keepFocusOnTextarea) {
        setIsMobileComposerExpanded(false);
      }
    }

    previousHasComposerContentRef.current = hasComposerContent;
  }, [hasComposerContent, textareaRef]);

  useEffect(() => {
    onMobileCollapsedChange?.(isMobileComposerCollapsed);
  }, [isMobileComposerCollapsed, onMobileCollapsedChange]);

  useEffect(() => {
    const textarea = textareaRef.current;
    const fallbackStart = promptSelectionRef.current.start ?? imagePrompt.length;
    const fallbackEnd = promptSelectionRef.current.end ?? fallbackStart;
    const rawStart = textarea?.selectionStart ?? fallbackStart;
    const rawEnd = textarea?.selectionEnd ?? fallbackEnd;
    const normalizedPrompt = stripMentionMarkersWithSelection(
      imagePrompt,
      rawStart,
      rawEnd,
    );
    promptValueRef.current = normalizedPrompt.value;
    promptSelectionRef.current = {
      start: normalizedPrompt.start,
      end: normalizedPrompt.end,
    };
    if (normalizedPrompt.value !== imagePrompt) {
      onPromptChange(normalizedPrompt.value);
    }
    if (
      textarea &&
      typeof document !== "undefined" &&
      document.activeElement === textarea &&
      (normalizedPrompt.start !== rawStart || normalizedPrompt.end !== rawEnd)
    ) {
      window.requestAnimationFrame(() => {
        textarea.setSelectionRange(normalizedPrompt.start, normalizedPrompt.end);
        syncPromptSelection();
      });
    }
  }, [imagePrompt]);

  const sizeHintTooltip =
    showImageOutputControls ? (
      <span className="group relative hidden shrink-0 items-center align-middle sm:inline-flex">
        <span
          tabIndex={0}
          className="inline-flex size-9 cursor-help items-center justify-center rounded-full border border-stone-200 bg-white text-stone-400 transition-colors hover:text-stone-700 focus-visible:text-stone-700 focus-visible:outline-none"
          aria-label={sizeHintAriaLabel}
        >
          <CircleHelp className="size-4" />
        </span>
        <span className="pointer-events-none absolute right-0 bottom-full z-30 mb-2 w-80 max-w-[calc(100vw-2rem)] rounded-2xl border border-stone-200 bg-white px-4 py-3 text-xs font-normal leading-6 text-stone-600 opacity-0 shadow-[0_18px_50px_-24px_rgba(15,23,42,0.35)] transition-all duration-200 group-hover:pointer-events-auto group-hover:translate-y-0 group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:translate-y-0 group-focus-within:opacity-100">
          {imageSizeHint}
        </span>
      </span>
    ) : null;

  function insertImageMention(
    source: StoredSourceImage,
    index: number,
    options?: {
      replaceMentionTrigger?: boolean;
    },
  ) {
    const replaceMentionTrigger = Boolean(options?.replaceMentionTrigger);
    const textarea = textareaRef.current;
    const fallbackSelection = promptSelectionRef.current;
    const mention = normalizeSourceImageMention(source.referenceAlias) ||
      buildSourceImageReferenceLabel(source, index);
    const currentValue = textarea?.value ?? promptValueRef.current;
    const selectionStart =
      textarea?.selectionStart ?? fallbackSelection.start ?? currentValue.length;
    const selectionEnd =
      textarea?.selectionEnd ?? fallbackSelection.end ?? selectionStart;
    const beforeSelection = currentValue.slice(0, selectionStart);
    const afterSelection = currentValue.slice(selectionEnd);
    const mentionTriggerIndex = findMentionTriggerIndex(beforeSelection);
    const replaceStart = replaceMentionTrigger
      ? mentionTriggerIndex >= 0
        ? mentionTriggerIndex
        : selectionStart
      : selectionStart;
    const prefix = currentValue.slice(0, replaceStart);
    const needsLeadingSpace = replaceMentionTrigger
      ? prefix.length > 0 && !/\s$/.test(prefix)
      : shouldInsertLeadingSpace(prefix);
    const needsTrailingSpace = replaceMentionTrigger
      ? afterSelection.length === 0 || !/^\s/.test(afterSelection)
      : afterSelection.length === 0 || shouldInsertTrailingSpace(afterSelection);
    const insertedMention = `${needsLeadingSpace ? " " : ""}${mention}${needsTrailingSpace ? " " : ""}`;
    const nextValue = `${prefix}${insertedMention}${afterSelection}`;
    const nextCursor = `${prefix}${insertedMention}`.length;

    promptValueRef.current = nextValue;
    promptSelectionRef.current = {
      start: nextCursor,
      end: nextCursor,
    };
    if (textarea) {
      textarea.value = nextValue;
    }
    onPromptChange(nextValue);
    setMentionPickerOpen(false);
    window.requestAnimationFrame(() => {
      textarea?.focus();
      textarea?.setSelectionRange(nextCursor, nextCursor);
      syncPromptSelection();
    });
  }

  function handlePromptKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (mentionPickerOpen && imageReferenceSources.length > 0) {
      if (event.key === "ArrowDown") {
        event.preventDefault();
        setMentionPickerIndex((current) => (current + 1) % imageReferenceSources.length);
        return;
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        setMentionPickerIndex((current) =>
          (current - 1 + imageReferenceSources.length) % imageReferenceSources.length,
        );
        return;
      }
      if (event.key === "Enter") {
        event.preventDefault();
        insertImageMention(
          imageReferenceSources[mentionPickerIndex],
          sourceImages.findIndex((item) => item.id === imageReferenceSources[mentionPickerIndex].id),
          { replaceMentionTrigger: true },
        );
        return;
      }
      if (event.key === "Escape") {
        event.preventDefault();
        setMentionPickerOpen(false);
        return;
      }
    }

    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void onSubmit();
    }
  }

  function shouldOpenMentionPicker(value: string, cursor: number) {
    if (isImeComposing) {
      return false;
    }
    if (imageReferenceSources.length === 0) {
      return false;
    }
    const beforeCursor = stripSelectedMentionMarkers(value.slice(0, cursor));
    const mentionTriggerIndex = findMentionTriggerIndex(beforeCursor);
    if (mentionTriggerIndex < 0) {
      return false;
    }
    const mentionKeyword = stripSelectedMentionMarkers(
      beforeCursor.slice(mentionTriggerIndex + 1),
    );
    if (!/^[\u3400-\u9fff\w-]*$/.test(mentionKeyword)) {
      return false;
    }
    const previousChar =
      mentionTriggerIndex > 0
        ? beforeCursor.charAt(mentionTriggerIndex - 1)
        : "";
    if (!previousChar || /\s/.test(previousChar)) {
      return true;
    }
    if (isCjkCharacter(previousChar)) {
      return true;
    }

    // Avoid opening mention picker for email-like inputs: name@example.com
    if (/[A-Za-z0-9._%+-]/.test(previousChar)) {
      const beforeAt = beforeCursor.slice(0, mentionTriggerIndex);
      const localPartMatch = beforeAt.match(/[A-Za-z0-9._%+-]+$/);
      const domainFragment = beforeCursor.slice(mentionTriggerIndex + 1);
      const looksLikeDomainFragment = /^[A-Za-z0-9.-]*$/.test(domainFragment);
      if (localPartMatch && looksLikeDomainFragment) {
        return false;
      }
    }
    return true;
  }

  function handlePromptValueChange(value: string) {
    const textarea = textareaRef.current;
    const rawStart = textarea?.selectionStart ?? value.length;
    const rawEnd = textarea?.selectionEnd ?? rawStart;
    const sanitized = stripMentionMarkersWithSelection(value, rawStart, rawEnd);
    promptValueRef.current = sanitized.value;
    onPromptChange(sanitized.value);
    promptSelectionRef.current = {
      start: sanitized.start,
      end: sanitized.end,
    };
    if (
      textarea &&
      (sanitized.start !== rawStart || sanitized.end !== rawEnd)
    ) {
      window.requestAnimationFrame(() => {
        textarea.setSelectionRange(sanitized.start, sanitized.end);
        syncPromptSelection();
      });
    }
    setMentionPickerOpen(shouldOpenMentionPicker(sanitized.value, sanitized.start));
    setMentionPickerIndex(0);
  }

  function syncPromptSelection() {
    const textarea = textareaRef.current;
    if (!textarea) {
      return;
    }
    const start = textarea.selectionStart ?? textarea.value.length;
    const end = textarea.selectionEnd ?? start;
    promptSelectionRef.current = { start, end };
  }

  const desktopPromptStyle = useMemo<CSSProperties | undefined>(() => {
    if (!desktopPromptHeight || desktopPromptHeight <= 0) {
      return undefined;
    }
    return {
      minHeight: `${desktopPromptHeight}px`,
      maxHeight: `${desktopPromptHeight}px`,
      height: `${desktopPromptHeight}px`,
    };
  }, [desktopPromptHeight]);

  function hasImageFiles(files: FileList | null) {
    if (!files || files.length === 0) {
      return false;
    }
    return Array.from(files).some((file) =>
      String(file.type || "")
        .toLowerCase()
        .startsWith("image/"),
    );
  }

  function hasDragFilePayload(dataTransfer: DataTransfer | null | undefined) {
    if (!dataTransfer) {
      return false;
    }
    const types = Array.from(dataTransfer.types || []);
    if (types.includes("Files")) {
      return true;
    }
    return hasImageFiles(dataTransfer.files || null);
  }

  function handleComposerDragEnter(event: ReactDragEvent<HTMLDivElement>) {
    if (!hasDragFilePayload(event.dataTransfer)) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    dragLayerDepthRef.current += 1;
    setIsDraggingReferenceImage(true);
    setIsMobileComposerExpanded(true);
  }

  function handleComposerDragOver(event: ReactDragEvent<HTMLDivElement>) {
    if (!hasDragFilePayload(event.dataTransfer)) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = "copy";
  }

  function handleComposerDragLeave(event: ReactDragEvent<HTMLDivElement>) {
    if (dragLayerDepthRef.current <= 0) {
      setIsDraggingReferenceImage(false);
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    dragLayerDepthRef.current = Math.max(0, dragLayerDepthRef.current - 1);
    if (dragLayerDepthRef.current === 0) {
      setIsDraggingReferenceImage(false);
    }
  }

  function handleComposerDrop(event: ReactDragEvent<HTMLDivElement>) {
    const files = event.dataTransfer?.files ?? null;
    if (!hasImageFiles(files)) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    dragLayerDepthRef.current = 0;
    setIsDraggingReferenceImage(false);
    void onAppendFiles(files, "image");
  }

  return (
    <div
        className={cn(
        "fixed inset-x-0 bottom-0 z-30 px-3 backdrop-blur supports-[padding:max(0px)]:pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-4 lg:static lg:inset-auto lg:bottom-auto lg:z-20 lg:rounded-none lg:border-x-0 lg:border-b-0 lg:border-t lg:bg-white lg:px-5 lg:shadow-none dark:lg:border-[var(--studio-border)] dark:lg:bg-[var(--studio-panel-soft)]",
        isMobileComposerCollapsed
          ? "border-transparent bg-white/96 shadow-none dark:bg-[color:var(--studio-bg)]"
          : "rounded-[26px] border border-stone-200 bg-white/96 shadow-[0_18px_50px_-24px_rgba(15,23,42,0.35)] dark:border-[var(--studio-border)] dark:bg-[color:var(--studio-bg)] dark:shadow-[0_24px_70px_-30px_rgba(0,0,0,0.82)]",
        isMobileComposerCollapsed ? "py-1 sm:py-1.5" : "py-1 sm:py-1.5",
        "lg:border-stone-200 lg:bg-white lg:py-2 lg:shadow-none",
      )}
    >
      <div className="mx-auto flex w-full max-w-[1120px] flex-col gap-2.5 px-4 sm:px-6">
        <div
          className={cn(
            "flex-col gap-2.5 xl:flex-row xl:items-center xl:justify-between",
            showMobileExpandedSections ? "flex" : "hidden lg:flex",
          )}
        >
          <div className="flex items-center gap-2">
            <div className="hide-scrollbar min-w-0 flex-1 -mx-1 overflow-x-auto px-1 xl:mx-0 xl:px-0">
              <div className="inline-flex min-w-max rounded-full bg-stone-100 p-1">
                {modeOptions.map((item) => (
                  <button
                    key={item.value}
                    type="button"
                    onClick={() => onModeChange(item.value)}
                    className={cn(
                      "rounded-full px-3 py-1.5 text-[13px] font-medium transition sm:px-4 sm:py-2 sm:text-sm",
                      mode === item.value
                        ? "bg-stone-950 text-white shadow-sm dark:bg-[var(--studio-accent-strong)] dark:text-[var(--studio-accent-foreground)]"
                        : "text-stone-600 hover:bg-stone-200 hover:text-stone-900 dark:text-[var(--studio-text)] dark:hover:bg-[var(--studio-panel-muted)] dark:hover:text-[var(--studio-text-strong)]",
                    )}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>
            {isMobileComposerExpanded ? (
              <button
                type="button"
                className="inline-flex size-8 shrink-0 items-center justify-center rounded-full text-stone-400 transition hover:bg-stone-100 hover:text-stone-700 sm:hidden"
                onClick={(event) => {
                  event.stopPropagation();
                  setIsMobileComposerExpanded(false);
                  textareaRef.current?.blur();
                }}
                aria-label="收起输入框"
                title="收起输入框"
              >
                <ChevronDown className="size-4" />
              </button>
            ) : null}
          </div>

          <div className="hide-scrollbar -mx-1 flex items-center gap-1.5 overflow-x-auto px-1 pb-1 sm:mx-0 sm:flex-wrap sm:gap-2 sm:overflow-visible sm:px-0 sm:pb-0">
            {showImageOutputControls ? (
              <Select value={imageAspectRatio} onValueChange={onImageAspectRatioChange}>
                <SelectTrigger className="h-9 w-[84px] shrink-0 rounded-full border-stone-200 bg-white text-[13px] font-medium text-stone-700 shadow-none focus-visible:ring-0 sm:h-10 sm:w-[108px] sm:text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {imageAspectRatioOptions.map((item) => (
                    <SelectItem key={item.value} value={item.value}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : null}
            {showImageOutputControls && imageAspectRatio === "custom" ? (
              <Input
                value={customAspectRatioValue}
                onChange={(event) =>
                  onCustomAspectRatioValueChange?.(event.target.value)
                }
                placeholder="如 5:4"
                className="h-9 w-[96px] shrink-0 rounded-full border-stone-200 bg-white text-[13px] font-medium text-stone-700 shadow-none focus-visible:ring-0 sm:h-10 sm:w-[124px] sm:text-sm"
                title="自定义比例，支持 5:4 / 7:10 / 11x8"
              />
            ) : null}

            {showImageOutputControls ? (
              <Select value={imageResolutionTier} onValueChange={onImageResolutionTierChange}>
                <SelectTrigger
                  className="h-9 w-[168px] shrink-0 rounded-full border-stone-200 bg-white text-[13px] font-medium text-stone-700 shadow-none focus-visible:ring-0 sm:h-10 sm:w-[238px] sm:text-sm"
                  title={imageResolutionTierLabel}
                >
                  <SelectValue>{imageResolutionTierLabel}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {imageResolutionTierOptions.map((item) => (
                    <SelectItem key={item.value} value={item.value} disabled={item.disabled}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : null}

            {sizeHintTooltip}

            {showImageOutputControls ? (
              <Select value={imageQuality} onValueChange={onImageQualityChange} disabled={imageQualityDisabled}>
                <SelectTrigger
                  className={cn(
                    "h-10 w-[136px] shrink-0 rounded-full border-stone-200 bg-white text-sm font-medium text-stone-700 shadow-none focus-visible:ring-0",
                    "h-9 w-[108px] text-[13px] sm:h-10 sm:w-[136px] sm:text-sm",
                    imageQualityDisabled && "cursor-not-allowed bg-stone-50 text-stone-400 opacity-80",
                  )}
                  title={
                    imageQualityDisabled
                      ? imageQualityDisabledReason
                      : imageQualityOptions.find((item) => item.value === imageQuality)?.description
                  }
                >
                  <SelectValue>{`${imageQualityPrefix} ${imageQualityLabel}`}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {imageQualityOptions.map((item) => (
                    <SelectItem key={item.value} value={item.value}>
                      <span title={item.description}>{imageQualityPrefix} {item.label}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : null}

            {showImageOutputControls ? (
              <Select value={imageOutputFormat} onValueChange={onImageOutputFormatChange}>
                <SelectTrigger
                  className="h-9 w-[112px] shrink-0 rounded-full border-stone-200 bg-white text-[13px] font-medium text-stone-700 shadow-none focus-visible:ring-0 sm:h-10 sm:w-[132px] sm:text-sm"
                  title={
                    imageOutputFormatOptions.find(
                      (item) => item.value === imageOutputFormat,
                    )?.description
                  }
                >
                  <SelectValue>{`格式 ${imageOutputFormatLabel}`}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {imageOutputFormatOptions.map((item) => (
                    <SelectItem key={item.value} value={item.value}>
                      <span title={item.description}>
                        {item.label} 路 {item.description}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : null}

            {mode === "generate" ? (
              <div className="flex shrink-0 items-center gap-1 rounded-full border border-stone-200 bg-white px-2 py-0.5 sm:gap-1.5 sm:px-2.5 sm:py-1">
                <span className="text-[13px] font-medium text-stone-700 sm:text-sm">张数</span>
                <Input
                  type="number"
                  min="1"
                  max="8"
                  step="1"
                  value={imageCount}
                  onChange={(event) => onImageCountChange(event.target.value)}
                  className="h-7 w-[36px] border-0 bg-transparent px-0 text-center text-[13px] font-medium text-stone-700 shadow-none focus-visible:ring-0 sm:h-8 sm:w-[42px] sm:text-sm"
                />
              </div>
            ) : null}

          </div>
        </div>

          <div
          className={cn(
            mentionPickerOpen ? "overflow-visible" : "overflow-hidden",
            "rounded-[24px] border border-stone-200 bg-[#fafaf9] shadow-[inset_0_1px_0_rgba(255,255,255,0.9)] transition-colors duration-200 dark:border-[var(--studio-border)] dark:bg-[var(--studio-panel)] dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.03)] sm:rounded-[28px]",
            isDraggingReferenceImage
              ? "border-sky-400 bg-sky-50/70 dark:border-sky-500/80 dark:bg-sky-900/15"
              : "",
          )}
          onClick={() => {
            setIsMobileComposerExpanded(true);
            textareaRef.current?.focus();
          }}
          onDragEnter={handleComposerDragEnter}
          onDragOver={handleComposerDragOver}
          onDragLeave={handleComposerDragLeave}
          onDrop={handleComposerDrop}
        >
          {sourceImages.length > 0 ? (
            <div
              className={cn(
                "hide-scrollbar gap-2 overflow-x-auto border-b border-stone-200 px-3 py-2 sm:gap-3 sm:px-4 sm:py-3",
                showMobileExpandedSections ? "flex" : "hidden lg:flex",
              )}
            >
              {sourceImages.map((item) => (
                (() => {
                  const sourceIndex = sourceImages.filter((source) => source.role === "image").findIndex((source) => source.id === item.id);
                  const referenceLabel = item.role === "image"
                    ? buildSourceImageReferenceLabel(item, sourceIndex >= 0 ? sourceIndex : 0)
                    : "遮罩";
                  const referenceAlias = normalizeSourceImageMention(item.referenceAlias);
                  const displayLabel = referenceAlias || referenceLabel;
                  return (
                <div
                  key={item.id}
                  className="w-[118px] shrink-0 overflow-hidden rounded-[16px] border border-stone-200 bg-white sm:w-[142px] sm:rounded-[18px]"
                >
                  <div className="flex items-center justify-between border-b border-stone-100 px-3 py-2 text-[11px] font-medium text-stone-500">
                    <button
                      type="button"
                      className="min-w-0 truncate rounded-full bg-stone-100 px-2 py-0.5 text-[11px] font-semibold text-stone-700 transition hover:bg-stone-200"
                      onMouseDown={(event) => {
                        event.preventDefault();
                      }}
                      onClick={(event) => {
                        event.stopPropagation();
                        syncPromptSelection();
                        if (item.role === "image") {
                          insertImageMention(item, sourceIndex >= 0 ? sourceIndex : 0);
                        }
                      }}
                      title={item.role === "image" ? "插入图片引用" : "遮罩"}
                    >
                      {displayLabel}
                    </button>
                    <div className="flex items-center gap-1">
                      {mode === "edit" && item.role === "image" ? (
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            onOpenSourceSelectionEditor(item.id);
                          }}
                          className="rounded-md p-1 text-stone-400 transition hover:bg-stone-100 hover:text-stone-700"
                          title="选区编辑"
                          aria-label="选区编辑"
                        >
                          <Brush className="size-3.5" />
                        </button>
                      ) : null}
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          onRemoveSourceImage(item.id);
                        }}
                        className="rounded-md p-1 text-stone-400 transition hover:bg-stone-100 hover:text-rose-500"
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    </div>
                  </div>
                  {item.role === "image" ? (
                    <div className="border-b border-stone-100 px-2 py-1.5">
                      <Input
                        value={item.referenceAlias?.replace(/^@/, "") ?? ""}
                        placeholder={referenceLabel.replace(/^@/, "")}
                        onClick={(event) => event.stopPropagation()}
                        onChange={(event) =>
                          onUpdateSourceImageReference(item.id, event.target.value)
                        }
                        className="h-7 rounded-lg border-stone-200 bg-stone-50 px-2 text-[11px] shadow-none placeholder:text-stone-400"
                        aria-label={`${referenceLabel} 别名`}
                      />
                    </div>
                  ) : null}
                  <Zoom>
                    <Image
                      src={buildSourceImageUrl(item)}
                      alt={item.name}
                      width={160}
                      height={110}
                      unoptimized
                      className="block h-16 w-full cursor-zoom-in bg-stone-50 object-contain sm:h-20"
                    />
                  </Zoom>
                </div>
                  );
                })()
              ))}
            </div>
          ) : null}

          <div className="relative px-3 pb-1.5 pt-2 sm:px-4 sm:pb-2 sm:pt-2.5">
            {isMobileComposerCollapsed ? (
              <>
                <button
                  type="button"
                  className="flex min-h-[22px] w-full items-center px-1 py-0 text-left text-[14px] leading-5 text-stone-400 sm:hidden"
                  onClick={() => {
                    setIsMobileComposerExpanded(true);
                    textareaRef.current?.focus();
                  }}
                >
                  <span className="block w-full truncate">
                    {imagePrompt.trim() ||
                      (mode === "generate"
                        ? "描述你想生成的画面，也可以先上传参考图"
                        : "描述你想如何修改当前图片")}
                  </span>
                </button>
                <div className="relative hidden sm:block">
                  {imagePrompt.length > 0 &&
                  hasMentionTokenInPrompt(imagePrompt) ? (
                    <div
                      ref={mentionHighlightRef}
                      aria-hidden="true"
                      className="pointer-events-none absolute inset-0 z-0 overflow-hidden whitespace-pre-wrap break-words border-0 !px-1 !pb-1 !pt-1 text-[15px] leading-7 text-stone-900 dark:text-[var(--studio-text)]"
                      style={desktopPromptStyle}
                    >
                      {renderPromptWithMentionHighlight(imagePrompt)}
                    </div>
                  ) : null}
                  <Textarea
                    ref={textareaRef}
                    value={imagePrompt}
                    onChange={(event) => {
                      handlePromptValueChange(event.target.value);
                      window.requestAnimationFrame(syncMentionHighlightScroll);
                    }}
                    onSelect={syncPromptSelection}
                    onClick={syncPromptSelection}
                    onMouseUp={syncPromptSelection}
                    onKeyUp={syncPromptSelection}
                    onScroll={syncMentionHighlightScroll}
                    placeholder={
                      mode === "generate"
                        ? "描述你想生成的画面，也可以先上传参考图"
                        : mode === "edit"
                          ? "描述你想如何修改当前图片"
                          : "可选：描述你想增强的方向"
                    }
                    onPaste={onPromptPaste}
                    onKeyDown={handlePromptKeyDown}
                    spellCheck={false}
                    autoCorrect="off"
                    autoCapitalize="off"
                    autoComplete="off"
                    onCompositionStart={() => setIsImeComposing(true)}
                    onCompositionEnd={(event) => {
                      setIsImeComposing(false);
                      handlePromptValueChange(event.currentTarget.value);
                    }}
                    style={desktopPromptStyle}
                    className={cn(
                      "relative z-10 resize-none border-0 bg-transparent !px-1 !pb-1 shadow-none focus-visible:ring-0 sm:min-h-[38px] sm:max-h-[260px] sm:overflow-y-auto sm:!pt-1 sm:pr-10 sm:text-[15px] sm:leading-7",
                      imagePrompt.length > 0 && hasMentionTokenInPrompt(imagePrompt)
                        ? "text-transparent caret-stone-900"
                        : "text-stone-900 placeholder:text-stone-400",
                    )}
                    onFocus={() => setIsMobileComposerExpanded(true)}
                    onBlur={syncPromptSelection}
                  />
                </div>
              </>
            ) : (
              <div className="relative">
                {imagePrompt.length > 0 &&
                hasMentionTokenInPrompt(imagePrompt) ? (
                  <div
                    ref={mentionHighlightRef}
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-0 z-0 overflow-hidden whitespace-pre-wrap break-words border-0 !px-1 !pb-1 !pt-1 text-[14px] leading-6 text-stone-900 dark:text-[var(--studio-text)] sm:text-[15px] sm:leading-7"
                    style={desktopPromptStyle}
                  >
                    {renderPromptWithMentionHighlight(imagePrompt)}
                  </div>
                ) : null}
                <Textarea
                  ref={textareaRef}
                  value={imagePrompt}
                  onChange={(event) => {
                    handlePromptValueChange(event.target.value);
                    window.requestAnimationFrame(syncMentionHighlightScroll);
                  }}
                  onSelect={syncPromptSelection}
                  onClick={syncPromptSelection}
                  onMouseUp={syncPromptSelection}
                  onKeyUp={syncPromptSelection}
                  onScroll={syncMentionHighlightScroll}
                  placeholder={
                    mode === "generate"
                      ? "描述你想生成的画面，也可以先上传参考图"
                      : mode === "edit"
                        ? "描述你想如何修改当前图片"
                        : "可选：描述你想增强的方向"
                  }
                  onPaste={onPromptPaste}
                  onKeyDown={handlePromptKeyDown}
                  spellCheck={false}
                  autoCorrect="off"
                  autoCapitalize="off"
                  autoComplete="off"
                  onCompositionStart={() => setIsImeComposing(true)}
                  onCompositionEnd={(event) => {
                    setIsImeComposing(false);
                    handlePromptValueChange(event.currentTarget.value);
                  }}
                  style={desktopPromptStyle}
                  className={cn(
                    "relative z-10 resize-none border-0 bg-transparent !px-1 !pb-1 shadow-none focus-visible:ring-0 min-h-[30px] max-h-[70px] overflow-y-auto !pt-1 pr-10 leading-6 sm:min-h-[38px] sm:max-h-[260px] sm:text-[15px] sm:leading-7",
                    imagePrompt.length > 0 && hasMentionTokenInPrompt(imagePrompt)
                      ? "text-transparent caret-stone-900"
                      : "text-stone-900 placeholder:text-stone-400",
                  )}
                  onFocus={() => setIsMobileComposerExpanded(true)}
                  onBlur={syncPromptSelection}
                />
              </div>
            )}
            {mentionPickerOpen && imageReferenceSources.length > 0 ? (
              <div
                className="absolute left-4 bottom-full z-[160] mb-2 w-[min(360px,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-[0_18px_60px_-24px_rgba(15,23,42,0.45)] dark:border-[var(--studio-border)] dark:bg-[var(--studio-panel)]"
                onMouseDown={(event) => {
                  event.preventDefault();
                }}
              >
                <div className="flex items-center gap-2 border-b border-stone-100 px-3 py-2 text-xs font-semibold text-stone-500">
                  <Tags className="size-3.5" />
                  选择要引用的图片
                </div>
                <div className="max-h-64 overflow-y-auto p-1.5">
                  {imageReferenceSources.map((source, pickerIndex) => {
                    const sourceIndex = sourceImages.findIndex((item) => item.id === source.id);
                    const label = buildSourceImageReferenceLabel(source, sourceIndex >= 0 ? sourceIndex : pickerIndex);
                    const alias = normalizeSourceImageMention(source.referenceAlias);
                    return (
                      <button
                        key={source.id}
                        type="button"
                        className={cn(
                          "flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left transition",
                          pickerIndex === mentionPickerIndex
                            ? "bg-stone-100"
                            : "hover:bg-stone-50",
                        )}
                        onMouseEnter={() => setMentionPickerIndex(pickerIndex)}
                        onMouseDown={(event) => {
                          event.preventDefault();
                        }}
                        onClick={(event) => {
                          event.stopPropagation();
                          insertImageMention(
                            source,
                            sourceIndex >= 0 ? sourceIndex : pickerIndex,
                            { replaceMentionTrigger: true },
                          );
                        }}
                      >
                        <Image
                          src={buildSourceImageUrl(source)}
                          alt={source.name}
                          width={48}
                          height={48}
                          unoptimized
                          className="size-11 rounded-lg bg-stone-100 object-cover"
                        />
                        <span className="min-w-0">
                          <span className="block text-sm font-semibold text-stone-900">
                            {alias ? `${label} / ${alias}` : label}
                          </span>
                          <span className="block truncate text-xs text-stone-500">
                            {source.name || "参考图"}
                          </span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : null}
          </div>
          <div className={cn("px-3 pb-1.5 pt-2.5 sm:px-4 sm:pb-2.5 sm:pt-2.5", showMobileExpandedSections ? "block" : "hidden lg:block")}>
            <div className="flex items-end justify-between gap-3">
              <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 rounded-full border-stone-200 bg-white px-2 text-[11px] font-medium text-stone-700 shadow-none sm:h-8 sm:px-2.5 sm:text-xs"
                  onClick={(event) => {
                    event.stopPropagation();
                    uploadInputRef.current?.click();
                  }}
                >
                  <ImagePlus className="size-3.5" />
                  {mode === "generate" ? "上传参考图" : "上传源图"}
                </Button>

              </div>

              <button
                type="button"
                onClick={() => void onSubmit()}
                className="inline-flex size-8 shrink-0 items-center justify-center rounded-full bg-stone-950 text-white transition hover:bg-stone-800 disabled:cursor-not-allowed disabled:bg-stone-300 dark:bg-[var(--studio-accent-strong)] dark:text-[var(--studio-accent-foreground)] dark:hover:bg-[var(--studio-accent)] dark:disabled:bg-[var(--studio-panel-muted)] dark:disabled:text-[var(--studio-text-muted)] sm:size-9"
                aria-label="提交图片任务"
              >
                <ArrowUp className="size-4" />
              </button>
            </div>
          </div>

          <input
            ref={uploadInputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(event) => {
              void onAppendFiles(event.target.files, "image");
              event.currentTarget.value = "";
            }}
          />
        </div>
      </div>
    </div>
  );
}


