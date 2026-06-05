"use client";

import { Suspense, useState, useEffect } from "react";
import { useQuery, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AlertCircle } from "lucide-react";
import { useTrackPageView } from "@/lib/useAnalytics";
import CategoryDashboard from "@/components/CategoryDashboard";

const qc = new QueryClient();
const LAST_CAT_KEY = "director_last_cat";

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

  const assignments = dirData?.assignments || [];
  const [selectedCatId, setSelectedCatId] = useState(null);

  // Restore last-viewed category once assignments load (falls back to the first)
  useEffect(() => {
    if (!assignments.length) return;
    const saved = Number(localStorage.getItem(LAST_CAT_KEY));
    const valid = assignments.some(a => a.age_category_id === saved);
    setSelectedCatId(valid ? saved : assignments[0].age_category_id);
  }, [dirData]); // eslint-disable-line react-hooks/exhaustive-deps

  const assignment = assignments.find(a => a.age_category_id === selectedCatId) || assignments[0];
  const catId = assignment?.age_category_id;
  const orgId = assignment?.organization_id;

  const pickCategory = (id) => {
    setSelectedCatId(id);
    try { localStorage.setItem(LAST_CAT_KEY, String(id)); } catch {}
  };

  const categorySwitcher = assignments.length > 1 ? (
    <select
      value={assignment?.age_category_id || ""}
      onChange={(e) => pickCategory(Number(e.target.value))}
      aria-label="Switch age category"
      className="px-3 py-2 rounded-lg border border-gray-300 bg-white text-sm font-medium text-ink focus:outline-none focus:ring-2 focus:ring-accent/30 cursor-pointer max-w-[15rem]"
    >
      {assignments.map(a => (
        <option key={a.age_category_id} value={a.age_category_id}>{a.org_name} · {a.category_name}</option>
      ))}
    </select>
  ) : null;

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
      key={catId}
      role="director"
      catId={catId}
      orgId={orgId}
      categoryName={assignment.category_name}
      orgName={assignment.org_name}
      status={assignment.status}
      onSignOut={signOut}
      categorySwitcher={categorySwitcher}
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
