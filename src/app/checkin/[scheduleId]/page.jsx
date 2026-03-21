"use client";

import { useState, Suspense } from "react";
import { useParams } from "next/navigation";
import { useQuery, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Check, Search, Users, Clock, MapPin, RefreshCw, ChevronRight, AlertCircle } from "lucide-react";

const qc = new QueryClient();

const COLOR_STYLES = {
  White: { bg: "bg-white border-2 border-gray-300", text: "text-gray-800", label: "White" },
  Dark: { bg: "bg-gray-800", text: "text-white", label: "Dark" },
  PENDING: { bg: "bg-yellow-100 border-2 border-yellow-400", text: "text-yellow-800", label: "?" },
};

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
  const [editingAthlete, setEditingAthlete] = useState(null);
  const [jerseyInput, setJerseyInput] = useState("");
  const [colorInput, setColorInput] = useState("");
  const [filter, setFilter] = useState("all"); // all, checked, unchecked

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

  const openEdit = (athlete) => {
    setEditingAthlete(athlete);
    setJerseyInput(athlete.jersey_number?.toString() || "");
    setColorInput(athlete.team_color || "White");
  };

  const submitCheckin = async () => {
    await doAction("checkin", {
      athlete_id: editingAthlete.id,
      jersey_number: parseInt(jerseyInput) || null,
      team_color: colorInput,
    });
    setEditingAthlete(null);
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
      <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-[#FF6B35]" />
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
      {/* Header */}
      <div className="bg-gray-800 border-b border-gray-700 px-4 py-4 sticky top-0 z-10">
        <div className="max-w-2xl mx-auto">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h1 className="font-bold text-white text-lg">{schedule.org_name} · {schedule.category_name}</h1>
              <div className="flex items-center gap-3 text-sm text-gray-400 mt-0.5 flex-wrap">
                <span>S{schedule.session_number} · G{schedule.group_number}</span>
                {schedule.start_time && <span className="flex items-center gap-1"><Clock size={12} />{formatTime(schedule.start_time)}{schedule.end_time ? ` – ${formatTime(schedule.end_time)}` : ""}</span>}
                {schedule.location && <span className="flex items-center gap-1"><MapPin size={12} />{schedule.location}</span>}
              </div>
            </div>
            <button onClick={() => refetch()} className="p-2 text-gray-400 hover:text-white rounded-lg hover:bg-gray-700">
              <RefreshCw size={16} />
            </button>
          </div>

          {/* Progress bar */}
          <div className="flex items-center gap-3 mb-3">
            <div className="flex-1 h-3 bg-gray-700 rounded-full overflow-hidden">
              <div className="h-full bg-gradient-to-r from-[#FF6B35] to-[#F7931E] rounded-full transition-all duration-500"
                style={{ width: `${pct}%` }} />
            </div>
            <span className="text-sm font-bold text-white whitespace-nowrap">
              {summary.checked_in}/{summary.total} in
            </span>
          </div>

          {/* Team color counts */}
          <div className="flex items-center gap-3 mb-3">
            {teamColors.map(color => {
              const count = athletes.filter(a => a.team_color === color && a.checked_in).length;
              const total = athletes.filter(a => a.team_color === color).length;
              const style = COLOR_STYLES[color] || COLOR_STYLES.White;
              return (
                <div key={color} className="flex items-center gap-2 bg-gray-700 rounded-lg px-3 py-1.5">
                  <div className={`w-4 h-4 rounded-full ${style.bg} flex-shrink-0`} />
                  <span className="text-xs text-gray-300">{color}: <span className="text-white font-bold">{count}/{total}</span></span>
                </div>
              );
            })}
          </div>

          {/* Search + filter */}
          <div className="flex gap-2">
            <div className="flex-1 flex items-center gap-2 bg-gray-700 rounded-xl px-3 py-2.5">
              <Search size={15} className="text-gray-400 flex-shrink-0" />
              <input value={search} onChange={e => setSearch(e.target.value)}
                placeholder="Search name, HC#, jersey..."
                className="flex-1 bg-transparent text-white text-sm outline-none placeholder-gray-500" />
            </div>
            <div className="flex bg-gray-700 rounded-xl overflow-hidden">
              {["all", "unchecked", "checked"].map(f => (
                <button key={f} onClick={() => setFilter(f)}
                  className={`px-3 py-2 text-xs font-medium transition-colors ${filter === f ? "bg-[#FF6B35] text-white" : "text-gray-400 hover:text-white"}`}>
                  {f === "all" ? "All" : f === "checked" ? "✓ In" : "Out"}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Player list */}
      <div className="max-w-2xl mx-auto px-4 py-4 space-y-2">
        {filtered.length === 0 && (
          <div className="py-12 text-center text-gray-500">
            <Users size={40} className="mx-auto mb-3 opacity-30" />
            <p className="text-sm">No players found</p>
          </div>
        )}

        {filtered.map(a => {
          const colorStyle = COLOR_STYLES[a.team_color] || COLOR_STYLES.White;
          const isEditing = editingAthlete?.id === a.id;

          return (
            <div key={a.id} className={`rounded-xl border transition-all ${
              a.checked_in
                ? "bg-gray-800 border-green-800/50"
                : "bg-gray-800 border-gray-700"
            }`}>
              <div className="flex items-center gap-3 px-4 py-3">
                {/* Color + jersey indicator */}
                <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0 ${colorStyle.bg} ${colorStyle.text}`}>
                  {a.jersey_number ? `#${a.jersey_number}` : "?"}
                </div>

                {/* Name */}
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-white">{a.last_name}, {a.first_name}</div>
                  <div className="text-xs text-gray-400 flex items-center gap-2">
                    {a.external_id && <span>{a.external_id}</span>}
                    {a.position && <span className="capitalize">{a.position}</span>}
                    <span className={`font-medium ${colorStyle.text === "text-white" ? "text-gray-300" : "text-gray-500"}`}>
                      {a.team_color}
                    </span>
                  </div>
                </div>

                {/* Check in / undo button */}
                <div className="flex items-center gap-2">
                  {a.checked_in ? (
                    <button onClick={() => doAction("undo_checkin", { athlete_id: a.id })}
                      className="flex items-center gap-1.5 px-3 py-2 bg-green-900/50 text-green-400 rounded-lg text-xs font-medium hover:bg-green-900 transition-colors">
                      <Check size={14} /> In
                    </button>
                  ) : (
                    <button onClick={() => openEdit(a)}
                      className="flex items-center gap-1.5 px-3 py-2 bg-[#FF6B35] text-white rounded-lg text-xs font-semibold hover:bg-[#E55A2E] transition-colors">
                      Check In <ChevronRight size={13} />
                    </button>
                  )}
                </div>
              </div>

              {/* Inline check-in form */}
              {isEditing && (
                <div className="px-4 pb-4 border-t border-gray-700 pt-3">
                  <p className="text-sm font-medium text-gray-300 mb-3">
                    Checking in: <span className="text-white">{a.first_name} {a.last_name}</span>
                  </p>

                  {/* Jersey number */}
                  <div className="mb-3">
                    <label className="text-xs text-gray-400 mb-1.5 block">Jersey Number</label>
                    <input
                      type="number"
                      value={jerseyInput}
                      onChange={e => setJerseyInput(e.target.value)}
                      placeholder="Enter jersey #"
                      className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2.5 text-white text-center text-2xl font-bold focus:outline-none focus:border-[#FF6B35]"
                      autoFocus
                    />
                  </div>

                  {/* Team color — pre-assigned, can swap if needed */}
                  <div className="mb-4">
                    <label className="text-xs text-gray-400 mb-1.5 block">Team Color (pre-assigned — swap if needed)</label>
                    <div className="flex gap-2">
                      {teamColors.map(color => {
                        const cs = COLOR_STYLES[color] || COLOR_STYLES.White;
                        return (
                          <button key={color} onClick={() => setColorInput(color)}
                            className={`flex-1 py-2.5 rounded-lg border-2 text-sm font-semibold transition-all ${
                              colorInput === color
                                ? "border-[#FF6B35] " + (color === "Dark" ? "bg-gray-800 text-white" : "bg-white text-gray-900")
                                : "border-gray-600 " + (color === "Dark" ? "bg-gray-900 text-gray-400" : "bg-gray-700 text-gray-400")
                            }`}>
                            {color}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <button onClick={() => setEditingAthlete(null)}
                      className="flex-1 py-2.5 bg-gray-700 text-gray-300 rounded-xl text-sm font-medium">
                      Cancel
                    </button>
                    <button onClick={submitCheckin}
                      className="flex-1 py-2.5 bg-gradient-to-r from-[#FF6B35] to-[#F7931E] text-white rounded-xl text-sm font-bold">
                      ✓ Confirm Check-in
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function CheckinPage() {
  return (
    <QueryClientProvider client={qc}>
      <Suspense fallback={<div className="min-h-screen bg-gray-900 flex items-center justify-center"><div className="animate-spin rounded-full h-10 w-10 border-b-2 border-[#FF6B35]" /></div>}>
        <CheckinPageInner />
      </Suspense>
    </QueryClientProvider>
  );
}
