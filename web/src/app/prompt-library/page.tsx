"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowUp,
  BookText,
  CheckCircle2,
  Copy,
  LoaderCircle,
  Pencil,
  Plus,
  Search,
  Star,
  Upload,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { fetchAvailableModels } from "@/lib/api";
import { getStoredAuthKey } from "@/store/auth";
import {
  getStoredImageModel,
  getStoredImageModels,
  setStoredImageModels,
} from "@/store/image-model";
import builtinPromptsRaw from "./builtin-prompts.json";
import {
  getPromptFavoriteIds,
  listPromptLibraryItems,
  setPendingPromptForWorkspace,
  setPromptFavoriteIds,
  upsertPromptLibraryItem,
  type PromptLibraryItem,
} from "@/store/prompt-library";

type BuiltinPromptRecord = {
  title?: string;
  preview?: string;
  reference_image_urls?: string[];
  prompt?: string;
  author?: string;
  link?: string;
  mode?: string;
  category?: string;
  sub_category?: string;
  created?: string;
};

type PromptFormState = {
  title: string;
  prompt: string;
  mode: "generate" | "edit";
  model: string;
  category: string;
  subCategory: string;
  author: string;
  link: string;
  preview: string;
};

const INITIAL_FORM: PromptFormState = {
  title: "",
  prompt: "",
  mode: "generate",
  model: getStoredImageModel(),
  category: "通用",
  subCategory: "",
  author: "",
  link: "",
  preview: "",
};

function normalizeAuthor(author?: string) {
  return String(author || "")
    .trim()
    .replace(/^作者[:：]\s*/u, "");
}

function normalizeBuiltinPrompts(records: BuiltinPromptRecord[]) {
  const now = new Date().toISOString();
  return records
    .map((item, index): PromptLibraryItem | null => {
      const title = String(item.title || "").trim();
      const prompt = String(item.prompt || "").trim();
      if (!title || !prompt) {
        return null;
      }
      return {
        id: `builtin-${index + 1}`,
        title,
        preview: String(item.preview || "").trim() || undefined,
        referenceImageUrls: Array.isArray(item.reference_image_urls)
          ? item.reference_image_urls
              .map((url) => String(url || "").trim())
              .filter(Boolean)
          : undefined,
        prompt,
        model: "gpt-image-2",
        mode: String(item.mode || "generate").trim() === "edit" ? "edit" : "generate",
        category: String(item.category || "通用").trim() || "通用",
        subCategory: String(item.sub_category || "").trim() || undefined,
        tags: [],
        language: "",
        author: normalizeAuthor(item.author) || undefined,
        link: String(item.link || "").trim() || undefined,
        sourceUrl: undefined,
        createdAt: String(item.created || now),
        updatedAt: now,
      };
    })
    .filter((item): item is PromptLibraryItem => Boolean(item));
}

const BUILTIN_PROMPTS = normalizeBuiltinPrompts(
  builtinPromptsRaw as BuiltinPromptRecord[],
);
const VISIBLE_CHUNK_SIZE = 24;
const BLOCKED_PROMPT_CATEGORIES = new Set(["nsfw"]);

export default function PromptLibraryPage() {
  const navigate = useNavigate();
  const scrollContainerRef = useRef<HTMLElement | null>(null);
  const listEndRef = useRef<HTMLDivElement | null>(null);
  const [query, setQuery] = useState("");
  const [activeDetailItem, setActiveDetailItem] = useState<PromptLibraryItem | null>(
    null,
  );
  const [selectedMode, setSelectedMode] = useState<"all" | "generate" | "edit">("all");
  const [selectedSource, setSelectedSource] = useState<"all" | "builtin" | "custom">(
    "all",
  );
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [selectedSubCategory, setSelectedSubCategory] = useState("all");
  const [favoriteIds, setFavoriteIds] = useState<Set<string>>(
    () => new Set(getPromptFavoriteIds()),
  );
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [customItems, setCustomItems] = useState<PromptLibraryItem[]>([]);
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState<PromptFormState>(INITIAL_FORM);
  const [availableModels, setAvailableModels] = useState<string[]>(
    getStoredImageModels(),
  );
  const [isLoadingModels, setIsLoadingModels] = useState(false);
  const [isSavingCustom, setIsSavingCustom] = useState(false);
  const [visibleCount, setVisibleCount] = useState(VISIBLE_CHUNK_SIZE);
  const [editingCustomPromptId, setEditingCustomPromptId] = useState<
    string | null
  >(null);
  const [showBackToTop, setShowBackToTop] = useState(false);

  useEffect(() => {
    setCustomItems(listPromptLibraryItems());
  }, []);

  const allItems = useMemo(
    () =>
      [...customItems, ...BUILTIN_PROMPTS].filter((item) => {
        const normalizedCategory = String(item.category || "")
          .trim()
          .toLowerCase();
        return !BLOCKED_PROMPT_CATEGORIES.has(normalizedCategory);
      }),
    [customItems],
  );

  const modeFilteredItems = useMemo(() => {
    const sourceFilteredItems =
      selectedSource === "all"
        ? allItems
        : allItems.filter((item) =>
            selectedSource === "builtin"
              ? item.id.startsWith("builtin-")
              : !item.id.startsWith("builtin-"),
          );
    if (selectedMode === "all") {
      return sourceFilteredItems;
    }
    return sourceFilteredItems.filter((item) => item.mode === selectedMode);
  }, [allItems, selectedMode, selectedSource]);

  const categoryOptions = useMemo(() => {
    return [...new Set(modeFilteredItems.map((item) => item.category).filter(Boolean))].sort();
  }, [modeFilteredItems]);

  const categoryFilteredItems = useMemo(() => {
    if (selectedCategory === "all") {
      return modeFilteredItems;
    }
    return modeFilteredItems.filter((item) => item.category === selectedCategory);
  }, [modeFilteredItems, selectedCategory]);

  const subCategoryOptions = useMemo(() => {
    return [
      ...new Set(
        categoryFilteredItems
          .map((item) => item.subCategory)
          .filter((item): item is string => Boolean(item)),
      ),
    ].sort();
  }, [categoryFilteredItems]);

  useEffect(() => {
    if (selectedCategory !== "all" && !categoryOptions.includes(selectedCategory)) {
      setSelectedCategory("all");
    }
  }, [categoryOptions, selectedCategory]);

  useEffect(() => {
    if (selectedSubCategory !== "all" && !subCategoryOptions.includes(selectedSubCategory)) {
      setSelectedSubCategory("all");
    }
  }, [selectedSubCategory, subCategoryOptions]);

  const filteredItems = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    const scopedItems =
      selectedSubCategory === "all"
        ? categoryFilteredItems
        : categoryFilteredItems.filter(
            (item) => (item.subCategory || "") === selectedSubCategory,
          );
    const baseItems = favoritesOnly
      ? scopedItems.filter((item) => favoriteIds.has(item.id))
      : scopedItems;
    if (!keyword) {
      return baseItems;
    }
    return baseItems.filter((item) => {
      return (
        item.title.toLowerCase().includes(keyword) ||
        (item.category || "").toLowerCase().includes(keyword) ||
        (item.subCategory || "").toLowerCase().includes(keyword) ||
        item.prompt.toLowerCase().includes(keyword) ||
        (item.author || "").toLowerCase().includes(keyword)
      );
    });
  }, [categoryFilteredItems, favoriteIds, favoritesOnly, query, selectedSubCategory]);

  useEffect(() => {
    setVisibleCount(VISIBLE_CHUNK_SIZE);
  }, [query, selectedMode, selectedSource, selectedCategory, selectedSubCategory, favoritesOnly]);

  const visibleItems = useMemo(
    () => filteredItems.slice(0, visibleCount),
    [filteredItems, visibleCount],
  );
  const hasMoreItems = visibleCount < filteredItems.length;

  useEffect(() => {
    const sentinel = listEndRef.current;
    const root = scrollContainerRef.current;
    if (!sentinel || !root || !hasMoreItems) {
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) {
          return;
        }
        setVisibleCount((current) =>
          Math.min(current + VISIBLE_CHUNK_SIZE, filteredItems.length),
        );
      },
      {
        root,
        rootMargin: "320px 0px",
        threshold: 0.01,
      },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [filteredItems.length, hasMoreItems]);

  useEffect(() => {
    const root = scrollContainerRef.current;
    if (!root) {
      return;
    }
    const handleScroll = () => {
      setShowBackToTop(root.scrollTop > 320);
    };
    handleScroll();
    root.addEventListener("scroll", handleScroll, { passive: true });
    return () => root.removeEventListener("scroll", handleScroll);
  }, []);

  const handleBackToTop = () => {
    const root = scrollContainerRef.current;
    if (!root) {
      return;
    }
    root.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleUsePrompt = (item: PromptLibraryItem) => {
    setPendingPromptForWorkspace({
      title: item.title,
      prompt: item.prompt,
      mode: item.mode,
      model: item.model,
    });
    toast.success("已加入工作台输入框");
    navigate("/image/workspace");
  };

  const handleCopyPrompt = async (prompt: string) => {
    const text = String(prompt || "").trim();
    if (!text) {
      toast.error("提示词为空，无法复制");
      return;
    }
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        const textarea = document.createElement("textarea");
        textarea.value = text;
        textarea.style.position = "fixed";
        textarea.style.left = "-9999px";
        document.body.appendChild(textarea);
        textarea.focus();
        textarea.select();
        const copied = document.execCommand("copy");
        document.body.removeChild(textarea);
        if (!copied) {
          throw new Error("copy failed");
        }
      }
      toast.success("提示词已复制");
    } catch {
      toast.error("复制失败");
    }
  };

  const handleOpenCreateCustomPrompt = () => {
    setEditingCustomPromptId(null);
    setForm({
      ...INITIAL_FORM,
      model: getStoredImageModel(),
    });
    setFormOpen(true);
  };

  const handleOpenEditCustomPrompt = (item: PromptLibraryItem) => {
    setEditingCustomPromptId(item.id);
    setForm({
      title: item.title,
      prompt: item.prompt,
      mode: item.mode,
      model: item.model || getStoredImageModel(),
      category: item.category || "通用",
      subCategory: item.subCategory || "",
      author: item.author || "",
      link: item.link || "",
      preview: item.preview || "",
    });
    setFormOpen(true);
  };

  const handleToggleFavorite = (itemId: string) => {
    const next = new Set(favoriteIds);
    if (next.has(itemId)) {
      next.delete(itemId);
    } else {
      next.add(itemId);
    }
    setFavoriteIds(next);
    setPromptFavoriteIds(Array.from(next));
  };

  const handleFetchModels = async () => {
    setIsLoadingModels(true);
    try {
      const authKey = await getStoredAuthKey();
      const normalized = String(authKey || "").trim();
      if (!normalized) {
        toast.error("请先在登录页或设置页保存 API 密钥");
        return;
      }
      const models = await fetchAvailableModels(normalized);
      if (models.length === 0) {
        toast.error("未获取到可用模型");
        return;
      }
      setAvailableModels(models);
      setStoredImageModels(models);
      setForm((prev) => ({
        ...prev,
        model: models.includes(prev.model) ? prev.model : models[0],
      }));
      toast.success(`已刷新 ${models.length} 个模型`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "模型获取失败");
    } finally {
      setIsLoadingModels(false);
    }
  };

  const handlePreviewUpload = async (file: File) => {
    const encoded = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ""));
      reader.onerror = () => reject(new Error("预览图读取失败"));
      reader.readAsDataURL(file);
    });
    setForm((prev) => ({ ...prev, preview: encoded }));
  };

  const handleCreateCustomPrompt = async () => {
    const title = form.title.trim();
    const prompt = form.prompt.trim();
    const model = form.model.trim();
    if (!title) {
      toast.error("请输入标题");
      return;
    }
    if (!prompt) {
      toast.error("请输入提示词内容");
      return;
    }
    if (!model) {
      toast.error("请选择模型");
      return;
    }
    setIsSavingCustom(true);
    try {
      upsertPromptLibraryItem({
        id: editingCustomPromptId || undefined,
        title,
        prompt,
        mode: form.mode,
        model,
        category: form.category.trim() || "通用",
        subCategory: form.subCategory.trim() || undefined,
        tags: [],
        language: "",
        summary: undefined,
        preview: form.preview || undefined,
        referenceImageUrls: undefined,
        author: form.author.trim() || undefined,
        link: form.link.trim() || undefined,
        sourceUrl: undefined,
      });
      setCustomItems(listPromptLibraryItems());
      setForm({
        ...INITIAL_FORM,
        model: model || getStoredImageModel(),
      });
      setFormOpen(false);
      setEditingCustomPromptId(null);
      toast.success(editingCustomPromptId ? "自定义提示词已更新" : "自定义提示词已保存");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "保存失败");
    } finally {
      setIsSavingCustom(false);
    }
  };

  return (
    <section
      ref={scrollContainerRef}
      className="hide-scrollbar flex h-full min-h-0 w-full flex-col gap-4 overflow-y-auto p-2 sm:p-4"
    >
      <div className="rounded-[28px] border border-stone-200 bg-white p-5 shadow-[0_12px_30px_rgba(15,23,42,0.06)]">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-2xl font-semibold tracking-tight text-stone-900">
              提示词库
            </h1>
            <p className="mt-1 text-sm text-stone-500">
              支持内置 JSON 与本地自定义提示词，可直接应用到图片工作台。
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              className="rounded-full bg-stone-900 text-white hover:bg-stone-800"
              onClick={handleOpenCreateCustomPrompt}
            >
              <Plus className="size-4" />
              添加自定义
            </Button>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <div className="flex min-w-[220px] flex-1 items-center gap-2 rounded-2xl border border-stone-200 bg-stone-50 px-3 py-2">
            <Search className="size-4 text-stone-500" />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="搜索标题、分类、作者、正文"
              className="h-8 border-0 bg-transparent px-0 shadow-none focus-visible:ring-0"
            />
          </div>
        </div>
        <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-5">
          <div className="flex items-center gap-2 rounded-xl border border-stone-200 bg-stone-50 px-2 py-1.5">
            <span className="shrink-0 text-xs text-stone-500">{"\u6765\u6e90"}</span>
            <select
              value={selectedSource}
              onChange={(event) =>
                setSelectedSource(event.target.value as "all" | "builtin" | "custom")
              }
              className="h-8 w-full rounded-lg border border-stone-200 bg-white px-2 text-sm"
            >
              <option value="all">{"\u5168\u90e8"}</option>
              <option value="builtin">{"\u5185\u7f6e"}</option>
              <option value="custom">{"\u81ea\u5b9a\u4e49"}</option>
            </select>
          </div>
          <div className="flex items-center gap-2 rounded-xl border border-stone-200 bg-stone-50 px-2 py-1.5">
            <span className="shrink-0 text-xs text-stone-500">模式</span>
            <select
              value={selectedMode}
              onChange={(event) =>
                setSelectedMode(event.target.value as "all" | "generate" | "edit")
              }
              className="h-8 w-full rounded-lg border border-stone-200 bg-white px-2 text-sm"
            >
              <option value="all">全部</option>
              <option value="generate">生成</option>
              <option value="edit">编辑</option>
            </select>
          </div>
          <div className="flex items-center gap-2 rounded-xl border border-stone-200 bg-stone-50 px-2 py-1.5">
            <span className="shrink-0 text-xs text-stone-500">分类</span>
            <select
              value={selectedCategory}
              onChange={(event) => setSelectedCategory(event.target.value)}
              className="h-8 w-full rounded-lg border border-stone-200 bg-white px-2 text-sm"
            >
              <option value="all">全部</option>
              {categoryOptions.map((category) => (
                <option key={category} value={category}>
                  {category}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-2 rounded-xl border border-stone-200 bg-stone-50 px-2 py-1.5">
            <span className="shrink-0 text-xs text-stone-500">子分类</span>
            <select
              value={selectedSubCategory}
              onChange={(event) => setSelectedSubCategory(event.target.value)}
              className="h-8 w-full rounded-lg border border-stone-200 bg-white px-2 text-sm"
            >
              <option value="all">全部</option>
              {subCategoryOptions.map((subCategory) => (
                <option key={subCategory} value={subCategory}>
                  {subCategory}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-2 rounded-xl border border-stone-200 bg-stone-50 px-2 py-1.5">
            <span className="shrink-0 text-xs text-stone-500">{"\u6536\u85cf"}</span>
            <button
              type="button"
              onClick={() => setFavoritesOnly((current) => !current)}
              className="inline-flex h-8 w-full items-center justify-center gap-1 rounded-lg border border-stone-200 bg-white px-2 text-sm text-stone-600 transition hover:bg-stone-50"
            >
              <Star
                className={`size-3.5 ${favoritesOnly ? "fill-amber-400 text-amber-500" : "text-stone-400"}`}
              />
              {favoritesOnly
                ? "\u4ec5\u770b\u6536\u85cf"
                : "\u663e\u793a\u5168\u90e8"}
            </button>
          </div>

        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
        {filteredItems.length === 0 ? (
          <div className="col-span-full rounded-[24px] border border-dashed border-stone-300 bg-stone-50 p-8 text-center text-sm text-stone-500">
            未匹配到提示词，换个关键词试试。
          </div>
        ) : (
          visibleItems.map((item) => (
            <article
              key={item.id}
              className="group cursor-pointer rounded-[24px] border border-stone-200 bg-white p-4 shadow-[0_6px_18px_rgba(15,23,42,0.04)] transition hover:border-stone-300 hover:shadow-[0_10px_24px_rgba(15,23,42,0.08)]"
              onClick={() => setActiveDetailItem(item)}
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <h2 className="truncate text-base font-semibold text-stone-900">
                    {item.title}
                  </h2>
                  <p className="mt-1 text-sm text-stone-500">
                    {item.author ? (
                      item.link ? (
                        <a
                          href={item.link}
                          target="_blank"
                          rel="noreferrer"
                          className="text-sky-700 underline"
                          onClick={(event) => {
                            event.stopPropagation();
                          }}
                        >
                          {item.author}
                        </a>
                      ) : (
                        item.author
                      )
                    ) : null}
                    {item.author ? " · " : ""}
                    {item.category}
                    {item.subCategory ? ` / ${item.subCategory}` : ""}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {!item.id.startsWith("builtin-") ? (
                    <button
                      type="button"
                      className="inline-flex size-8 items-center justify-center rounded-full border border-stone-200 bg-white text-stone-500 transition hover:bg-stone-50"
                      title="编辑自定义提示词"
                      aria-label="编辑自定义提示词"
                      onClick={(event) => {
                        event.stopPropagation();
                        handleOpenEditCustomPrompt(item);
                      }}
                    >
                      <Pencil className="size-4" />
                    </button>
                  ) : null}
                  <button
                    type="button"
                    className="inline-flex size-8 items-center justify-center rounded-full border border-stone-200 bg-white text-stone-500 transition hover:bg-stone-50"
                    title={favoriteIds.has(item.id) ? "取消收藏" : "收藏"}
                    aria-label={favoriteIds.has(item.id) ? "取消收藏" : "收藏"}
                    onClick={(event) => {
                      event.stopPropagation();
                      handleToggleFavorite(item.id);
                    }}
                  >
                    <Star
                      className={`size-4 ${favoriteIds.has(item.id) ? "fill-amber-400 text-amber-500" : "text-stone-400"}`}
                    />
                  </button>
                  <Button
                    size="sm"
                    className="rounded-full border border-stone-200 bg-stone-100 text-stone-700 transition-colors duration-200 ease-out group-hover:border-stone-900 group-hover:bg-stone-900 group-hover:text-white hover:bg-stone-900 hover:text-white"
                    onClick={(event) => {
                      event.stopPropagation();
                      handleUsePrompt(item);
                    }}
                  >
                    <CheckCircle2 className="size-4" />
                    使用
                  </Button>
                </div>
              </div>

              <div className="mt-3 flex flex-wrap gap-2 text-xs">
                <span className="rounded-full bg-stone-100 px-2.5 py-1 text-stone-600">
                  {item.mode === "edit" ? "编辑" : "生成"}
                </span>
                {item.id.startsWith("builtin-") ? null : (
                  <span className="rounded-full bg-stone-100 px-2.5 py-1 text-stone-600">
                    自定义
                  </span>
                )}
              </div>

              {item.preview ? (
                <div className="mt-3 overflow-hidden rounded-2xl border border-stone-100">
                  <img
                    src={item.preview}
                    alt={item.title}
                    className="h-44 w-full object-cover transition-transform duration-300 ease-out group-hover:scale-[1.03]"
                    loading="lazy"
                  />
                </div>
              ) : null}

              {item.referenceImageUrls && item.referenceImageUrls.length > 0 ? (
                <div className="mt-2 grid grid-cols-3 gap-2">
                  {item.referenceImageUrls.slice(0, 3).map((url, index) => (
                    <div
                      key={`${item.id}-ref-${index}`}
                      className="overflow-hidden rounded-xl border border-stone-100"
                    >
                      <img
                        src={url}
                        alt={`${item.title} 参考图 ${index + 1}`}
                        className="h-20 w-full object-cover transition-transform duration-300 ease-out group-hover:scale-[1.05]"
                        loading="lazy"
                      />
                    </div>
                  ))}
                </div>
              ) : null}
            </article>
          ))
        )}
      </div>
      {hasMoreItems ? <div ref={listEndRef} className="h-1 w-full" aria-hidden="true" /> : null}

      <div className="rounded-[24px] border border-stone-200 bg-white p-4 text-xs leading-6 text-stone-500">
        <div className="flex items-center gap-2 text-stone-800">
          <BookText className="size-4" />
          数据来源：`builtin-prompts.json` + 本地自定义（浏览器存储）
        </div>
        <div className="mt-2">
          目前仅支持本地自定义与使用，公开广场暂不开放。
        </div>
      </div>

      <Dialog
        open={Boolean(activeDetailItem)}
        onOpenChange={(open) => {
          if (!open) {
            setActiveDetailItem(null);
          }
        }}
      >
        <DialogContent className="w-[min(94vw,860px)] max-h-[86vh] overflow-y-auto">
          {activeDetailItem ? (
            <>
              <DialogHeader>
                <DialogTitle>{activeDetailItem.title}</DialogTitle>
              </DialogHeader>
              <div className="flex flex-wrap gap-2 text-xs">
                <span className="rounded-full bg-stone-100 px-2.5 py-1 text-stone-600">
                  {activeDetailItem.mode === "edit" ? "编辑" : "生成"}
                </span>
                <span className="rounded-full bg-stone-100 px-2.5 py-1 text-stone-600">
                  {activeDetailItem.model}
                </span>
                <span className="rounded-full bg-stone-100 px-2.5 py-1 text-stone-600">
                  {activeDetailItem.category}
                </span>
                {activeDetailItem.subCategory ? (
                  <span className="rounded-full bg-stone-100 px-2.5 py-1 text-stone-600">
                    {activeDetailItem.subCategory}
                  </span>
                ) : null}
              </div>
              <div className="text-sm text-stone-600">
                作者：
                {activeDetailItem.author ? (
                  activeDetailItem.link ? (
                    <a
                      href={activeDetailItem.link}
                      target="_blank"
                      rel="noreferrer"
                      className="ml-1 text-sky-700 underline"
                    >
                      {activeDetailItem.author}
                    </a>
                  ) : (
                    <span className="ml-1">{activeDetailItem.author}</span>
                  )
                ) : (
                  <span className="ml-1 text-stone-400">未标注</span>
                )}
              </div>
              {activeDetailItem.preview ? (
                <div className="overflow-hidden rounded-2xl border border-stone-100">
                  <img
                    src={activeDetailItem.preview}
                    alt={activeDetailItem.title}
                    className="h-56 w-full object-cover"
                  />
                </div>
              ) : null}
              <div className="relative">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="absolute right-2 top-2 z-10 rounded-full bg-white/95"
                  onClick={() => void handleCopyPrompt(activeDetailItem.prompt)}
                >
                  <Copy className="size-4" />
                  复制提示词
                </Button>
                <pre className="max-h-[46vh] overflow-auto whitespace-pre-wrap rounded-2xl border border-stone-100 bg-stone-50 p-4 pt-12 text-xs leading-6 text-stone-700">
                  {activeDetailItem.prompt}
                </pre>
              </div>
              <div className="flex justify-end">
                <Button
                  className="rounded-full bg-stone-900 text-white hover:bg-stone-800"
                  onClick={() => handleUsePrompt(activeDetailItem)}
                >
                  <CheckCircle2 className="size-4" />
                  使用该提示词
                </Button>
              </div>
            </>
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog
        open={formOpen}
        onOpenChange={(open) => {
          setFormOpen(open);
          if (!open) {
            setEditingCustomPromptId(null);
          }
        }}
      >
        <DialogContent className="w-[min(94vw,860px)] max-h-[86vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingCustomPromptId ? "编辑自定义提示词" : "添加自定义提示词"}
            </DialogTitle>
          </DialogHeader>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Input
              placeholder="标题"
              value={form.title}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, title: event.target.value }))
              }
            />
            <Input
              placeholder="作者（可选）"
              value={form.author}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, author: event.target.value }))
              }
            />
            <Input
              placeholder="分类（如：海报）"
              value={form.category}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, category: event.target.value }))
              }
            />
            <Input
              placeholder="子分类（可选）"
              value={form.subCategory}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, subCategory: event.target.value }))
              }
            />
            <Input
              placeholder="作者参考链接（可选）"
              value={form.link}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, link: event.target.value }))
              }
              className="sm:col-span-2"
            />
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="flex items-center gap-2 rounded-xl border border-stone-200 bg-stone-50 px-2 py-1.5">
              <span className="shrink-0 text-xs text-stone-500">模式</span>
              <select
                value={form.mode}
                onChange={(event) =>
                  setForm((prev) => ({
                    ...prev,
                    mode: event.target.value === "edit" ? "edit" : "generate",
                  }))
                }
                className="h-9 w-full rounded-lg border border-stone-200 bg-white px-2 text-sm"
              >
                <option value="generate">生成</option>
                <option value="edit">编辑</option>
              </select>
            </div>
            <div className="flex items-center gap-2 rounded-xl border border-stone-200 bg-stone-50 px-2 py-1.5">
              <span className="shrink-0 text-xs text-stone-500">模型</span>
              <select
                value={form.model}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, model: event.target.value }))
                }
                className="h-9 w-full rounded-lg border border-stone-200 bg-white px-2 text-sm"
              >
                {(availableModels.length > 0 ? availableModels : [getStoredImageModel()]).map(
                  (model) => (
                    <option key={model} value={model}>
                      {model}
                    </option>
                  ),
                )}
              </select>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline"
              className="rounded-full"
              onClick={() => void handleFetchModels()}
              disabled={isLoadingModels}
            >
              {isLoadingModels ? <LoaderCircle className="size-4 animate-spin" /> : null}
              刷新模型列表
            </Button>
            <span className="text-xs text-stone-500">
              模型来源：`/v1/models`
            </span>
          </div>

          <textarea
            value={form.prompt}
            onChange={(event) =>
              setForm((prev) => ({ ...prev, prompt: event.target.value }))
            }
            placeholder="输入完整提示词内容"
            className="min-h-[200px] w-full rounded-2xl border border-stone-200 bg-stone-50 p-4 text-sm leading-6 text-stone-800 outline-none focus:border-stone-400"
          />

          <div className="space-y-2">
            <label
              htmlFor="custom-preview-upload"
              className="inline-flex cursor-pointer items-center gap-2 rounded-full border border-stone-200 bg-white px-3 py-2 text-sm text-stone-600 transition hover:bg-stone-50"
            >
              <Upload className="size-4" />
              上传本地预览图（Base64）
            </label>
            <input
              id="custom-preview-upload"
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (!file) {
                  return;
                }
                void handlePreviewUpload(file);
                event.currentTarget.value = "";
              }}
            />
            {form.preview ? (
              <div className="overflow-hidden rounded-2xl border border-stone-100">
                <img
                  src={form.preview}
                  alt="预览图"
                  className="h-52 w-full object-cover"
                />
              </div>
            ) : null}
          </div>

          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              className="rounded-full"
              disabled
              onClick={() => {
                toast.info("公开到广场功能暂未开放");
              }}
              title="公开到广场（暂未开放）"
              aria-label="公开到广场（暂未开放）"
            >
              公开到广场（暂未开放）
            </Button>
            <Button
              type="button"
              variant="outline"
              className="rounded-full"
              onClick={() => {
                setFormOpen(false);
                setEditingCustomPromptId(null);
              }}
            >
              取消
            </Button>
            <Button
              className="rounded-full bg-stone-900 text-white hover:bg-stone-800"
              onClick={() => void handleCreateCustomPrompt()}
              disabled={isSavingCustom}
            >
              {isSavingCustom ? <LoaderCircle className="size-4 animate-spin" /> : null}
              {editingCustomPromptId ? "更新提示词" : "保存提示词"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
      {showBackToTop ? (
        <button
          type="button"
          onClick={handleBackToTop}
          className="fixed bottom-6 right-6 z-40 inline-flex items-center gap-1.5 rounded-full border border-stone-200 bg-white/95 px-3 py-2 text-xs font-medium text-stone-700 shadow-[0_8px_24px_rgba(15,23,42,0.12)] backdrop-blur transition hover:-translate-y-0.5 hover:border-stone-300 hover:bg-white"
          aria-label="\u8fd4\u56de\u9876\u90e8"
          title="\u8fd4\u56de\u9876\u90e8"
        >
          <ArrowUp className="size-3.5" />
          {"\u8fd4\u56de\u9876\u90e8"}
        </button>
      ) : null}
    </section>
  );
}
