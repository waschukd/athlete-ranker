"use client";

import { Suspense, useEffect } from "react";
import { useSearchParams } from "next/navigation";

// The Goalie Service Provider now uses the SAME Service Provider dashboard,
// scoped to goalies by org type. This route just forwards there (keeping ?org).
function Redirect() {
  const sp = useSearchParams();
  useEffect(() => {
    const org = sp.get("org");
    window.location.replace(`/service-provider/dashboard${org ? `?org=${org}` : ""}`);
  }, [sp]);
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center" data-theme="premium">
      <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-accent" />
    </div>
  );
}

export default function GoalieProviderDashboardPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-gray-50" data-theme="premium" />}>
      <Redirect />
    </Suspense>
  );
}
