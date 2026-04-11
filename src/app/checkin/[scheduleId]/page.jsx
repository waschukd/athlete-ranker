"use client";

import { useState, Suspense } from "react";
import { useParams } from "next/navigation";
import { useQuery, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Check, Search, Users, Clock, MapPin, RefreshCw, AlertCircle, X } from "lucide-react";

const qc = new QueryClient();

function formatTime(t) {
  if (!t) return "";
  const [h, m] = t.toString().split(":");
  const hr = parseInt(h);
  return `${hr > 12 ? hr - 12 : hr}:${m} ${hr >= 12 ? "PM" : "AM"}`;
}

function CheckinPageInner() {
  const params = useParams();
  const scheduleId = params.scheduleId;

  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("unchecked");
  const [showAddPlayer, setShowAddPlayer] = useState(false);
  const [addForm, setAddForm] = useState({ first_name: "", last_name: "", jersey_number: "", team_color: "White" });
  const [addLoading, setAddLoading] = useState(false);
  // Inline jersey editing
  const [editingJersey, setEditingJersey] = useState(null); // athlete id
  const [jerseyVal, setJerseyVal] = useState("");

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["checkin", scheduleId],
    queryFn: async () => {
      const res = await fetch(`/api/checkin/${scheduleId}`);
      if (!res.ok) throw new Error("Not found");
      return res.json();
    },
    refetchInterval: 15000,
  });

  const doAction = async (action, body = {}) => {
    await fetch(`/api/checkin/${scheduleId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, ...body }),
    });
    refetch();
  };

  const quickCheckin = async (athlete) => {
    // Use the edited jersey value if this athlete's jersey was just edited
    const jersey = editingJersey === athlete.id && jerseyVal
      ? parseInt(jerseyVal)
      : (athlete.jersey_number || null);
    if (editingJersey === athlete.id) setEditingJersey(null);
    await doAction("checkin", {
      athlete_id: athlete.id,
      jersey_number: jersey,
      team_color: athlete.team_color || "White",
    });
  };

  const athletes = data?.athletes || [];
  const summary = data?.summary || {};
  const schedule = data?.schedule || {};
  const teamColors = data?.checkinSession?.team_colors || ["White", "Dark"];

  const filtered = athletes.filter(a => {
    const matchSearch = !search ||
      `${a.first_name} ${a.last_name}`.toLowerCase().includes(search.toLowerCase()) ||
      (a.external_id || "").toLowerCase().includes(search.toLowerCase()) ||
      (a.jersey_number?.toString() || "").includes(search);
    const matchFilter =
      filter === "all" ||
      (filter === "checked" && a.checked_in) ||
      (filter === "unchecked" && !a.checked_in);
    return matchSearch && matchFilter;
  });

  const pct = summary.total > 0 ? Math.round((summary.checked_in / summary.total) * 100) : 0;

  if (isLoading) return (
    <div className="min-h-screen bg-gray-900 flex items-center justify-center">
      <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-[#1A6BFF]" />
    </div>
  );

  if (!data?.schedule) return (
    <div className="min-h-screen bg-gray-900 flex items-center justify-center text-white">
      <div className="text-center">
        <AlertCircle size={40} className="mx-auto mb-3 text-red-400" />
        <p className="text-lg font-semibold">Session not found</p>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      {/* Compact Header */}
      <div className="bg-gray-800 border-b border-gray-700 px-4 py-3 sticky top-0 z-10">
        <div className="max-w-2xl mx-auto">
          <div className="flex items-center justify-between mb-2">
            <div>
              <div className="font-bold text-white text-sm">{schedule.org_name} · {schedule.category_name}</div>
              <div className="flex items-center gap-2 text-xs text-gray-400 mt-0.5">
                <span>S{schedule.session_number} · G{schedule.group_number || 1}</span>
                {schedule.start_time && <span><Clock size={10} className="inline mr-0.5" />{formatTime(schedule.start_time)}{schedule.end_time ? ` – ${formatTime(schedule.end_time)}` : ""}</span>}
                {schedule.location && <span><MapPin size={10} className="inline mr-0.5" />{schedule.location}</span>}
              </div>
            </div>
            <div className="flex items-center gap-1.5">
              <button onClick={() => setShowAddPlayer(!showAddPlayer)} className="px-2.5 py-1.5 bg-green-600 text-white rounded-lg text-xs font-semibold hover:bg-green-700">+ Add</button>
              <button onClick={() => refetch()} className="p-1.5 text-gray-400 hover:text-white rounded-lg hover:bg-gray-700"><RefreshCw size={14} /></button>
            </div>
          </div>

          {/* Progress + counts */}
          <div className="flex items-center gap-3 mb-2">
            <div className="flex-1 h-2 bg-gray-700 rounded-full overflow-hidden">
              <div className="h-full bg-gradient-to-r from-green-500 to-green-400 rounded-full transition-all" style={{ width: `${pct}%` }} />
            </div>
            <span className="text-xs font-bold text-white">{summary.checked_in}/{summary.total}</span>
            <span className="text-xs text-gray-500">L:{athletes.filter(a => a.team_color === "White" && a.checked_in).length}/{athletes.filter(a => a.team_color === "White").length}</span>
            <span className="text-xs text-gray-500">D:{athletes.filter(a => a.team_color === "Dark" && a.checked_in).length}/{athletes.filter(a => a.team_color === "Dark").length}</span>
          </div>

          {/* Search + filter (Out first) */}
          <div className="flex gap-2">
            <div className="flex-1 flex items-center gap-2 bg-gray-700 rounded-lg px-3 py-2">
              <Search size={13} className="text-gray-400 flex-shrink-0" />
              <input value={search} onChange={e => setSearch(e.target.value)}
                placeholder="Search..."
                className="flex-1 bg-transparent text-white text-sm outline-none placeholder-gray-500" />
              {search && <button onClick={() => setSearch("")} className="text-gray-500"><X size={12} /></button>}
            </div>
            <div className="flex bg-gray-700 rounded-lg overflow-hidden">
              {[
                { id: "unchecked", label: "Out" },
                { id: "checked", label: "In" },
                { id: "all", label: "All" },
              ].map(f => (
                <button key={f.id} onClick={() => setFilter(f.id)}
                  className={`px-3 py-2 text-xs font-semibold transition-colors ${filter === f.id ? "bg-[#1A6BFF] text-white" : "text-gray-400 hover:text-white"}`}>
                  {f.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Add Player Inline */}
      {showAddPlayer && (
        <div className="max-w-2xl mx-auto px-4 pt-3">
          <div className="flex items-center gap-2 bg-green-900/30 border border-green-700/50 rounded-lg px-3 py-2">
            <input value={addForm.first_name} onChange={e => setAddForm(f => ({ ...f, first_name: e.target.value }))}
              placeholder="First *" className="w-24 bg-gray-700 rounded px-2 py-1.5 text-sm text-white focus:outline-none" autoFocus />
            <input value={addForm.last_name} onChange={e => setAddForm(f => ({ ...f, last_name: e.target.value }))}
              placeholder="Last *" className="w-24 bg-gray-700 rounded px-2 py-1.5 text-sm text-white focus:outline-none" />
            <input value={addForm.jersey_number} onChange={e => setAddForm(f => ({ ...f, jersey_number: e.target.value }))}
              placeholder="#" type="number" className="w-14 bg-gray-700 rounded px-2 py-1.5 text-sm text-white text-center focus:outline-none" />
            <button onClick={() => setAddForm(f => ({ ...f, team_color: f.team_color === "White" ? "Dark" : "White" }))}
              className={`px-2 py-1.5 rounded text-xs font-bold ${addForm.team_color === "Dark" ? "bg-gray-700 text-white" : "bg-white text-gray-900"}`}>
              {addForm.team_color === "Dark" ? "D" : "L"}
            </button>
            <button
              onClick={async () => {
                if (!addForm.first_name || !addForm.last_name) return;
                setAddLoading(true);
                await doAction("add_player", { ...addForm, jersey_number: parseInt(addForm.jersey_number) || null });
                setAddForm({ first_name: "", last_name: "", jersey_number: "", team_color: "White" });
                setAddLoading(false);
              }}
              disabled={!addForm.first_name || !addForm.last_name || addLoading}
              className="px-3 py-1.5 bg-green-600 text-white rounded text-xs font-semibold disabled:opacity-40">
              {addLoading ? "..." : "Add"}
            </button>
            <button onClick={() => setShowAddPlayer(false)} className="text-gray-500 hover:text-white"><X size={14} /></button>
          </div>
        </div>
      )}

      {/* Player list — compact single-line rows */}
      <div className="max-w-2xl mx-auto px-4 py-3">
        {filtered.length === 0 && (
          <div className="py-12 text-center text-gray-500">
            <p className="text-sm">{filter === "unchecked" ? "Everyone's checked in!" : "No players found"}</p>
          </div>
        )}

        <div className="space-y-1">
          {filtered.map(a => (
            <div key={a.id} className={`flex items-center gap-3 rounded-lg px-3 py-2 transition-all ${
              a.checked_in ? "bg-green-900/20 border border-green-800/30" : "bg-gray-800 border border-gray-700/50"
            }`}>
              {/* Name */}
              <span className="text-sm text-white truncate" style={{ minWidth: 0, flex: "1 1 0" }}>{a.last_name}, {a.first_name}</span>

              {/* Jersey # — tap to edit, stays open until check-in or blur */}
              {editingJersey === a.id ? (
                <input type="number" value={jerseyVal} onChange={e => setJerseyVal(e.target.value)}
                  onBlur={() => {
                    // Save jersey on blur, but only if not checking in (quickCheckin handles it)
                    if (jerseyVal && parseInt(jerseyVal) !== a.jersey_number) {
                      doAction("update_jersey", { athlete_id: a.id, jersey_number: parseInt(jerseyVal) });
                    }
                    setTimeout(() => setEditingJersey(null), 200); // delay so "In" button can grab the value
                  }}
                  onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); quickCheckin(a); } }}
                  className="w-14 bg-gray-700 border border-[#1A6BFF] rounded px-1 py-1 text-xs text-white text-center focus:outline-none" autoFocus />
              ) : (
                <button onClick={() => { setEditingJersey(a.id); setJerseyVal(a.jersey_number?.toString() || ""); }}
                  className="w-10 text-center text-xs font-mono text-gray-400 hover:text-white rounded py-1">
                  {a.jersey_number || "# "}
                </button>
              )}

              {/* W / D toggle */}
              <button onClick={() => doAction("move_team", { athlete_id: a.id, team_color: a.team_color === "White" ? "Dark" : "White" })}
                className={`w-7 h-7 rounded text-xs font-bold ${a.team_color === "Dark" ? "bg-gray-600 text-white" : "bg-white text-gray-900"}`}>
                {a.team_color === "Dark" ? "D" : "L"}
              </button>

              {/* Check in / undo */}
              {a.checked_in ? (
                <button onClick={() => doAction("undo_checkin", { athlete_id: a.id })}
                  className="px-3 py-1.5 bg-green-800/50 text-green-400 rounded text-xs font-semibold">✓</button>
              ) : (
                <button onClick={() => quickCheckin(a)}
                  className="px-3 py-1.5 bg-[#1A6BFF] text-white rounded text-xs font-semibold">In</button>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function CheckinPage() {
  return (
    <QueryClientProvider client={qc}>
      <Suspense fallback={<div className="min-h-screen bg-gray-900 flex items-center justify-center"><div className="animate-spin rounded-full h-10 w-10 border-b-2 border-[#1A6BFF]" /></div>}>
        <CheckinPageInner />
      </Suspense>
    </QueryClientProvider>
  );
}
