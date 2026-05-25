"use client";

import { useEffect, useState } from "react";
import { FileClock, LoaderCircle } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

export default function ChangelogPage() {
  const [markdownContent, setMarkdownContent] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    let cancelled = false;
    const loadChangelog = async () => {
      setIsLoading(true);
      setLoadError("");
      try {
        const response = await fetch("/CHANGELOG.md", { cache: "no-store" });
        if (!response.ok) {
          throw new Error(`读取更新记录失败（${response.status}）`);
        }
        const content = await response.text();
        if (!cancelled) {
          setMarkdownContent(content);
        }
      } catch (error) {
        if (!cancelled) {
          setLoadError(error instanceof Error ? error.message : "读取更新记录失败");
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    };

    void loadChangelog();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <section className="flex h-full min-h-0 items-start justify-center overflow-y-auto p-2 sm:p-4">
      <div className="w-full max-w-[980px] rounded-[30px] border border-stone-200 bg-white p-5 shadow-[0_18px_60px_rgba(15,23,42,0.06)] dark:border-[var(--studio-border)] dark:bg-[var(--studio-panel)] sm:p-7">
        <div className="mb-5 flex items-center gap-3">
          <span className="inline-flex size-11 items-center justify-center rounded-2xl bg-stone-950 text-white dark:bg-[var(--studio-accent-strong)] dark:text-[var(--studio-accent-foreground)]">
            <FileClock className="size-4.5" />
          </span>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-stone-900 dark:text-[var(--studio-text-strong)]">
              更新记录
            </h1>
            <p className="text-sm text-stone-500 dark:text-[var(--studio-text-muted)]">
              每次更新都会同步写入 `CHANGELOG.md` 并在本页展示。
            </p>
          </div>
        </div>

        {isLoading ? (
          <div className="flex min-h-[220px] items-center justify-center text-stone-500">
            <LoaderCircle className="mr-2 size-4 animate-spin" />
            正在加载更新记录...
          </div>
        ) : null}

        {!isLoading && loadError ? (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
            {loadError}
          </div>
        ) : null}

        {!isLoading && !loadError ? (
          <article className="prose prose-stone max-w-none dark:prose-invert prose-headings:tracking-tight prose-pre:rounded-2xl prose-pre:border prose-pre:border-stone-200 prose-pre:bg-stone-50 prose-pre:p-4 prose-pre:text-stone-800 prose-code:text-[0.88em] prose-li:my-1.5">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {markdownContent}
            </ReactMarkdown>
          </article>
        ) : null}
      </div>
    </section>
  );
}
