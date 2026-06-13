"use client";

import { useState, useRef, useEffect, Suspense } from "react";
import { useParams } from "next/navigation";
import { useQuery, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Check, Search, Users, Clock, MapPin, RefreshCw, AlertCircle, X } from "lucide-react";
import { useTheme } from "@/lib/useTheme";
import ThemeToggle from "@/components/ThemeToggle";

const qc = new QueryClient();

function formatTime(t) {
  if (!t) return "";
  const [h, m] = t.toString().split(":");
  const hr = parseInt(h);
  return `${hr > 12 ? hr - 12 : hr}:${m} ${hr >= 12 ? "PM" : "AM"}`;
}

function CheckinPageInner() {
  const [theme, toggleTheme] = useTheme();
  const params = useParams();
  const scheduleId = params.scheduleId;

  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("unchecked");
  const [showAddPlayer, setShowAddPlayer] = useState(false);
  const [addForm, setAddForm] = useState({ first_name: "", last_name: "", jersey_number: "", team_color: "White" });
  const [addLoading, setAddLoading] = useState(false);
  const [matches, setMatches] = useState([]);
  const [searching, setSearching] = useState(false);
  // Inline jersey editing
  const [editingJersey, setEditingJersey] = useState(null); // athlete id
  const [jerseyVal, setJerseyVal] = useState("");
  // Action failure + offline feedback
  const [actionError, setActionError] = useState("");
  const [online, setOnline] = useState(true);

  useEffect(() => {
    const set = () => setOnline(typeof navigator === "undefined" ? true : navigator.onLine);
    set();
    window.addEventListener("online", set);
    window.addEventListener("offline", set);
    return () => { window.removeEventListener("online", set); window.removeEventListener("offline", set); };
  }, []);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["checkin", scheduleId],
    queryFn: async () => {
      const res = await fetch(`/api/checkin/${scheduleId}`);
      if (!res.ok) throw new Error("Not found");
      return res.json();
    },
    refetchInterval: 5000,
  });

  const doAction = async (action, body = {}) => {
    try {
      const res = await fetch(`/api/checkin/${scheduleId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ...body }),
      });
      if (!res.ok) {
        setActionError("That didn't save — check your connection and try again.");
      } else {
        setActionError("");
      }
    } catch {
      setActionError("No connection — that didn't save. Try again when you're back online.");
    } finally {
      refetch();
    }
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

  // Debounced roster lookup as the volunteer types a name in the Add form.
  const lookupTimer = useRef(null);
  const runLookup = (first, last) => {
    const query = `${first} ${last}`.trim();
    if (lookupTimer.current) clearTimeout(lookupTimer.current);
    if (query.length < 2) { setMatches([]); return; }
    lookupTimer.current = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await fetch(`/api/checkin/${scheduleId}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "find_existing", query }),
        });
        const data = res.ok ? await res.json() : { matches: [] };
        setMatches(data.matches || []);
      } finally {
        setSearching(false);
      }
    }, 250);
  };

  const checkInExisting = async (athleteId) => {
    await doAction("add_existing", { athlete_id: athleteId });
    setAddForm({ first_name: "", last_name: "", jersey_number: "", team_color: "White" });
    setMatches([]);
  };

  useEffect(() => () => { if (lookupTimer.current) clearTimeout(lookupTimer.current); }, []);

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
    <div data-theme={theme} className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-accent" />
    </div>
  );

  if (!data?.schedule) return (
    <div data-theme={theme} className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="text-center">
        <AlertCircle size={40} className="mx-auto mb-3 text-red-400" />
        <p className="text-lg font-semibold text-ink">Session not found</p>
      </div>
    </div>
  );

  const lightCheckedIn = athletes.filter(a => a.team_color === "White" && a.checked_in).length;
  const lightTotal = athletes.filter(a => a.team_color === "White").length;
  const darkCheckedIn = athletes.filter(a => a.team_color === "Dark" && a.checked_in).length;
  const darkTotal = athletes.filter(a => a.team_color === "Dark").length;

  return (
    <div data-theme={theme} className="min-h-screen bg-gray-50 text-ink">
      {/* Header — Minimal Athletic */}
      <div className="bg-white border-b border-gray-200 shadow-sm sticky top-0 z-10">
        <div className="max-w-2xl mx-auto px-4 py-4">
          {/* Kicker */}
          <div className="font-display text-xs font-bold tracking-[0.2em] uppercase text-accent mb-2">
            {schedule.org_name ? `${schedule.org_name}${schedule.category_name ? ` · ${schedule.category_name}` : ""}` : "Check-In"}
          </div>

          {/* Title row */}
          <div className="flex items-end justify-between gap-4 flex-wrap">
            <div className="flex items-end gap-4 flex-wrap">
              <h1 className="font-display font-black tracking-tight text-ink text-4xl sm:text-5xl leading-none">
                {schedule.session_number ? `Session ${schedule.session_number}` : "Check-In"}
              </h1>
            </div>
            <div className="flex items-center gap-1.5 pb-1">
              <button onClick={() => setShowAddPlayer(!showAddPlayer)} className="px-3 py-2 bg-accent text-white rounded-lg text-sm font-semibold hover:opacity-90 transition-opacity">+ Add</button>
              <button onClick={() => refetch()} className="p-2 text-gray-400 hover:text-ink rounded-lg hover:bg-gray-100"><RefreshCw size={16} /></button>
              <ThemeToggle theme={theme} onToggle={toggleTheme} />
            </div>
          </div>

          {/* Sub-line: counts + time/location */}
          <div className="flex items-center gap-2 mt-3 flex-wrap text-sm text-gray-500 font-medium">
            <span><b className="text-ink">{summary.checked_in ?? 0}</b> / <b className="text-ink">{summary.total ?? 0}</b> checked in</span>
            {(lightTotal > 0 || darkTotal > 0) && <span className="text-gray-300">·</span>}
            {lightTotal > 0 && <span>L <b className="text-ink">{lightCheckedIn}/{lightTotal}</b></span>}
            {darkTotal > 0 && <span>D <b className="text-ink">{darkCheckedIn}/{darkTotal}</b></span>}
            {(schedule.start_time || schedule.location) && <span className="text-gray-300">·</span>}
            {schedule.start_time && (
              <span className="flex items-center gap-1">
                <Clock size={11} className="text-gray-400" />
                {formatTime(schedule.start_time)}{schedule.end_time ? ` – ${formatTime(schedule.end_time)}` : ""}
              </span>
            )}
            {schedule.location && (
              <span className="flex items-center gap-1">
                <MapPin size={11} className="text-gray-400" />
                {schedule.location}
              </span>
            )}
            {schedule.group_number && schedule.group_number > 1 && (
              <><span className="text-gray-300">·</span><span>Group <b className="text-ink">{schedule.group_number}</b></span></>
            )}
          </div>

          {/* Progress bar */}
          <div className="mt-3 h-1.5 bg-gray-100 rounded-full overflow-hidden">
            <div className="h-full bg-accent rounded-full transition-all" style={{ width: `${pct}%` }} />
          </div>

          {/* Search + filter */}
          <div className="flex gap-2 mt-3">
            <div className="flex-1 flex items-center gap-2 bg-gray-100 rounded-lg px-3 py-2.5">
              <Search size={13} className="text-gray-400 flex-shrink-0" />
              <input value={search} onChange={e => setSearch(e.target.value)}
                placeholder="Search..."
                className="flex-1 bg-transparent text-ink text-sm outline-none placeholder-gray-400" />
              {search && <button onClick={() => setSearch("")} className="text-gray-400 hover:text-ink"><X size={12} /></button>}
            </div>
            <div className="flex bg-gray-100 rounded-lg overflow-hidden">
              {[
                { id: "unchecked", label: "Out" },
                { id: "checked", label: "In" },
                { id: "all", label: "All" },
              ].map(f => (
                <button key={f.id} onClick={() => setFilter(f.id)}
                  className={`px-3 py-2.5 text-xs font-semibold transition-colors ${filter === f.id ? "bg-accent text-white" : "text-gray-500 hover:text-ink"}`}>
                  {f.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Connection / action-failure banners */}
      {!online && (
        <div className="bg-amber-500 text-amber-950 text-sm font-semibold px-4 py-2 text-center">
          Offline — check-ins won't save until you're back online.
        </div>
      )}
      {actionError && (
        <div className="bg-red-600 text-white text-sm px-4 py-2 flex items-center justify-between gap-3">
          <span>{actionError}</span>
          <button onClick={() => setActionError("")} className="underline font-semibold whitespace-nowrap">Dismiss</button>
        </div>
      )}

      {/* Add Player Inline */}
      {showAddPlayer && (
        <div className="max-w-2xl mx-auto px-4 pt-3">
          <div className="flex items-center gap-2 bg-green-50 border border-green-200 rounded-lg px-3 py-2">
            <input value={addForm.first_name}
              onChange={e => { const v = e.target.value; setAddForm(f => ({ ...f, first_name: v })); runLookup(v, addForm.last_name); }}
              placeholder="First *" className="w-24 bg-white border border-gray-200 rounded px-2 py-1.5 text-sm text-ink focus:outline-none focus:border-accent" autoFocus />
            <input value={addForm.last_name}
              onChange={e => { const v = e.target.value; setAddForm(f => ({ ...f, last_name: v })); runLookup(addForm.first_name, v); }}
              placeholder="Last *" className="w-24 bg-white border border-gray-200 rounded px-2 py-1.5 text-sm text-ink focus:outline-none focus:border-accent" />
            <input value={addForm.jersey_number} onChange={e => setAddForm(f => ({ ...f, jersey_number: e.target.value }))}
              placeholder="#" type="number" className="w-14 bg-white border border-gray-200 rounded px-2 py-1.5 text-sm text-ink text-center focus:outline-none focus:border-accent" />
            <button onClick={() => setAddForm(f => ({ ...f, team_color: f.team_color === "White" ? "Dark" : "White" }))}
              className={`px-2 py-1.5 rounded text-xs font-bold border ${addForm.team_color === "Dark" ? "bg-gray-800 text-white border-gray-800" : "bg-white text-gray-900 border-gray-300"}`}>
              {addForm.team_color === "Dark" ? "D" : "L"}
            </button>
            <button
              onClick={async () => {
                if (!addForm.first_name || !addForm.last_name) return;
                setAddLoading(true);
                await doAction("add_player", { ...addForm, jersey_number: parseInt(addForm.jersey_number) || null });
                setAddForm({ first_name: "", last_name: "", jersey_number: "", team_color: "White" });
                setMatches([]);
                setAddLoading(false);
              }}
              disabled={!addForm.first_name || !addForm.last_name || addLoading}
              className="px-3 py-1.5 bg-green-600 text-white rounded text-xs font-semibold disabled:opacity-40 whitespace-nowrap">
              {addLoading ? "..." : "Add new"}
            </button>
            <button onClick={() => { if (lookupTimer.current) clearTimeout(lookupTimer.current); setShowAddPlayer(false); setMatches([]); }} className="text-gray-400 hover:text-ink"><X size={14} /></button>
          </div>

          {/* Existing-roster matches — pick to check in without duplicating */}
          {matches.length > 0 && (
            <div className="mt-2 bg-white border border-gray-200 rounded-lg divide-y divide-gray-100">
              {matches.map(m => (
                <div key={m.id} className="flex items-center justify-between px-3 py-2">
                  <span className="text-sm text-ink truncate">
                    {m.last_name}, {m.first_name}
                    <span className="text-xs text-gray-400 ml-2">
                      {m.position ? `${m.position} · ` : ""}
                      {m.session_number ? `S${m.session_number}·G${m.group_number || 1}` : "unassigned"}
                    </span>
                  </span>
                  <button onClick={() => checkInExisting(m.id)}
                    className="px-3 py-1.5 bg-accent text-white rounded text-xs font-semibold whitespace-nowrap">Check in here</button>
                </div>
              ))}
            </div>
          )}
          {searching && matches.length === 0 && (addForm.first_name + addForm.last_name).trim().length >= 2 && (
            <div className="mt-2 px-3 py-2 text-xs text-gray-400">Searching roster…</div>
          )}
        </div>
      )}

      {/* Player list — compact single-line rows */}
      <div className="max-w-2xl mx-auto px-4 py-3">
        {filtered.length === 0 && (
          <div className="py-12 text-center text-gray-400">
            <p className="text-sm">{filter === "unchecked" ? "Everyone's checked in!" : "No players found"}</p>
          </div>
        )}

        <div className="space-y-1">
          {filtered.map(a => (
            <div key={a.id} className={`flex items-center gap-3 rounded-lg px-3 py-2 transition-all ${
              a.checked_in ? "bg-green-50 border border-green-200" : "bg-white border border-gray-200"
            }`}>
              {/* Name */}
              <span className="text-sm text-ink truncate" style={{ minWidth: 0, flex: "1 1 0" }}>{a.last_name}, {a.first_name}</span>

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
                  className="w-14 bg-white border border-accent rounded px-1 py-1 text-xs text-ink text-center focus:outline-none" autoFocus />
              ) : (
                <button onClick={() => { setEditingJersey(a.id); setJerseyVal(a.jersey_number?.toString() || ""); }}
                  className="w-10 text-center text-xs font-mono text-gray-400 hover:text-ink rounded py-1">
                  {a.jersey_number || "# "}
                </button>
              )}

              {/* W / D toggle */}
              <button onClick={() => doAction("move_team", { athlete_id: a.id, team_color: a.team_color === "White" ? "Dark" : "White" })}
                className={`w-7 h-7 rounded text-xs font-bold border ${a.team_color === "Dark" ? "bg-gray-800 text-white border-gray-800" : "bg-white text-gray-900 border-gray-300"}`}>
                {a.team_color === "Dark" ? "D" : "L"}
              </button>

              {/* Check in / undo */}
              {a.checked_in ? (
                <button onClick={() => doAction("undo_checkin", { athlete_id: a.id })}
                  className="px-3 py-1.5 bg-green-100 text-green-700 rounded text-xs font-semibold border border-green-200">✓</button>
              ) : (
                <button onClick={() => quickCheckin(a)}
                  className="px-3 py-1.5 bg-accent text-white rounded text-xs font-semibold">In</button>
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
      <Suspense fallback={<div data-theme="premium" className="min-h-screen bg-gray-50 flex items-center justify-center"><div className="animate-spin rounded-full h-10 w-10 border-b-2 border-accent" /></div>}>
        <CheckinPageInner />
      </Suspense>
    </QueryClientProvider>
  );
}
