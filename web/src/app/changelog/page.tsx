"use client";

import { useEffect, useState } from "react";
import { CalendarDays, FileClock, LoaderCircle, Sparkles } from "lucide-react";
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
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
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
          <span className="inline-flex size-11 items-center justify-center rounded-2xl bg-stone-950 text-white dark:bg-[var(--studio-accent-strong)] dark:text-[var(--studio-accent-foreground)]">
            <Sparkles className="size-4.5" />
          </span>
        </div>

        <div className="mb-6 flex flex-wrap items-center gap-2 text-xs">
          <span className="inline-flex items-center gap-1 rounded-full border border-stone-200 bg-stone-50 px-3 py-1 text-stone-600 dark:border-[var(--studio-border)] dark:bg-[var(--studio-panel-soft)] dark:text-[var(--studio-text-muted)]">
            <CalendarDays className="size-3.5" />
            按时间倒序记录
          </span>
          <span className="inline-flex items-center gap-1 rounded-full border border-stone-200 bg-stone-50 px-3 py-1 text-stone-600 dark:border-[var(--studio-border)] dark:bg-[var(--studio-panel-soft)] dark:text-[var(--studio-text-muted)]">
            Markdown 实时渲染
          </span>
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
          <article className="max-w-none">
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={{
                h1: ({ children }) => (
                  <h1 className="mb-4 text-3xl font-semibold tracking-tight text-stone-900 dark:text-[var(--studio-text-strong)]">
                    {children}
                  </h1>
                ),
                h2: ({ children }) => (
                  <h2 className="mt-8 mb-4 border-b border-stone-200 pb-2 text-2xl font-semibold tracking-tight text-stone-900 dark:border-[var(--studio-border)] dark:text-[var(--studio-text-strong)]">
                    {children}
                  </h2>
                ),
                h3: ({ children }) => (
                  <h3 className="mt-5 mb-2 text-base font-semibold text-stone-800 dark:text-[var(--studio-text)]">
                    {children}
                  </h3>
                ),
                p: ({ children }) => (
                  <p className="my-2 text-sm leading-7 text-stone-600 dark:text-[var(--studio-text-muted)]">
                    {children}
                  </p>
                ),
                ul: ({ children }) => (
                  <ul className="my-2 list-disc space-y-1.5 pl-5 text-sm leading-7 text-stone-700 dark:text-[var(--studio-text)]">
                    {children}
                  </ul>
                ),
                li: ({ children }) => <li>{children}</li>,
                blockquote: ({ children }) => (
                  <blockquote className="my-4 rounded-2xl border border-stone-200 bg-stone-50 px-4 py-3 text-sm text-stone-600 dark:border-[var(--studio-border)] dark:bg-[var(--studio-panel-soft)] dark:text-[var(--studio-text-muted)]">
                    {children}
                  </blockquote>
                ),
                code: ({ children }) => (
                  <code className="rounded bg-stone-100 px-1.5 py-0.5 text-[0.88em] text-stone-800 dark:bg-[var(--studio-panel-soft)] dark:text-[var(--studio-text)]">
                    {children}
                  </code>
                ),
              }}
            >
              {markdownContent}
            </ReactMarkdown>
          </article>
        ) : null}
      </div>
    </section>
  );
}
