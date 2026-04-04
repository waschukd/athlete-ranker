"use client";

import { useState, useEffect, useCallback, Suspense } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { ArrowLeft, AlertTriangle, CheckCircle, Zap } from "lucide-react";

function FlagsContent() {
  const params = useParams();
  const catId = params.catId;
  const searchParams = useSearchParams();
  const orgId = searchParams.get("org");
  const sessionFilter = searchParams.get("session");

  const [flags, setFlags] = useState([]);
  const [loading, setLoading] = useState(true);
  const [detecting, setDetecting] = useState(false);
  const [msg, setMsg] = useState("");
  const [categoryName, setCategoryName] = useState("");

  const loadFlags = useCallback(async () => {
    setLoading(true);
    const [flagsRes, setupRes] = await Promise.all([
      fetch(`/api/categories/${catId}/flags`),
      fetch(`/api/categories/${catId}/setup`),
    ]);
    const flagsData = await flagsRes.json();
    const setupData = await setupRes.json();
    setFlags(flagsData.flags || []);
    setCategoryName(setupData.category?.name || "");
    setLoading(false);
  }, [catId]);

  useEffect(() => { loadFlags(); }, [loadFlags]);

  const detect = async () => {
    setDetecting(true);
    setMsg("");
    const res = await fetch(`/api/categories/${catId}/flags`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "detect" }),
    });
    const data = await res.json();
    setMsg(`Detection complete — ${data.flags_created} new flag${data.flags_created !== 1 ? "s" : ""} found`);
    loadFlags();
    setDetecting(false);
    setTimeout(() => setMsg(""), 4000);
  };

  const acknowledge = async (flagId) => {
    await fetch(`/api/categories/${catId}/flags`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "acknowledge", flag_id: flagId }),
    });
    loadFlags();
  };

  const displayed = sessionFilter
    ? flags.filter(f => String(f.session_number) === String(sessionFilter))
    : flags;

  const unreviewed = displayed.filter(f => !f.acknowledged);
  const reviewed = displayed.filter(f => f.acknowledged);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 shadow-sm">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-5">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-3">
              <a href={`/association/dashboard/category/${catId}?org=${orgId}`}
                className="p-2 text-gray-400 hover:text-[#1A6BFF] transition-colors rounded-lg hover:bg-gray-100">
                <ArrowLeft size={18} />
              </a>
              <div>
                <h1 className="text-xl font-bold text-gray-900">
                  Athlete Flags {sessionFilter ? `— Session ${sessionFilter}` : "— All Sessions"}
                </h1>
                <p className="text-sm text-gray-400 mt-0.5">{categoryName} · Outlier detection</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              {msg && <span className="text-sm text-green-600 font-medium">{msg}</span>}
              <button onClick={detect} disabled={detecting}
                className="inline-flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-[#1A6BFF] to-[#4D8FFF] text-white rounded-xl text-sm font-semibold disabled:opacity-50 hover:shadow-md transition-shadow">
                <Zap size={14} />
                {detecting ? "Detecting..." : "Run Detection"}
              </button>
            </div>
          </div>

          {/* Session filter tabs */}
          {!sessionFilter && flags.length > 0 && (
            <div className="flex gap-1 mt-4 overflow-x-auto">
              {[...new Set(flags.map(f => f.session_number))].sort((a,b) => a-b).map(sNum => {
                const sFlags = flags.filter(f => f.session_number === sNum);
                const sUnacked = sFlags.filter(f => !f.acknowledged).length;
                return (
                  <a key={sNum}
                    href={`/association/dashboard/category/${catId}/flags?org=${orgId}&session=${sNum}`}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-200 text-xs font-medium text-gray-600 hover:border-[#1A6BFF] hover:text-[#1A6BFF] whitespace-nowrap">
                    Session {sNum}
                    {sUnacked > 0 && <span className="px-1.5 py-0.5 bg-red-100 text-red-600 rounded-full text-xs font-bold">{sUnacked}</span>}
                  </a>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8 space-y-6">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-[#1A6BFF]" />
          </div>
        ) : displayed.length === 0 ? (
          <div className="bg-white border border-dashed border-gray-200 rounded-2xl px-6 py-16 text-center">
            <CheckCircle size={36} className="mx-auto text-gray-200 mb-3" />
            <p className="text-gray-400 text-sm">No flags detected{sessionFilter ? ` for Session ${sessionFilter}` : ""}.</p>
            <p className="text-gray-400 text-xs mt-1">Click Run Detection after scores are uploaded.</p>
          </div>
        ) : (
          <>
            {/* Unreviewed */}
            {unreviewed.length > 0 && (
              <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
                <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
                  <div className="flex items-center gap-2">
                    <AlertTriangle size={16} className="text-amber-500" />
                    <span className="text-base font-semibold text-gray-900">
                      {unreviewed.length} Unreviewed Flag{unreviewed.length !== 1 ? "s" : ""}
                    </span>
                  </div>
                </div>
                <div className="divide-y divide-gray-100">
                  {unreviewed.map(f => (
                    <div key={f.id} className="flex items-start justify-between px-5 py-4 gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${f.severity === "critical" ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700"}`}>
                            {f.severity === "critical" ? "Critical" : "Warning"}
                          </span>
                          <span className="text-sm font-bold text-gray-900">{f.first_name} {f.last_name}</span>
                          <span className="text-xs text-gray-400">Session {f.session_number}</span>
                          <span className="text-xs text-gray-500">{f.flag_type === "personal_drop" ? "Significant Drop" : "Session Outlier"}</span>
                        </div>
                        <p className="text-xs text-gray-400 mt-1.5">
                          {f.flag_type === "personal_drop"
                            ? `Previous avg: ${f.details?.prev_avg} → Current: ${f.details?.current_score} (drop of ${f.details?.drop})`
                            : `Score: ${f.details?.athlete_score} vs session mean: ${f.details?.session_mean} (z-score: ${f.details?.z_score})`}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <a href={`/player/report?athlete=${f.athlete_id}&cat=${catId}`}
                          className="text-xs px-3 py-1.5 border border-gray-200 text-gray-500 rounded-lg hover:border-[#1A6BFF] hover:text-[#1A6BFF] transition-colors">
                          Report
                        </a>
                        <button onClick={() => acknowledge(f.id)}
                          className="text-xs px-3 py-1.5 bg-green-50 text-green-600 border border-green-200 rounded-lg hover:bg-green-100 font-medium transition-colors">
                          Acknowledge
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Reviewed */}
            {reviewed.length > 0 && (
              <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden opacity-60">
                <div className="flex items-center gap-2 px-5 py-4 border-b border-gray-100">
                  <CheckCircle size={15} className="text-green-500" />
                  <span className="text-sm font-semibold text-gray-500">
                    {reviewed.length} Reviewed
                  </span>
                </div>
                <div className="divide-y divide-gray-100">
                  {reviewed.map(f => (
                    <div key={f.id} className="flex items-start justify-between px-5 py-3 gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${f.severity === "critical" ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700"}`}>
                            {f.severity === "critical" ? "Critical" : "Warning"}
                          </span>
                          <span className="text-sm font-medium text-gray-600">{f.first_name} {f.last_name}</span>
                          <span className="text-xs text-gray-400">Session {f.session_number}</span>
                        </div>
                        <p className="text-xs text-gray-400 mt-1">
                          {f.flag_type === "personal_drop"
                            ? `Drop of ${f.details?.drop} — reviewed by ${f.acknowledged_by_name}`
                            : `Outlier — reviewed by ${f.acknowledged_by_name}`}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

export default function FlagsPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-[#1A6BFF]" />
      </div>
    }>
      <FlagsContent />
    </Suspense>
  );
}
