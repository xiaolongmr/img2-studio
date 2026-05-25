import { lazy, Suspense } from "react";
import { Navigate, Route, Routes } from "react-router-dom";

import AppShell from "@/app/layout";

const ImagePage = lazy(() => import("@/app/image/page"));
const LoginPage = lazy(() => import("@/app/login/page"));
const HomePage = lazy(() => import("@/app/page"));
const PromptLibraryPage = lazy(() => import("@/app/prompt-library/page"));
const ChangelogPage = lazy(() => import("@/app/changelog/page"));
const SettingsPage = lazy(() => import("@/app/settings/page"));

function AppRouteFallback() {
  return (
    <section className="flex min-h-[260px] items-center justify-center p-6">
      <div className="text-sm text-stone-500">页面加载中...</div>
    </section>
  );
}

export default function App() {
  return (
    <AppShell>
      <Suspense fallback={<AppRouteFallback />}>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/image" element={<Navigate to="/image/history" replace />} />
          <Route path="/image/*" element={<ImagePage />} />
          <Route path="/prompt-library" element={<PromptLibraryPage />} />
          <Route path="/changelog" element={<ChangelogPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/accounts" element={<Navigate to="/image/history" replace />} />
          <Route path="/startup-check" element={<Navigate to="/image/history" replace />} />
          <Route path="/requests" element={<Navigate to="/image/history" replace />} />
        </Routes>
      </Suspense>
    </AppShell>
  );
}
