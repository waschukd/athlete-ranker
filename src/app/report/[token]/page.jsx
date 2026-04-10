"use client";

import { useState, useEffect } from "react";
import { Trophy, BarChart3, FileText, Lock, Download, Star, TrendingUp, Users, ChevronDown, ChevronRight } from "lucide-react";

export default function PublicReportPage({ params }) {
  const { token } = params;
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("overview");
  const [unlocking, setUnlocking] = useState(false);
  const [paymentStatus, setPaymentStatus] = useState(null);

  useEffect(() => {
    // Check for payment return
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get("payment") === "success") setPaymentStatus("success");
    if (urlParams.get("payment") === "cancelled") setPaymentStatus("cancelled");

    fetchData();
  }, [token]);

  const fetchData = async () => {
    setLoading(true);
    const res = await fetch(`/api/report/${token}`);
    if (res.ok) setData(await res.json());
    setLoading(false);
  };

  // Poll briefly after payment success for webhook to fire
  useEffect(() => {
    if (paymentStatus === "success" && data && !data.purchased) {
      const interval = setInterval(fetchData, 2000);
      const timeout = setTimeout(() => clearInterval(interval), 15000);
      return () => { clearInterval(interval); clearTimeout(timeout); };
    }
  }, [paymentStatus, data?.purchased]);

  const handleUnlock = async () => {
    setUnlocking(true);
    const res = await fetch("/api/payments/create-checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    });
    const result = await res.json();
    if (result.already_purchased) { fetchData(); setUnlocking(false); return; }
    if (result.checkout_url) window.location.href = result.checkout_url;
    else setUnlocking(false);
  };

  if (loading) return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-[#1A6BFF]" />
    </div>
  );

  if (!data) return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-6">
      <div className="text-center">
        <div className="text-5xl mb-4">🔗</div>
        <h2 className="text-xl font-bold text-gray-900 mb-2">Report Not Found</h2>
        <p className="text-gray-500 text-sm">This link is invalid or has expired.</p>
      </div>
    </div>
  );

  const { athlete, category_name, org_name, rank, total_athletes, percentile, overall_avg, scale, sessions, purchased, price } = data;
  const priceStr = `$${(price / 100).toFixed(2)}`;

  const tabs = [
    { id: "overview", label: "Overview", icon: BarChart3, locked: false },
    { id: "scores", label: "Scores", icon: Trophy, locked: !purchased },
    { id: "notes", label: "Notes", icon: FileText, locked: !purchased },
    { id: "scout", label: "Scouting Report", icon: Star, locked: !purchased },
  ];

  return (
    <div className="min-h-screen bg-gray-50" style={{ fontFamily: "'Inter', -apple-system, sans-serif" }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');`}</style>

      {/* Header */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-3xl mx-auto px-6 py-6">
          <div className="flex items-center gap-3 mb-1">
            <img src="/s-mark-dark.svg" style={{ width: 32, height: 32, objectFit: "contain" }} alt="Sideline Star" />
            <span className="text-sm font-medium text-gray-400">Sideline Star</span>
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mt-3">{athlete.first_name} {athlete.last_name}</h1>
          <div className="flex items-center gap-3 mt-1">
            {athlete.position && <span className="text-xs font-medium px-2 py-0.5 bg-blue-100 text-blue-700 rounded">{athlete.position}</span>}
            <span className="text-sm text-gray-500">{category_name}</span>
            {org_name && <span className="text-xs text-gray-400">· {org_name}</span>}
          </div>
        </div>

        {/* Tabs */}
        <div className="max-w-3xl mx-auto px-6">
          <div className="flex gap-1">
            {tabs.map(tab => (
              <button key={tab.id} onClick={() => !tab.locked && setActiveTab(tab.id)}
                className={`flex items-center gap-1.5 px-4 py-3 text-sm font-medium border-b-2 whitespace-nowrap transition-colors ${
                  activeTab === tab.id ? "border-[#1A6BFF] text-[#1A6BFF]" : tab.locked ? "border-transparent text-gray-300 cursor-not-allowed" : "border-transparent text-gray-500 hover:text-gray-700"
                }`}>
                {tab.locked ? <Lock size={12} /> : <tab.icon size={14} />} {tab.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Payment status banners */}
      {paymentStatus === "success" && !purchased && (
        <div className="max-w-3xl mx-auto px-6 mt-4">
          <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 text-sm text-blue-700 flex items-center gap-2">
            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600" />
            Processing your payment... this usually takes a few seconds.
          </div>
        </div>
      )}
      {paymentStatus === "success" && purchased && (
        <div className="max-w-3xl mx-auto px-6 mt-4">
          <div className="bg-green-50 border border-green-200 rounded-xl px-4 py-3 text-sm text-green-700">
            Payment successful! Your full report is now unlocked.
          </div>
        </div>
      )}

      <div className="max-w-3xl mx-auto px-6 py-8">

        {/* ─── Overview (always visible) ────────────────── */}
        {activeTab === "overview" && (
          <div className="space-y-6">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="bg-white border border-gray-200 rounded-xl p-4 text-center">
                <div className="text-3xl font-bold text-[#1A6BFF]">#{rank || "—"}</div>
                <div className="text-xs text-gray-500 mt-1">Overall Rank</div>
              </div>
              <div className="bg-white border border-gray-200 rounded-xl p-4 text-center">
                <div className="text-3xl font-bold text-green-600">{percentile !== null ? `${percentile}%` : "—"}</div>
                <div className="text-xs text-gray-500 mt-1">Percentile</div>
              </div>
              <div className="bg-white border border-gray-200 rounded-xl p-4 text-center">
                <div className="text-3xl font-bold text-gray-900">{overall_avg || "—"}</div>
                <div className="text-xs text-gray-500 mt-1">Avg Score (/{scale})</div>
              </div>
              <div className="bg-white border border-gray-200 rounded-xl p-4 text-center">
                <div className="text-3xl font-bold text-gray-900">{total_athletes}</div>
                <div className="text-xs text-gray-500 mt-1">Total Athletes</div>
              </div>
            </div>

            {/* Session performance */}
            <div className="bg-white border border-gray-200 rounded-xl p-5">
              <h3 className="text-sm font-semibold text-gray-900 mb-4">Session Performance</h3>
              <div className="space-y-3">
                {sessions.map(s => (
                  <div key={s.session_number} className="flex items-center gap-4">
                    <div className="w-20 text-xs text-gray-500 flex-shrink-0">S{s.session_number} · {s.session_type}</div>
                    <div className="flex-1 h-3 bg-gray-100 rounded-full overflow-hidden">
                      <div className="h-full bg-gradient-to-r from-[#1A6BFF] to-[#4D8FFF] rounded-full" style={{ width: s.avg_score ? `${(s.avg_score / scale) * 100}%` : "0%" }} />
                    </div>
                    <div className="w-12 text-right text-sm font-semibold text-gray-900">{s.avg_score || "—"}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ─── Paid content ────────────────────────────── */}
        {activeTab === "scores" && purchased && data.scores && (
          <div className="space-y-4">
            <h3 className="text-base font-semibold text-gray-900">Detailed Score Breakdown</h3>
            {sessions.map(s => {
              const sessionScores = data.scores.filter(sc => sc.session_number === s.session_number);
              if (!sessionScores.length) return null;
              const evaluators = [...new Set(sessionScores.map(sc => sc.evaluator_name))];
              const categories = [...new Map(sessionScores.map(sc => [sc.scoring_category_id, sc.category_name])).entries()];
              return (
                <div key={s.session_number} className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                  <div className="px-4 py-3 bg-gray-50 border-b border-gray-100 text-sm font-semibold text-gray-700">Session {s.session_number} — {s.name}</div>
                  <div className="overflow-x-auto p-4">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-gray-100">
                          <th className="text-left py-2 pr-3 text-xs text-gray-400">Evaluator</th>
                          {categories.map(([id, name]) => <th key={id} className="text-center py-2 px-2 text-xs text-gray-400">{name}</th>)}
                        </tr>
                      </thead>
                      <tbody>
                        {evaluators.map(ev => (
                          <tr key={ev} className="border-b border-gray-50 last:border-0">
                            <td className="py-2 pr-3 text-xs text-gray-600 font-medium">{ev}</td>
                            {categories.map(([catId]) => {
                              const score = sessionScores.find(sc => sc.evaluator_name === ev && sc.scoring_category_id === catId);
                              return <td key={catId} className="text-center py-2 px-2 text-sm font-mono text-gray-900">{score ? parseFloat(score.score) : "—"}</td>;
                            })}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {activeTab === "notes" && purchased && data.notes && (
          <div className="space-y-4">
            <h3 className="text-base font-semibold text-gray-900">Evaluator Notes</h3>
            {data.notes.length === 0 ? (
              <div className="text-center py-12 text-gray-400 text-sm">No evaluator notes for this player</div>
            ) : (
              sessions.map(s => {
                const sessionNotes = data.notes.filter(n => n.session_number === s.session_number);
                if (!sessionNotes.length) return null;
                return (
                  <div key={s.session_number} className="bg-white border border-gray-200 rounded-xl p-5">
                    <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Session {s.session_number}</div>
                    <div className="space-y-3">
                      {sessionNotes.map((n, i) => (
                        <div key={i} className="bg-gray-50 rounded-lg p-3">
                          <div className="text-xs text-gray-400 mb-1">{n.evaluator_name} · {new Date(n.created_at).toLocaleDateString()}</div>
                          <div className="text-sm text-gray-700 leading-relaxed">{n.note_text}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}

        {activeTab === "scout" && purchased && (
          <div className="space-y-4">
            <h3 className="text-base font-semibold text-gray-900">AI Scouting Report</h3>
            {data.scouting_report ? (
              <div className="bg-white border border-gray-200 rounded-xl p-6">
                <div className="flex items-center gap-2 mb-4">
                  <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#1A6BFF] to-[#4D8FFF] flex items-center justify-center">
                    <Star size={14} className="text-white" />
                  </div>
                  <div>
                    <div className="text-sm font-semibold text-gray-900">Scouting Report</div>
                    <div className="text-xs text-gray-400">{athlete.first_name} {athlete.last_name} · {category_name}</div>
                  </div>
                </div>
                <div className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap border-l-4 border-[#1A6BFF]/30 pl-4">
                  {data.scouting_report}
                </div>
                <div className="mt-4 pt-4 border-t border-gray-100 text-xs text-gray-400">
                  Generated from evaluator observations using AI analysis
                </div>
              </div>
            ) : (
              <div className="text-center py-12 text-gray-400 text-sm">
                {data.notes?.length ? "Generating scouting report... refresh the page in a moment." : "No evaluator notes available to generate a report."}
              </div>
            )}
          </div>
        )}

        {/* ─── Paywall (shown on locked tabs or below overview) ── */}
        {!purchased && (
          <div className="mt-8">
            <div className="bg-white border-2 border-[#1A6BFF]/20 rounded-2xl p-8 text-center">
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-[#1A6BFF] to-[#4D8FFF] flex items-center justify-center mx-auto mb-4">
                <Lock size={24} className="text-white" />
              </div>
              <h3 className="text-xl font-bold text-gray-900 mb-2">Unlock Full Report</h3>
              <p className="text-sm text-gray-500 mb-6 max-w-md mx-auto">Get the complete evaluation breakdown for {athlete.first_name} including detailed scores, evaluator notes, and an AI-powered scouting report with development suggestions.</p>

              <div className="grid grid-cols-2 gap-3 max-w-sm mx-auto mb-6 text-left">
                {[
                  "Detailed score breakdown",
                  "Per-evaluator scores",
                  "All evaluator notes",
                  "AI scouting report",
                  "Development suggestions",
                  "Downloadable PDF",
                ].map(item => (
                  <div key={item} className="flex items-center gap-2 text-sm text-gray-600">
                    <span className="text-green-500 text-xs">✓</span> {item}
                  </div>
                ))}
              </div>

              <div className="text-3xl font-bold text-gray-900 mb-1">{priceStr}</div>
              <div className="text-xs text-gray-400 mb-6">One-time purchase · Instant access</div>

              <button
                onClick={handleUnlock}
                disabled={unlocking}
                className="px-8 py-3.5 bg-gradient-to-r from-[#1A6BFF] to-[#4D8FFF] text-white rounded-xl font-semibold text-base hover:shadow-xl hover:shadow-blue-500/25 transition-all disabled:opacity-50"
              >
                {unlocking ? "Redirecting to checkout..." : `Unlock Report — ${priceStr}`}
              </button>

              <p className="text-xs text-gray-400 mt-4">Secure payment via Stripe. No account required.</p>
            </div>
          </div>
        )}

        {/* PDF download button (paid only) */}
        {purchased && (
          <div className="mt-8 text-center">
            <a href={`/report/${token}/pdf`} target="_blank"
              className="inline-flex items-center gap-2 px-6 py-3 bg-gray-900 text-white rounded-xl font-semibold text-sm hover:bg-gray-800 transition-colors">
              <Download size={16} /> Download PDF Report
            </a>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="border-t border-gray-200 py-6 mt-8">
        <div className="max-w-3xl mx-auto px-6 flex items-center justify-center gap-3 text-xs text-gray-400">
          <img src="/s-mark-dark.svg" style={{ width: 16, height: 16, objectFit: "contain", opacity: 0.4 }} alt="" />
          <span>Powered by Sideline Star · sidelinestar.com</span>
        </div>
      </div>
    </div>
  );
}
