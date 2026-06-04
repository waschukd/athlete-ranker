"use client";

import { Suspense } from "react";
import { useQuery, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AlertCircle } from "lucide-react";
import { useTrackPageView } from "@/lib/useAnalytics";
import CategoryDashboard from "@/components/CategoryDashboard";

const qc = new QueryClient();

function DirectorDashboardInner() {
  useTrackPageView("dashboard.director.viewed");

  const { data: dirData, isLoading: dirLoading } = useQuery({
    queryKey: ["director-category"],
    queryFn: async () => {
      const res = await fetch("/api/director/category");
      if (!res.ok) throw new Error("Not assigned");
      return res.json();
    },
  });

  const assignment = dirData?.assignments?.[0];
  const catId = assignment?.age_category_id;
  const orgId = assignment?.organization_id;

  const signOut = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/account/signin";
  };

  if (dirLoading) return <div className="min-h-screen bg-gray-50 flex items-center justify-center"><div className="animate-spin rounded-full h-10 w-10 border-b-2 border-[#0b5cd6]" /></div>;

  if (!assignment) return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="text-center max-w-sm">
        <AlertCircle size={52} className="mx-auto text-gray-300 mb-4" />
        <h2 className="text-xl font-bold text-gray-700 mb-2">No Category Assigned</h2>
        <p className="text-sm text-gray-400">Your association admin needs to assign you to an age category as a director.</p>
      </div>
    </div>
  );

  return (
    <CategoryDashboard
      role="director"
      catId={catId}
      orgId={orgId}
      categoryName={assignment.category_name}
      orgName={assignment.org_name}
      status={assignment.status}
      onSignOut={signOut}
    />
  );
}

export default function DirectorDashboardPage() {
  return (
    <QueryClientProvider client={qc}>
      <Suspense fallback={<div className="min-h-screen bg-gray-50 flex items-center justify-center"><div className="animate-spin rounded-full h-10 w-10 border-b-2 border-[#0b5cd6]" /></div>}>
        <DirectorDashboardInner />
      </Suspense>
    </QueryClientProvider>
  );
}
