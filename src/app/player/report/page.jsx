"use client";

import { useState, Suspense, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { ArrowLeft, User, FileText, BarChart3, Zap, Download, Loader } from "lucide-react";

const POSITION_COLORS = {
  forward: "bg-blue-100 text-blue-700",
  defense: "bg-purple-100 text-purple-700",
  goalie: "bg-amber-100 text-amber-700",
};

function percentileLabel(pct) {
  if (pct >= 90) return "Elite";
  if (pct >= 75) return "Above Average";
  if (pct >= 50) return "Average";
  if (pct >= 25) return "Below Average";
  return "Developing";
}

function RankHistoryChart({ history, sessions }) {
  if (!history?.length) return null;
  const max = Math.max(...history);
  const width = 500;
  const height = 160;
  const padX = 40;
  const padY = 20;
  const innerW = width - padX * 2;
  const innerH = height - padY * 2;
  const points = history.map((rank, i) => {
    const x = padX + (i / Math.max(history.length - 1, 1)) * innerW;
    const y = padY + ((rank - 1) / Math.max(max - 1, 1)) * innerH;
    return { x, y, rank };
  });
  const pathD = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full" style={{ maxHeight: 160 }}>
      {/* Grid lines */}
      {[1, 2, 3].map(i => (
        <line key={i} x1={padX} y1={padY + (i / 4) * innerH} x2={width - padX} y2={padY + (i / 4) * innerH}
          stroke="#f3f4f6" strokeWidth="1" />
      ))}
      {/* Area fill */}
      <defs>
        <linearGradient id="rankGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#FF6B35" stopOpacity="0.15" />
          <stop offset="100%" stopColor="#FF6B35" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={`${pathD} L ${points[points.length-1].x} ${height} L ${points[0].x} ${height} Z`}
        fill="url(#rankGrad)" />
      {/* Line */}
      <path d={pathD} fill="none" stroke="#FF6B35" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      {/* Points */}
      {points.map((p, i) => (
        <g key={i}>
          <circle cx={p.x} cy={p.y} r="5" fill="#FF6B35" stroke="white" strokeWidth="2" />
          <text x={p.x} y={p.y - 10} textAnchor="middle" fontSize="11" fill="#FF6B35" fontWeight="600">#{p.rank}</text>
          <text x={p.x} y={height - 4} textAnchor="middle" fontSize="10" fill="#9ca3af">S{i + 1}</text>
        </g>
      ))}
    </svg>
  );
}

function ScoreBar({ value, max = 10, color = "#FF6B35" }) {
  const pct = Math.min(100, (value / max) * 100);
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
        <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: color }} />
      </div>
      <span className="text-xs font-semibold text-gray-700 w-8 text-right">{value?.toFixed(1)}</span>
    </div>
  );
}

function PlayerReportInner() {
  const searchParams = useSearchParams();
  const athleteId = searchParams.get("athlete");
  const catId = searchParams.get("cat");
  const orgId = searchParams.get("org");

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("overview");
  const [aiReport, setAiReport] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (!athleteId || !catId) return;
    fetch(`/api/athletes/${athleteId}/report?cat=${catId}`)
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false); });
  }, [athleteId, catId]);

  const generateAIReport = async () => {
    if (!data?.notes?.length) return;
    setAiLoading(true);
    setAiReport("");

    // Build notes context
    const notesContext = data.notes.map(n =>
      `Session ${n.session_number} — ${n.evaluator_name}: "${n.note_text}"`
    ).join("\n");

    const scoresContext = data.sessions.map(s => {
      const sd = data.ranking?.session_scores?.[s.session_number];
      if (!sd) return null;
      return `Session ${s.session_number} (${s.session_type}): ${sd.normalized_score?.toFixed(1)}/100`;
    }).filter(Boolean).join(", ");

    const prompt = `You are writing an internal scouting report for a hockey evaluation director. 
    
Player: ${data.athlete.first_name} ${data.athlete.last_name}
Position: ${data.athlete.position || "Unknown"}
Category: ${data.category?.name}
Overall Rank: ${data.ranking?.rank} of ${data.total_athletes}
Session Scores: ${scoresContext}

Evaluator Notes:
${notesContext}

Write a concise professional scouting report using the evaluators' observations as your primary source. 
Do not invent assessments not supported by the notes. 
Structure: 
1. Opening sentence identifying the player and their standing
2. Strengths (2-3 sentences drawn from evaluator notes)
3. Areas for development (1-2 sentences, if noted)
4. Overall assessment (1 sentence)

Keep it factual, professional, and grounded in what the evaluators actually observed. Maximum 150 words.`;

    try {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 1000,
          messages: [{ role: "user", content: prompt }],
        }),
      });
      const result = await res.json();
      const text = result.content?.map(c => c.text || "").join("") || "Unable to generate report.";
      setAiReport(text);
    } catch (e) {
      setAiReport("Error generating report. Please try again.");
    }
    setAiLoading(false);
  };

  const exportReport = () => {
    if (!data) return;
    const a = data.athlete;
    const r = data.ranking;
    const lines = [
      `PLAYER REPORT — ${a.first_name} ${a.last_name}`,
      `Category: ${data.category?.name} | Position: ${a.position || "—"} | HC#: ${a.external_id || "—"}`,
      `Overall Rank: ${r?.rank} of ${data.total_athletes} | Total Score: ${r?.weighted_total?.toFixed(1)}/100`,
      ``,
      `SESSION SCORES`,
      ...data.sessions.map(s => {
        const sd = r?.session_scores?.[s.session_number];
        return `Session ${s.session_number} (${s.session_type}): ${sd ? sd.normalized_score?.toFixed(1) + "/100" : "—"}`;
      }),
      ``,
      `EVALUATOR NOTES`,
      ...data.notes.map(n => `S${n.session_number} — ${n.evaluator_name}: ${n.note_text}`),
      ``,
      `AI SCOUTING REPORT`,
      aiReport || "(Not generated)",
    ];
    const blob = new Blob([lines.join("\n")], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const el = document.createElement("a");
    el.href = url;
    el.download = `${a.last_name}_${a.first_name}_report.txt`;
    el.click();
  };

  if (loading) return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-[#FF6B35]" />
    </div>
  );

  if (!data || data.error) return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <p className="text-gray-400">Player not found</p>
    </div>
  );

  const { athlete, sessions, scores, notes, ranking, total_athletes, testing } = data;

  // Calculate inter-rater agreement per session
  const scale = data.category?.scoring_scale || 10;
  const sessionAgreement = {};
  for (const session of sessions) {
    const sessionScores = scores.filter(s => s.session_number === session.session_number);
    if (!sessionScores.length) continue;
    const cats = [...new Set(sessionScores.map(s => s.scoring_category_id))];
    const catAgreements = cats.map(catId => {
      const vals = sessionScores.filter(s => s.scoring_category_id === catId).map(s => parseFloat(s.score));
      if (vals.length < 2) return 100;
      const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
      const sd = Math.sqrt(vals.reduce((s, v) => s + Math.pow(v - mean, 2), 0) / vals.length);
      return Math.max(0, Math.min(100, Math.round((1 - sd / scale) * 100)));
    });
    sessionAgreement[session.session_number] = catAgreements.length
      ? Math.round(catAgreements.reduce((a, b) => a + b, 0) / catAgreements.length)
      : null;
  }
  const overallAgreement = Object.values(sessionAgreement).filter(Boolean).length
    ? Math.round(Object.values(sessionAgreement).filter(Boolean).reduce((a, b) => a + b, 0) / Object.values(sessionAgreement).filter(Boolean).length)
    : null;

  const agreementColor = (pct) => pct >= 95 ? "text-green-600 bg-green-50" : pct >= 80 ? "text-yellow-600 bg-yellow-50" : "text-red-600 bg-red-50";
  const agreementLabel = (pct) => pct >= 95 ? "Strong Consensus" : pct >= 80 ? "General Agreement" : "Mixed Assessments";

  // Build per-session score breakdown
  const sessionBreakdown = sessions.map(s => {
    const sessionScores = scores.filter(sc => sc.session_number === s.session_number);
    const testingEntry = testing.find(t => t.session_number === s.session_number);
    const sd = ranking?.session_scores?.[s.session_number];

    // Group by evaluator
    const byEvaluator = {};
    for (const sc of sessionScores) {
      if (!byEvaluator[sc.evaluator_name]) byEvaluator[sc.evaluator_name] = {};
      byEvaluator[sc.evaluator_name][sc.category_name] = sc.score;
    }

    // Per-category averages
    const catNames = [...new Set(sessionScores.map(sc => sc.category_name))];
    const catAvgs = catNames.map(cat => {
      const catScores = sessionScores.filter(sc => sc.category_name === cat);
      const avg = catScores.reduce((s, sc) => s + parseFloat(sc.score), 0) / catScores.length;
      return { name: cat, avg };
    });

    return { session: s, sd, byEvaluator, catAvgs, testingEntry };
  });

  const percentile = total_athletes > 1
    ? Math.round(((total_athletes - ranking?.rank) / (total_athletes - 1)) * 100)
    : 100;

  const tabs = [
    { id: "overview", label: "Overview", icon: BarChart3 },
    { id: "scores", label: "Score Breakdown", icon: Zap },
    { id: "notes", label: `Notes (${notes.length})`, icon: FileText },
    { id: "scout", label: "Scouting Report", icon: User },
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 shadow-sm">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-3">
              <button onClick={() => window.history.back()}
                className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700">
                <ArrowLeft size={16} /> Back
              </button>
              <div className="w-px h-5 bg-gray-200" />
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#FF6B35] to-[#F7931E] flex items-center justify-center text-white font-bold text-sm">
                  {athlete.first_name[0]}{athlete.last_name[0]}
                </div>
                <div>
                  <h1 className="text-lg font-bold text-gray-900">{athlete.first_name} {athlete.last_name}</h1>
                  <div className="flex items-center gap-2 flex-wrap">
                    {athlete.position && (
                      <span className={`text-xs px-2 py-0.5 rounded font-medium capitalize ${POSITION_COLORS[athlete.position] || "bg-gray-100 text-gray-600"}`}>
                        {athlete.position}
                      </span>
                    )}
                    {athlete.external_id && <span className="text-xs text-gray-400 font-mono">{athlete.external_id}</span>}
                    <span className="text-xs text-gray-400">{data.category?.name}</span>
                  </div>
                </div>
              </div>
            </div>
            <button
              onClick={() => window.open(`/player/report/pdf?athlete=${athleteId}&cat=${catId}`, "_blank")}
              className="inline-flex items-center gap-1.5 px-3 py-2 border border-gray-200 text-gray-600 rounded-lg text-sm font-medium hover:bg-gray-50">
              <Download size={14} /> Export PDF
            </button>
          </div>

          {/* Tabs */}
          <div className="flex gap-1 mt-4 overflow-x-auto">
            {tabs.map(tab => {
              const Icon = tab.icon;
              return (
                <button key={tab.id} onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 whitespace-nowrap transition-colors ${
                    activeTab === tab.id ? "border-[#FF6B35] text-[#FF6B35]" : "border-transparent text-gray-500 hover:text-gray-700"
                  }`}>
                  <Icon size={13} /> {tab.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">

        {/* OVERVIEW TAB */}
        {activeTab === "overview" && (
          <div className="space-y-6">
            {/* Stats row */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[
                { label: "Overall Rank", value: `#${ranking?.rank || "—"}`, sub: `of ${total_athletes}`, color: "text-[#FF6B35]" },
                { label: "Percentile", value: `${percentile}th`, sub: percentileLabel(percentile), color: "text-purple-600" },
                { label: "Total Score", value: ranking?.weighted_total?.toFixed(1) || "—", sub: "out of 100", color: "text-blue-600" },
                { label: "Sessions", value: `${Object.keys(ranking?.session_scores || {}).length}/${sessions.length}`, sub: "completed", color: "text-green-600" },
                ...(overallAgreement !== null ? [{ label: "Evaluator Agreement", value: `${overallAgreement}%`, sub: agreementLabel(overallAgreement), color: overallAgreement >= 95 ? "text-green-600" : overallAgreement >= 80 ? "text-yellow-600" : "text-red-600" }] : []),
              ].map(({ label, value, sub, color }) => (
                <div key={label} className="bg-white border border-gray-200 rounded-xl p-4 text-center">
                  <div className={`text-3xl font-bold ${color}`}>{value}</div>
                  <div className="text-xs text-gray-500 mt-1">{label}</div>
                  <div className="text-xs text-gray-400">{sub}</div>
                </div>
              ))}
            </div>

            {/* Rank history chart */}
            {ranking?.rank_history?.length > 1 && (
              <div className="bg-white border border-gray-200 rounded-xl p-5">
                <h3 className="text-sm font-semibold text-gray-900 mb-4">Rank Progression</h3>
                <p className="text-xs text-gray-400 mb-4">Higher on chart = better rank</p>
                <RankHistoryChart history={ranking.rank_history} sessions={sessions} />
              </div>
            )}

            {/* Session score overview */}
            <div className="bg-white border border-gray-200 rounded-xl p-5">
              <h3 className="text-sm font-semibold text-gray-900 mb-4">Session Performance</h3>
              <div className="space-y-4">
                {sessions.map(s => {
                  const sd = ranking?.session_scores?.[s.session_number];
                  return (
                    <div key={s.session_number}>
                      <div className="flex items-center justify-between mb-1.5">
                        <div className="flex items-center gap-2">
                          <div className={`w-6 h-6 rounded-md flex items-center justify-center text-white text-xs font-bold ${sd ? "bg-gradient-to-br from-[#FF6B35] to-[#F7931E]" : "bg-gray-200"}`}>
                            {s.session_number}
                          </div>
                          <span className="text-sm text-gray-700">{s.name} <span className="text-xs text-gray-400 capitalize">({s.session_type})</span></span>
                        </div>
                        <span className="text-sm font-bold text-gray-900">
                          {sd ? `${sd.normalized_score?.toFixed(1)}/100` : "—"}
                        </span>
                      </div>
                      {sd && (
                        <div className="flex items-center gap-2 ml-8">
                          <div className="flex-1 h-2.5 bg-gray-100 rounded-full overflow-hidden">
                            <div className="h-full rounded-full bg-gradient-to-r from-[#FF6B35] to-[#F7931E]"
                              style={{ width: `${sd.normalized_score}%` }} />
                          </div>
                          <span className="text-xs text-gray-400 w-16 text-right">
                            {sd.source === "testing" ? `rank #${sd.overall_rank}` : `${sd.evaluator_count} eval${sd.evaluator_count > 1 ? "s" : ""}`}
                          </span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* SCORES TAB */}
        {activeTab === "scores" && (
          <div className="space-y-5">
            {sessionBreakdown.map(({ session, sd, byEvaluator, catAvgs, testingEntry }) => (
              <div key={session.session_number} className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                <div className="flex items-center justify-between px-5 py-4 bg-gray-50 border-b border-gray-100">
                  <div className="flex items-center gap-3">
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-white font-bold text-sm ${sd ? "bg-gradient-to-br from-[#FF6B35] to-[#F7931E]" : "bg-gray-300"}`}>
                      {session.session_number}
                    </div>
                    <div>
                      <div className="font-semibold text-gray-900">{session.name}</div>
                      <div className="text-xs text-gray-400 capitalize">{session.session_type} · {session.weight_percentage}% weight</div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-2xl font-bold text-[#FF6B35]">{sd ? `${sd.normalized_score?.toFixed(1)}` : "—"}</div>
                    <div className="text-xs text-gray-400">out of 100</div>
                  </div>
                </div>

                {testingEntry && (
                  <div className="px-5 py-4">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-600">Testing Rank</span>
                      <span className="text-sm font-bold text-gray-900">#{testingEntry.overall_rank} of {total_athletes}</span>
                    </div>
                  </div>
                )}

                {catAvgs.length > 0 && (
                  <div className="px-5 py-4 space-y-4">
                    {/* Category averages */}
                    <div>
                      <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Category Averages</div>
                      <div className="space-y-2.5">
                        {catAvgs.map(({ name, avg }) => (
                          <div key={name}>
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-xs text-gray-600">{name}</span>
                              <span className="text-xs font-semibold text-gray-900">{avg.toFixed(1)}/{scale}</span>
                            </div>
                            <ScoreBar value={avg} max={scale} />
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Per evaluator breakdown */}
                    {Object.keys(byEvaluator).length > 0 && (
                      <div>
                        <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Per Evaluator</div>
                        <div className="space-y-3">
                          {Object.entries(byEvaluator).map(([evalName, cats]) => (
                            <div key={evalName} className="bg-gray-50 rounded-xl p-3">
                              <div className="text-xs font-semibold text-gray-700 mb-2">{evalName}</div>
                              <div className="grid grid-cols-2 gap-2">
                                {Object.entries(cats).map(([cat, score]) => (
                                  <div key={cat} className="flex items-center justify-between">
                                    <span className="text-xs text-gray-500">{cat}</span>
                                    <span className="text-xs font-semibold text-gray-800">{parseFloat(score).toFixed(1)}</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {!testingEntry && catAvgs.length === 0 && (
                  <div className="px-5 py-6 text-center text-sm text-gray-300">No scores entered for this session</div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* NOTES TAB */}
        {activeTab === "notes" && (
          <div className="space-y-4">
            {notes.length === 0 ? (
              <div className="bg-white border border-gray-200 rounded-xl p-12 text-center">
                <FileText size={36} className="mx-auto text-gray-200 mb-3" />
                <p className="text-sm text-gray-400">No evaluator notes recorded for this player</p>
              </div>
            ) : (
              <>
                {sessions.map(s => {
                  const sessionNotes = notes.filter(n => n.session_number === s.session_number);
                  if (!sessionNotes.length) return null;
                  return (
                    <div key={s.session_number} className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                      <div className="flex items-center gap-3 px-5 py-3 bg-gray-50 border-b border-gray-100">
                        <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-[#FF6B35] to-[#F7931E] flex items-center justify-center text-white text-xs font-bold">
                          {s.session_number}
                        </div>
                        <span className="text-sm font-semibold text-gray-700">{s.name} <span className="text-gray-400 font-normal capitalize">· {s.session_type}</span></span>
                      </div>
                      <div className="divide-y divide-gray-50">
                        {sessionNotes.map((n, i) => (
                          <div key={i} className="px-5 py-4">
                            <div className="flex items-center gap-2 mb-2">
                              <div className="w-6 h-6 rounded-full bg-gray-200 flex items-center justify-center text-xs font-bold text-gray-600">
                                {n.evaluator_name.charAt(0)}
                              </div>
                              <span className="text-xs font-semibold text-gray-700">{n.evaluator_name}</span>
                              <span className="text-xs text-gray-300">·</span>
                              <span className="text-xs text-gray-400">{new Date(n.created_at).toLocaleDateString()}</span>
                            </div>
                            <p className="text-sm text-gray-700 leading-relaxed pl-8">{n.note_text}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </>
            )}
          </div>
        )}

        {/* SCOUTING REPORT TAB */}
        {activeTab === "scout" && (
          <div className="space-y-5">
            <div className="bg-white border border-gray-200 rounded-xl p-6">
              <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
                <div>
                  <h3 className="text-base font-semibold text-gray-900">AI Scouting Report</h3>
                  <p className="text-xs text-gray-400 mt-0.5">
                    Generated from {notes.length} evaluator note{notes.length !== 1 ? "s" : ""}. Stays close to what evaluators observed.
                  </p>
                </div>
                <button
                  onClick={generateAIReport}
                  disabled={aiLoading || notes.length === 0}
                  className="inline-flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-[#FF6B35] to-[#F7931E] text-white rounded-xl text-sm font-semibold disabled:opacity-50 hover:shadow-md transition-shadow"
                >
                  {aiLoading ? <Loader size={14} className="animate-spin" /> : <Zap size={14} />}
                  {aiLoading ? "Generating..." : aiReport ? "Regenerate" : "Generate Report"}
                </button>
              </div>

              {notes.length === 0 && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-700">
                  No evaluator notes found. Notes must be entered during scoring sessions before a report can be generated.
                </div>
              )}

              {aiLoading && (
                <div className="flex items-center gap-3 py-8 text-gray-400 justify-center">
                  <Loader size={18} className="animate-spin" />
                  <span className="text-sm">Analyzing evaluator notes...</span>
                </div>
              )}

              {aiReport && !aiLoading && (
                <div className="bg-gradient-to-br from-gray-50 to-white border border-gray-200 rounded-xl p-6">
                  <div className="flex items-center gap-2 mb-4">
                    <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#FF6B35] to-[#F7931E] flex items-center justify-center">
                      <Zap size={14} className="text-white" />
                    </div>
                    <div>
                      <div className="text-sm font-semibold text-gray-900">Scouting Report</div>
                      <div className="text-xs text-gray-400">{athlete.first_name} {athlete.last_name} · {data.category?.name}</div>
                    </div>
                  </div>
                  <div className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap border-l-4 border-[#FF6B35]/30 pl-4">
                    {aiReport}
                  </div>
                  <div className="mt-4 pt-4 border-t border-gray-100 flex items-center justify-between">
                    <span className="text-xs text-gray-400">Based on {notes.length} evaluator observation{notes.length !== 1 ? "s" : ""}</span>
                    <button onClick={exportReport}
                      className="text-xs text-[#FF6B35] hover:underline flex items-center gap-1">
                      <Download size={11} /> Export full report
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Raw notes for reference */}
            {notes.length > 0 && (
              <div className="bg-white border border-gray-200 rounded-xl p-5">
                <h3 className="text-sm font-semibold text-gray-900 mb-4">Source Notes ({notes.length})</h3>
                <div className="space-y-3">
                  {notes.map((n, i) => (
                    <div key={i} className="flex gap-3">
                      <div className="w-6 h-6 rounded-full bg-gray-100 flex items-center justify-center text-xs font-bold text-gray-500 flex-shrink-0 mt-0.5">
                        {n.evaluator_name.charAt(0)}
                      </div>
                      <div>
                        <div className="text-xs text-gray-400 mb-0.5">S{n.session_number} · {n.evaluator_name}</div>
                        <p className="text-sm text-gray-600 leading-relaxed">{n.note_text}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default function PlayerReportPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-gray-50 flex items-center justify-center"><div className="animate-spin rounded-full h-10 w-10 border-b-2 border-[#FF6B35]" /></div>}>
      <PlayerReportInner />
    </Suspense>
  );
}
