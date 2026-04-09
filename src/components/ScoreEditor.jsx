"use client";

import { useState, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Search, Edit3, History, ChevronDown, ChevronRight, Check, X, Loader2, AlertCircle } from "lucide-react";

export default function ScoreEditor({ catId, canEdit }) {
  const [subTab, setSubTab] = useState("edit");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [expanded, setExpanded] = useState(new Set());
  const [editing, setEditing] = useState(null); // { athleteId, evaluatorId, scoringCatId, session }
  const [editValue, setEditValue] = useState("");
  const [editReason, setEditReason] = useState("");
  const queryClient = useQueryClient();

  // Debounced search
  const handleSearch = useCallback((val) => {
    setSearch(val);
    clearTimeout(window._scoreSearchTimer);
    window._scoreSearchTimer = setTimeout(() => setDebouncedSearch(val), 400);
  }, []);

  // ── Edit Sub-Tab Data ─────────────────────────────────────
  const { data: searchData, isLoading: searchLoading } = useQuery({
    queryKey: ["score-search", catId, debouncedSearch],
    queryFn: async () => {
      const res = await fetch(`/api/categories/${catId}/scores?search=${encodeURIComponent(debouncedSearch)}`);
      if (!res.ok) throw new Error("Failed to search");
      return res.json();
    },
    enabled: debouncedSearch.length >= 2,
  });

  // Group search results by athlete, then session, then evaluator
  const athletes = (() => {
    if (!searchData?.scores?.length) return [];
    const map = {};
    for (const row of searchData.scores) {
      const key = row.athlete_id;
      if (!map[key]) {
        map[key] = {
          id: row.athlete_id,
          name: `${row.first_name} ${row.last_name}`,
          jersey: row.jersey_number,
          sessions: {},
        };
      }
      const sKey = row.session_number;
      if (!map[key].sessions[sKey]) map[key].sessions[sKey] = {};
      const eKey = row.evaluator_id;
      if (!map[key].sessions[sKey][eKey]) {
        map[key].sessions[sKey][eKey] = { evaluator_name: row.evaluator_name, evaluator_id: row.evaluator_id, scores: {} };
      }
      map[key].sessions[sKey][eKey].scores[row.scoring_category_id] = {
        score: parseFloat(row.score),
        category_name: row.category_name,
      };
    }
    return Object.values(map);
  })();

  const scoringCats = searchData?.scoringCategories || [];

  // ── Score Edit Mutation ────────────────────────────────────
  const editMutation = useMutation({
    mutationFn: async ({ athlete_id, evaluator_id, scoring_category_id, session_number, new_score, reason }) => {
      const res = await fetch(`/api/categories/${catId}/scores`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ athlete_id, evaluator_id, scoring_category_id, session_number, new_score: parseFloat(new_score), reason }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to update");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries(["score-search", catId]);
      queryClient.invalidateQueries(["category-rankings", catId]);
      queryClient.invalidateQueries(["score-audit", catId]);
      setEditing(null);
      setEditValue("");
      setEditReason("");
    },
  });

  // ── Audit Sub-Tab Data ─────────────────────────────────────
  const [auditOffset, setAuditOffset] = useState(0);
  const { data: auditData, isLoading: auditLoading } = useQuery({
    queryKey: ["score-audit", catId, auditOffset],
    queryFn: async () => {
      const res = await fetch(`/api/categories/${catId}/audit?limit=50&offset=${auditOffset}`);
      if (!res.ok) throw new Error("Failed to load audit log");
      return res.json();
    },
    enabled: subTab === "audit",
  });

  const toggleExpand = (id) => {
    setExpanded(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const startEdit = (athleteId, evaluatorId, scoringCatId, session, currentScore) => {
    setEditing({ athleteId, evaluatorId, scoringCatId, session });
    setEditValue(currentScore.toString());
    setEditReason("");
  };

  const cancelEdit = () => {
    setEditing(null);
    setEditValue("");
    setEditReason("");
  };

  const saveEdit = () => {
    if (!editing) return;
    editMutation.mutate({
      athlete_id: editing.athleteId,
      evaluator_id: editing.evaluatorId,
      scoring_category_id: editing.scoringCatId,
      session_number: editing.session,
      new_score: editValue,
      reason: editReason,
    });
  };

  const isEditing = (athleteId, evaluatorId, scoringCatId, session) =>
    editing?.athleteId === athleteId && editing?.evaluatorId === evaluatorId &&
    editing?.scoringCatId === scoringCatId && editing?.session === session;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
      {/* Sub-tab toggle */}
      <div className="flex gap-2 mb-6">
        <button
          onClick={() => setSubTab("edit")}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            subTab === "edit" ? "bg-[#1A6BFF] text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
          }`}
        >
          <Edit3 size={14} /> Edit Scores
        </button>
        <button
          onClick={() => setSubTab("audit")}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            subTab === "audit" ? "bg-[#1A6BFF] text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
          }`}
        >
          <History size={14} /> Audit Trail
        </button>
      </div>

      {/* ─── Edit Sub-Tab ──────────────────────────────────── */}
      {subTab === "edit" && (
        <div>
          {/* Search */}
          <div className="relative mb-6 max-w-md">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={search}
              onChange={e => handleSearch(e.target.value)}
              placeholder="Search athlete by name or jersey number..."
              className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1A6BFF] focus:border-transparent"
            />
          </div>

          {editMutation.isError && (
            <div className="flex items-center gap-2 mb-4 px-4 py-2 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
              <AlertCircle size={14} /> {editMutation.error?.message || "Failed to save"}
            </div>
          )}

          {debouncedSearch.length < 2 ? (
            <div className="text-center py-16 text-gray-400 text-sm">Type at least 2 characters to search</div>
          ) : searchLoading ? (
            <div className="text-center py-16"><Loader2 size={24} className="animate-spin mx-auto text-gray-400" /></div>
          ) : athletes.length === 0 ? (
            <div className="text-center py-16 text-gray-400 text-sm">No athletes found for &ldquo;{debouncedSearch}&rdquo;</div>
          ) : (
            <div className="space-y-3">
              {athletes.map(athlete => (
                <div key={athlete.id} className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                  {/* Athlete header */}
                  <button
                    onClick={() => toggleExpand(athlete.id)}
                    className="w-full flex items-center gap-3 px-5 py-3.5 hover:bg-gray-50 transition-colors text-left"
                  >
                    {expanded.has(athlete.id) ? <ChevronDown size={16} className="text-gray-400" /> : <ChevronRight size={16} className="text-gray-400" />}
                    <span className="text-sm font-semibold text-gray-900">{athlete.name}</span>
                    {athlete.jersey && <span className="text-xs font-mono bg-gray-100 text-gray-600 px-2 py-0.5 rounded">#{athlete.jersey}</span>}
                    <span className="text-xs text-gray-400 ml-auto">{Object.keys(athlete.sessions).length} session(s)</span>
                  </button>

                  {/* Expanded: per-session, per-evaluator scores */}
                  {expanded.has(athlete.id) && (
                    <div className="border-t border-gray-100 px-5 py-4">
                      {Object.entries(athlete.sessions).map(([sessionNum, evaluators]) => (
                        <div key={sessionNum} className="mb-5 last:mb-0">
                          <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Session {sessionNum}</div>
                          <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                              <thead>
                                <tr className="border-b border-gray-100">
                                  <th className="text-left py-2 pr-4 text-xs text-gray-400 font-medium">Evaluator</th>
                                  {scoringCats.map(cat => (
                                    <th key={cat.id} className="text-center py-2 px-2 text-xs text-gray-400 font-medium min-w-[70px]">{cat.name}</th>
                                  ))}
                                </tr>
                              </thead>
                              <tbody>
                                {Object.values(evaluators).map(ev => (
                                  <tr key={ev.evaluator_id} className="border-b border-gray-50 last:border-0">
                                    <td className="py-2.5 pr-4 text-xs text-gray-700 font-medium whitespace-nowrap">{ev.evaluator_name}</td>
                                    {scoringCats.map(cat => {
                                      const scoreData = ev.scores[cat.id];
                                      const isActive = isEditing(athlete.id, ev.evaluator_id, cat.id, parseInt(sessionNum));
                                      return (
                                        <td key={cat.id} className="text-center py-2.5 px-2">
                                          {isActive ? (
                                            <div className="flex flex-col items-center gap-1">
                                              <input
                                                type="number"
                                                value={editValue}
                                                onChange={e => setEditValue(e.target.value)}
                                                step="0.5"
                                                min="0"
                                                max="10"
                                                className="w-16 px-2 py-1 text-center text-sm border border-[#1A6BFF] rounded-lg focus:outline-none focus:ring-1 focus:ring-[#1A6BFF]"
                                                autoFocus
                                                onKeyDown={e => { if (e.key === "Enter") saveEdit(); if (e.key === "Escape") cancelEdit(); }}
                                              />
                                              <input
                                                type="text"
                                                value={editReason}
                                                onChange={e => setEditReason(e.target.value)}
                                                placeholder="Reason..."
                                                className="w-24 px-2 py-0.5 text-xs border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-[#1A6BFF]"
                                              />
                                              <div className="flex gap-1">
                                                <button onClick={saveEdit} disabled={editMutation.isPending} className="p-1 bg-green-50 text-green-600 rounded hover:bg-green-100">
                                                  {editMutation.isPending ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
                                                </button>
                                                <button onClick={cancelEdit} className="p-1 bg-gray-50 text-gray-400 rounded hover:bg-gray-100">
                                                  <X size={12} />
                                                </button>
                                              </div>
                                            </div>
                                          ) : scoreData ? (
                                            <button
                                              onClick={() => canEdit && startEdit(athlete.id, ev.evaluator_id, cat.id, parseInt(sessionNum), scoreData.score)}
                                              className={`px-2.5 py-1 rounded-lg text-sm font-mono font-semibold transition-colors ${
                                                canEdit ? "hover:bg-blue-50 hover:text-[#1A6BFF] cursor-pointer" : "cursor-default"
                                              } text-gray-900 bg-gray-50`}
                                              title={canEdit ? "Click to edit" : ""}
                                            >
                                              {scoreData.score}
                                            </button>
                                          ) : (
                                            <span className="text-gray-300">—</span>
                                          )}
                                        </td>
                                      );
                                    })}
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ─── Audit Sub-Tab ──────────────────────────────────── */}
      {subTab === "audit" && (
        <div>
          {auditLoading ? (
            <div className="text-center py-16"><Loader2 size={24} className="animate-spin mx-auto text-gray-400" /></div>
          ) : !auditData?.entries?.length ? (
            <div className="text-center py-16 text-gray-400 text-sm">No audit entries yet</div>
          ) : (
            <>
              <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-gray-50 border-b border-gray-200">
                        <th className="text-left py-3 px-4 text-xs text-gray-500 font-medium">Date/Time</th>
                        <th className="text-left py-3 px-4 text-xs text-gray-500 font-medium">Editor</th>
                        <th className="text-left py-3 px-4 text-xs text-gray-500 font-medium">Athlete</th>
                        <th className="text-left py-3 px-4 text-xs text-gray-500 font-medium">Evaluator</th>
                        <th className="text-left py-3 px-4 text-xs text-gray-500 font-medium">Category</th>
                        <th className="text-center py-3 px-4 text-xs text-gray-500 font-medium">Old</th>
                        <th className="text-center py-3 px-4 text-xs text-gray-500 font-medium">New</th>
                        <th className="text-left py-3 px-4 text-xs text-gray-500 font-medium">Reason</th>
                      </tr>
                    </thead>
                    <tbody>
                      {auditData.entries.map((entry, i) => {
                        const notes = (() => { try { return JSON.parse(entry.notes || "{}"); } catch { return {}; } })();
                        const isOverride = entry.action === "score_override";
                        return (
                          <tr key={entry.id || i} className={`border-b border-gray-100 last:border-0 ${isOverride ? "bg-amber-50/50" : ""}`}>
                            <td className="py-3 px-4 text-xs text-gray-500 whitespace-nowrap">
                              {new Date(entry.created_at).toLocaleDateString()} {new Date(entry.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                            </td>
                            <td className="py-3 px-4 text-xs font-medium text-gray-900">{entry.editor_name || "System"}</td>
                            <td className="py-3 px-4 text-xs text-gray-700">
                              {entry.athlete_first_name ? `${entry.athlete_first_name} ${entry.athlete_last_name}` : `ID: ${entry.entity_id}`}
                            </td>
                            <td className="py-3 px-4 text-xs text-gray-500">{notes.evaluator_name || "—"}</td>
                            <td className="py-3 px-4 text-xs text-gray-500">{entry.field_changed || "—"}</td>
                            <td className="py-3 px-4 text-center">
                              {entry.old_value && <span className="px-2 py-0.5 bg-red-50 text-red-600 rounded text-xs font-mono">{entry.old_value}</span>}
                            </td>
                            <td className="py-3 px-4 text-center">
                              {entry.new_value && <span className="px-2 py-0.5 bg-green-50 text-green-600 rounded text-xs font-mono">{entry.new_value}</span>}
                            </td>
                            <td className="py-3 px-4 text-xs text-gray-500 max-w-[200px] truncate">{notes.reason || entry.action?.replace(/_/g, " ")}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Pagination */}
              {auditData.total > auditData.limit && (
                <div className="flex items-center justify-between mt-4 text-sm text-gray-500">
                  <span>Showing {auditOffset + 1}–{Math.min(auditOffset + auditData.limit, auditData.total)} of {auditData.total}</span>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setAuditOffset(Math.max(0, auditOffset - 50))}
                      disabled={auditOffset === 0}
                      className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm disabled:opacity-40 hover:bg-gray-50"
                    >
                      Previous
                    </button>
                    <button
                      onClick={() => setAuditOffset(auditOffset + 50)}
                      disabled={auditOffset + 50 >= auditData.total}
                      className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm disabled:opacity-40 hover:bg-gray-50"
                    >
                      Next
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
