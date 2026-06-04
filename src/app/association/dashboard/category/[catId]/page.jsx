"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useTrackPageView } from "@/lib/useAnalytics";
import CategoryDashboard from "@/components/CategoryDashboard";

const qc = new QueryClient();

function CategoryHub() {
  const searchParams = useSearchParams();
  const orgId = searchParams.get("org");
  const catId = typeof window !== "undefined" ? window.location.pathname.split("/")[4] : null;
  useTrackPageView("category.viewed", { catId, orgId });

  return <CategoryDashboard role="association" catId={catId} orgId={orgId} />;
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
