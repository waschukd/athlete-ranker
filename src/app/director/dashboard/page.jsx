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
  // "overview" (all my categories) or "category" (one dashboard). A director with
  // more than one assignment lands on the overview first, like an association admin.
  const [view, setView] = useState("category");

  useEffect(() => {
    if (!assignments.length) return;
    const saved = Number(localStorage.getItem(LAST_CAT_KEY));
    const valid = assignments.some(a => a.age_category_id === saved);
    setSelectedCatId(valid ? saved : assignments[0].age_category_id);
    setView(assignments.length > 1 ? "overview" : "category");
  }, [dirData]); // eslint-disable-line react-hooks/exhaustive-deps

  const assignment = assignments.find(a => a.age_category_id === selectedCatId) || assignments[0];
  const catId = assignment?.age_category_id;
  const orgId = assignment?.organization_id;

  const openCategory = (id) => {
    setSelectedCatId(id);
    try { localStorage.setItem(LAST_CAT_KEY, String(id)); } catch {}
    setView("category");
  };

  const signOut = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/account/signin";
  };

  // Inside a category, a multi-category director gets a "back to overview" link
  // plus the direct-switch dropdown.
  const categorySwitcher = assignments.length > 1 ? (
    <div className="flex items-center gap-2">
      <button onClick={() => setView("overview")} className="px-3 py-2 rounded-lg border border-gray-300 bg-white text-sm font-medium text-ink hover:bg-gray-50 whitespace-nowrap">← All categories</button>
      <select
        value={assignment?.age_category_id || ""}
        onChange={(e) => openCategory(Number(e.target.value))}
        aria-label="Switch age category"
        className="px-3 py-2 rounded-lg border border-gray-300 bg-white text-sm font-medium text-ink focus:outline-none focus:ring-2 focus:ring-accent/30 cursor-pointer max-w-[15rem]"
      >
        {assignments.map(a => (
          <option key={a.age_category_id} value={a.age_category_id}>{a.org_name} · {a.category_name}</option>
        ))}
      </select>
    </div>
  ) : null;

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

  // Overview — all the director's categories as cards (multi-category directors).
  if (view === "overview" && assignments.length > 1) {
    const orgCount = new Set(assignments.map(a => a.org_name)).size;
    return (
      <div className="min-h-screen bg-gray-50">
        <header className="border-b border-gray-200 bg-white">
          <div className="max-w-6xl mx-auto px-6 py-5 flex items-center justify-between gap-4">
            <div>
              <div className="text-[11px] font-bold uppercase tracking-[0.2em] text-[#0b5cd6]">Director</div>
              <h1 className="font-display text-2xl font-black text-ink leading-tight">My Categories</h1>
              <p className="text-sm text-gray-500 mt-0.5">{assignments.length} categories{orgCount > 1 ? ` across ${orgCount} associations` : `${assignments[0]?.org_name ? ` · ${assignments[0].org_name}` : ""}`}</p>
            </div>
            <button onClick={signOut} className="px-4 py-2 border border-gray-300 text-gray-600 rounded-lg text-sm font-medium hover:bg-gray-50 whitespace-nowrap">Sign out</button>
          </div>
        </header>
        <main className="max-w-6xl mx-auto px-6 py-8">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {assignments.map(a => (
              <button
                key={a.age_category_id}
                onClick={() => openCategory(a.age_category_id)}
                className="text-left bg-white border border-gray-200 rounded-2xl p-5 hover:shadow-md hover:border-[#0b5cd6]/40 transition-all"
              >
                <div className="flex items-center justify-between mb-2 gap-2">
                  <span className="text-[11px] font-bold uppercase tracking-wide text-gray-400 truncate">{a.org_name}</span>
                  <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold flex-shrink-0 ${a.status === "active" ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700"}`}>{a.status === "active" ? "Active" : "Setup"}</span>
                </div>
                <div className="font-display text-xl font-black text-ink">{a.category_name}</div>
                <div className="text-sm text-gray-500 mt-2"><b className="text-ink">{a.athletes_count ?? 0}</b> athletes · <b className="text-ink">{a.sessions_count ?? 0}</b> sessions</div>
                <div className="mt-4 text-sm font-semibold text-[#0b5cd6]">Open dashboard →</div>
              </button>
            ))}
          </div>
        </main>
      </div>
    );
  }

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
