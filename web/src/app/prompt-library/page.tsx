"use client";

import { useEffect, useMemo, useState } from "react";
import {
  BookText,
  CheckCircle2,
  Globe,
  Search,
  Star,
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
import builtinPromptsRaw from "./builtin-prompts.json";
import {
  getPromptFavoriteIds,
  setPromptFavoriteIds,
  setPendingPromptForWorkspace,
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

export default function PromptLibraryPage() {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [activeDetailItem, setActiveDetailItem] = useState<PromptLibraryItem | null>(
    null,
  );
  const [selectedMode, setSelectedMode] = useState<"all" | "generate" | "edit">("all");
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [selectedSubCategory, setSelectedSubCategory] = useState("all");
  const [favoriteIds, setFavoriteIds] = useState<Set<string>>(
    () => new Set(getPromptFavoriteIds()),
  );
  const [favoritesOnly, setFavoritesOnly] = useState(false);

  const modeFilteredItems = useMemo(() => {
    if (selectedMode === "all") {
      return BUILTIN_PROMPTS;
    }
    return BUILTIN_PROMPTS.filter((item) => item.mode === selectedMode);
  }, [selectedMode]);

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

  const handleUsePrompt = (item: PromptLibraryItem) => {
    setPendingPromptForWorkspace({
      title: item.title,
      prompt: item.prompt,
      mode: item.mode,
    });
    toast.success("已加入工作台输入框");
    navigate("/image/workspace");
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

  return (
    <section className="flex h-full min-h-0 w-full flex-col gap-4 overflow-y-auto p-2 sm:p-4">
      <div className="rounded-[28px] border border-stone-200 bg-white p-5 shadow-[0_12px_30px_rgba(15,23,42,0.06)]">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-2xl font-semibold tracking-tight text-stone-900">
              提示词库
            </h1>
            <p className="mt-1 text-sm text-stone-500">
              当前仅显示内置 JSON 提示词库，可搜索并一键应用到图片工作台。
            </p>
          </div>
          <Button
            type="button"
            disabled
            variant="outline"
            className="rounded-full"
            onClick={() => {
              toast.info("公开到广场功能暂未开放");
            }}
            title="公开到广场（暂未开放）"
            aria-label="公开到广场（暂未开放）"
          >
            <Globe className="size-4" />
            公开到广场（暂未开放）
          </Button>
        </div>

        <div className="mt-4 flex items-center gap-2 rounded-2xl border border-stone-200 bg-stone-50 px-3 py-2">
          <Search className="size-4 text-stone-500" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="搜索标题、分类、作者、正文"
            className="h-8 border-0 bg-transparent px-0 shadow-none focus-visible:ring-0"
          />
        </div>
        <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
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
        </div>
        <div className="mt-2">
          <button
            type="button"
            onClick={() => setFavoritesOnly((current) => !current)}
            className="inline-flex items-center gap-1 rounded-full border border-stone-200 bg-white px-3 py-1.5 text-xs text-stone-600 transition hover:bg-stone-50"
          >
            <Star
              className={`size-3.5 ${favoritesOnly ? "fill-amber-400 text-amber-500" : "text-stone-400"}`}
            />
            {favoritesOnly ? "仅看收藏" : "显示全部"}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
        {filteredItems.length === 0 ? (
          <div className="col-span-full rounded-[24px] border border-dashed border-stone-300 bg-stone-50 p-8 text-center text-sm text-stone-500">
            未匹配到提示词，换个关键词试试。
          </div>
        ) : (
          filteredItems.map((item) => (
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

      <div className="rounded-[24px] border border-stone-200 bg-white p-4 text-xs leading-6 text-stone-500">
        <div className="flex items-center gap-2 text-stone-800">
          <BookText className="size-4" />
          数据来源：`builtin-prompts.json`
        </div>
        <div className="mt-2">
          当前版本仅做“内置提示词库展示 + 一键使用”，公开发布能力暂不开放。
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
              <pre className="max-h-[46vh] overflow-auto whitespace-pre-wrap rounded-2xl border border-stone-100 bg-stone-50 p-4 text-xs leading-6 text-stone-700">
                {activeDetailItem.prompt}
              </pre>
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
    </section>
  );
}


