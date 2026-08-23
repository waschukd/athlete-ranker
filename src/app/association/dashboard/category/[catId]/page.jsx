"use client";

import { Suspense } from "react";
import { useSearchParams, useParams } from "next/navigation";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useTrackPageView } from "@/lib/useAnalytics";
import CategoryDashboard from "@/components/CategoryDashboard";

const qc = new QueryClient();

function CategoryHub() {
  const searchParams = useSearchParams();
  const orgId = searchParams.get("org");
  const initialTab = searchParams.get("tab");
  // useParams() is SSR-safe -- it resolves from the matched route on both
  // server and client. Reading window.location.pathname directly gave the
  // server "null" (no window) and the client the real id on its very first
  // render, a guaranteed hydration mismatch (React errors #418/#422) on
  // every load of this page.
  const params = useParams();
  const catId = params.catId;
  useTrackPageView("category.viewed", { catId, orgId });

  return <CategoryDashboard role="association" catId={catId} orgId={orgId} initialTab={initialTab} />;
}

export default function CategoryPage() {
  return (
    <QueryClientProvider client={qc}>
      <Suspense fallback={<div className="min-h-screen bg-gray-50 flex items-center justify-center"><div className="animate-spin rounded-full h-10 w-10 border-b-2 border-[#0b5cd6]" /></div>}>
        <CategoryHub />
      </Suspense>
    </QueryClientProvider>
  );
}
