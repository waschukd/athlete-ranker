"use client";

import { useState, useMemo, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Search, X, Loader2, Trophy, Users, BarChart3, FileText, ChevronDown, ChevronRight } from "lucide-react";

function StatBar({ value, max = 100, color = "#1A6BFF" }) {
  const pct = Math.min(100, Math.max(0, (value / max) * 100));
  return (
    <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
      <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: color }} />
    </div>
  );
}

function AgreementBadge({ pct }) {
  const color = pct >= 90 ? "text-green-600 bg-green-50" : pct >= 75 ? "text-amber-600 bg-amber-50" : "text-red-600 bg-red-50";
  return <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${color}`}>{pct}%</span>;
}

export default function PlayerComparison({ catId, initialPlayerIds = [], onClose }) {
  const [playerIds, setPlayerIds] = useState(initialPlayerIds);
  const [search, setSearch] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [expandedSections, setExpandedSections] = useState(new Set(["overview", "scores", "evaluators"]));

  // Fetch report data for all selected players in one query
  const [playerData, setPlayerData] = useState({});
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!playerIds.length || !catId) return;
    let cancelled = false;
    setIsLoading(true);
    Promise.all(
      playerIds.filter(id => !playerData[id]).map(async (id) => {
        const res = await fetch(`/api/athletes/${id}/report?cat=${catId}`);
        if (!res.ok) return null;
        const data = await res.json();
        return { id, data };
      })
    ).then(results => {
      if (cancelled) return;
      setPlayerData(prev => {
        const next = { ...prev };
        for (const r of results) if (r) next[r.id] = r.data;
        return next;
      });
      setIsLoading(false);
    });
    return () => { cancelled = true; };
  }, [playerIds, catId]);

  // Clean up removed players from cache
  useEffect(() => {
    setPlayerData(prev => {
      const next = {};
      for (const id of playerIds) if (prev[id]) next[id] = prev[id];
      return next;
    });
  }, [playerIds]);

  const players = playerIds.map(id => playerData[id]).filter(Boolean);

  // Search for athletes to add
  const handleSearch = async (val) => {
    setSearch(val);
    if (val.length < 2) { setSearchResults([]); return; }
    setSearching(true);
    try {
      const res = await fetch(`/api/categories/${catId}/scores?search=${encodeURIComponent(val)}`);
      const data = await res.json();
      // Deduplicate by athlete_id
      const seen = new Set();
      const unique = (data.scores || []).reduce((acc, s) => {
        if (!seen.has(s.athlete_id)) { seen.add(s.athlete_id); acc.push({ id: s.athlete_id, name: `${s.first_name} ${s.last_name}`, jersey: s.jersey_number }); }
        return acc;
      }, []);
      setSearchResults(unique.filter(a => !playerIds.includes(a.id)));
    } catch { setSearchResults([]); }
    setSearching(false);
  };

  const addPlayer = (id) => {
    if (playerIds.length >= 6) return; // max 6 players
    setPlayerIds(prev => [...prev, id]);
    setSearch("");
    setSearchResults([]);
  };

  const removePlayer = (id) => {
    setPlayerIds(prev => prev.filter(p => p !== id));
  };

  const toggleSection = (id) => {
    setExpandedSections(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  // Get all unique scoring categories and sessions across players
  const allCategories = useMemo(() => {
    const catMap = {};
    for (const p of players) {
      for (const s of (p.scores || [])) {
        if (!catMap[s.scoring_category_id]) catMap[s.scoring_category_id] = { id: s.scoring_category_id, name: s.category_name, order: s.display_order };
      }
    }
    return Object.values(catMap).sort((a, b) => a.order - b.order);
  }, [players]);

  const allSessions = useMemo(() => {
    const sessions = new Set();
    for (const p of players) { for (const s of (p.scores || [])) sessions.add(s.session_number); }
    return [...sessions].sort((a, b) => a - b);
  }, [players]);

  // Compute per-player per-category averages
  const getPlayerCategoryAvg = (player, catId) => {
    const scores = (player.scores || []).filter(s => s.scoring_category_id === catId);
    if (!scores.length) return null;
    return Math.round((scores.reduce((sum, s) => sum + parseFloat(s.score), 0) / scores.length) * 10) / 10;
  };

  const scale = players[0]?.category?.scoring_scale || 10;

  return (
    <div className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden">
      {/* Header */}
      <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-gray-900">Player Comparison</h2>
          <p className="text-sm text-gray-500 mt-0.5">Compare {players.length} player{players.length !== 1 ? "s" : ""} side by side</p>
        </div>
        {onClose && <button onClick={onClose} className="p-2 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100"><X size={18} /></button>}
      </div>

      {/* Search to add players */}
      <div className="px-6 py-3 border-b border-gray-100 bg-gray-50">
        <div className="relative max-w-sm">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={e => handleSearch(e.target.value)}
            placeholder="Add player by name or jersey..."
            className="w-full pl-9 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1A6BFF] focus:border-transparent"
          />
          {searching && <Loader2 size={14} className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin text-gray-400" />}
        </div>
        {searchResults.length > 0 && (
          <div className="mt-2 bg-white border border-gray-200 rounded-lg shadow-sm max-h-40 overflow-y-auto">
            {searchResults.map(a => (
              <button key={a.id} onClick={() => addPlayer(a.id)} className="w-full flex items-center gap-3 px-4 py-2 hover:bg-blue-50 text-left text-sm">
                <span className="font-medium text-gray-900">{a.name}</span>
                {a.jersey && <span className="text-xs font-mono text-gray-400">#{a.jersey}</span>}
              </button>
            ))}
          </div>
        )}
        {/* Selected player chips */}
        {playerIds.length > 0 && (
          <div className="flex flex-wrap gap-2 mt-3">
            {players.map(p => (
              <div key={p.athlete.id} className="inline-flex items-center gap-1.5 px-3 py-1 bg-white border border-gray-200 rounded-full text-sm">
                <span className="font-medium text-gray-900">{p.athlete.first_name} {p.athlete.last_name}</span>
                <button onClick={() => removePlayer(p.athlete.id)} className="text-gray-400 hover:text-red-500"><X size={12} /></button>
              </div>
            ))}
          </div>
        )}
      </div>

      {isLoading && <div className="py-16 text-center"><Loader2 size={24} className="animate-spin mx-auto text-gray-400" /></div>}

      {players.length >= 2 && !isLoading && (
        <div className="divide-y divide-gray-100">

          {/* ─── Overview ──────────────────────────────────── */}
          <div>
            <button onClick={() => toggleSection("overview")} className="w-full flex items-center gap-2 px-6 py-3 text-left hover:bg-gray-50">
              {expandedSections.has("overview") ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              <BarChart3 size={14} className="text-[#1A6BFF]" />
              <span className="text-sm font-semibold text-gray-900">Overview</span>
            </button>
            {expandedSections.has("overview") && (
              <div className="px-6 pb-5 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100">
                      <th className="text-left py-2 pr-4 text-xs text-gray-400 font-medium w-32"></th>
                      {players.map(p => <th key={p.athlete.id} className="text-center py-2 px-3 text-xs font-semibold text-gray-900 min-w-[120px]">{p.athlete.first_name} {p.athlete.last_name}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="border-b border-gray-50">
                      <td className="py-2.5 pr-4 text-xs text-gray-500 font-medium">Rank</td>
                      {players.map(p => <td key={p.athlete.id} className="text-center py-2.5 px-3 text-lg font-bold text-gray-900">#{p.ranking?.rank || "—"}</td>)}
                    </tr>
                    <tr className="border-b border-gray-50">
                      <td className="py-2.5 pr-4 text-xs text-gray-500 font-medium">Total Score</td>
                      {players.map(p => <td key={p.athlete.id} className="text-center py-2.5 px-3 font-semibold text-[#1A6BFF]">{p.ranking?.weighted_total?.toFixed(1) || "—"}</td>)}
                    </tr>
                    <tr className="border-b border-gray-50">
                      <td className="py-2.5 pr-4 text-xs text-gray-500 font-medium">Position</td>
                      {players.map(p => <td key={p.athlete.id} className="text-center py-2.5 px-3 text-xs text-gray-600">{p.athlete.position || "—"}</td>)}
                    </tr>
                    <tr>
                      <td className="py-2.5 pr-4 text-xs text-gray-500 font-medium">Agreement</td>
                      {players.map(p => <td key={p.athlete.id} className="text-center py-2.5 px-3"><AgreementBadge pct={p.ranking?.agreement_pct || 0} /></td>)}
                    </tr>
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* ─── Category Averages ──────────────────────────── */}
          <div>
            <button onClick={() => toggleSection("scores")} className="w-full flex items-center gap-2 px-6 py-3 text-left hover:bg-gray-50">
              {expandedSections.has("scores") ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              <Trophy size={14} className="text-amber-500" />
              <span className="text-sm font-semibold text-gray-900">Category Averages</span>
            </button>
            {expandedSections.has("scores") && (
              <div className="px-6 pb-5 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100">
                      <th className="text-left py-2 pr-4 text-xs text-gray-400 font-medium w-32">Category</th>
                      {players.map(p => <th key={p.athlete.id} className="text-center py-2 px-3 text-xs font-semibold text-gray-900 min-w-[120px]">{p.athlete.first_name} {p.athlete.last_name}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {allCategories.map(cat => {
                      const values = players.map(p => getPlayerCategoryAvg(p, cat.id));
                      const best = Math.max(...values.filter(v => v !== null));
                      return (
                        <tr key={cat.id} className="border-b border-gray-50">
                          <td className="py-2.5 pr-4 text-xs text-gray-500 font-medium">{cat.name}</td>
                          {values.map((val, i) => (
                            <td key={players[i].athlete.id} className="text-center py-2.5 px-3">
                              {val !== null ? (
                                <div>
                                  <span className={`font-mono font-semibold text-sm ${val === best ? "text-green-600" : "text-gray-900"}`}>{val}</span>
                                  <StatBar value={val} max={scale} color={val === best ? "#22c55e" : "#1A6BFF"} />
                                </div>
                              ) : <span className="text-gray-300">—</span>}
                            </td>
                          ))}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* ─── Per-Evaluator Breakdown ──────────────────── */}
          <div>
            <button onClick={() => toggleSection("evaluators")} className="w-full flex items-center gap-2 px-6 py-3 text-left hover:bg-gray-50">
              {expandedSections.has("evaluators") ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              <Users size={14} className="text-purple-500" />
              <span className="text-sm font-semibold text-gray-900">Per-Evaluator Breakdown</span>
            </button>
            {expandedSections.has("evaluators") && (
              <div className="px-6 pb-5 space-y-4">
                {allSessions.map(sessionNum => (
                  <div key={sessionNum}>
                    <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Session {sessionNum}</div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm border border-gray-100 rounded-lg">
                        <thead>
                          <tr className="bg-gray-50 border-b border-gray-100">
                            <th className="text-left py-2 px-3 text-xs text-gray-400 font-medium">Evaluator</th>
                            {players.map(p => (
                              <th key={p.athlete.id} colSpan={allCategories.length} className="text-center py-2 px-2 text-xs font-semibold text-gray-900 border-l border-gray-100">
                                {p.athlete.first_name} {p.athlete.last_name}
                              </th>
                            ))}
                          </tr>
                          <tr className="bg-gray-50/50 border-b border-gray-100">
                            <th className="py-1 px-3"></th>
                            {players.map(p => allCategories.map(cat => (
                              <th key={`${p.athlete.id}-${cat.id}`} className="text-center py-1 px-1 text-[10px] text-gray-400 font-medium border-l border-gray-50 first:border-l-gray-100">{cat.name.split(" ")[0]}</th>
                            )))}
                          </tr>
                        </thead>
                        <tbody>
                          {(() => {
                            // Get all evaluators for this session across all players
                            const evalMap = {};
                            for (const p of players) {
                              for (const s of (p.scores || []).filter(s => s.session_number === sessionNum)) {
                                if (!evalMap[s.evaluator_id]) evalMap[s.evaluator_id] = { name: s.evaluator_name, id: s.evaluator_id };
                              }
                            }
                            return Object.values(evalMap).map(ev => (
                              <tr key={ev.id} className="border-b border-gray-50 last:border-0">
                                <td className="py-2 px-3 text-xs text-gray-600 font-medium whitespace-nowrap">{ev.name}</td>
                                {players.map(p => allCategories.map(cat => {
                                  const score = (p.scores || []).find(s => s.session_number === sessionNum && s.evaluator_id === ev.id && s.scoring_category_id === cat.id);
                                  return (
                                    <td key={`${p.athlete.id}-${cat.id}`} className="text-center py-2 px-1 text-xs font-mono border-l border-gray-50 first:border-l-gray-100">
                                      {score ? <span className="text-gray-900">{parseFloat(score.score)}</span> : <span className="text-gray-200">—</span>}
                                    </td>
                                  );
                                }))}
                              </tr>
                            ));
                          })()}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* ─── Notes ───────────────────────────────────── */}
          <div>
            <button onClick={() => toggleSection("notes")} className="w-full flex items-center gap-2 px-6 py-3 text-left hover:bg-gray-50">
              {expandedSections.has("notes") ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              <FileText size={14} className="text-green-500" />
              <span className="text-sm font-semibold text-gray-900">Evaluator Notes</span>
            </button>
            {expandedSections.has("notes") && (
              <div className="px-6 pb-5 overflow-x-auto">
                <div className="grid gap-6" style={{ gridTemplateColumns: `repeat(${players.length}, minmax(200px, 1fr))` }}>
                  {players.map(p => (
                    <div key={p.athlete.id}>
                      <div className="text-xs font-semibold text-gray-900 mb-2">{p.athlete.first_name} {p.athlete.last_name}</div>
                      {(p.notes || []).length > 0 ? (
                        <div className="space-y-2">
                          {p.notes.map((n, i) => (
                            <div key={i} className="bg-gray-50 rounded-lg p-3">
                              <div className="text-[10px] text-gray-400 mb-1">S{n.session_number} · {n.evaluator_name}</div>
                              <div className="text-xs text-gray-700 leading-relaxed">{n.note_text}</div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="text-xs text-gray-300 italic">No notes</div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

        </div>
      )}

      {players.length < 2 && !isLoading && (
        <div className="py-16 text-center text-gray-400 text-sm">
          Add at least 2 players to compare
        </div>
      )}
    </div>
  );
}
