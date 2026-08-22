"use client";

import { useState, useRef, useEffect, Suspense } from "react";
import { useParams } from "next/navigation";
import { useQuery, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Check, Search, Users, Clock, MapPin, RefreshCw, AlertCircle, X } from "lucide-react";
import { useTheme } from "@/lib/useTheme";
import ThemeToggle from "@/components/ThemeToggle";
import { parseTeamColors, colorFor, swatchStyle, nextColor, colorInitial, PRESET_TEAM_COLORS } from "@/lib/teamColors";

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
  const [showColors, setShowColors] = useState(false);
  const [savingColors, setSavingColors] = useState(false);
  const [addForm, setAddForm] = useState({ first_name: "", last_name: "", jersey_number: "", team_color: "White" });
  const [addLoading, setAddLoading] = useState(false);
  const [matches, setMatches] = useState([]);
  const [searching, setSearching] = useState(false);
  // Inline jersey editing
  const [editingJersey, setEditingJersey] = useState(null); // athlete id
  const [jerseyVal, setJerseyVal] = useState("");
  const [editingHelmet, setEditingHelmet] = useState(null); // athlete id (helmet-sticker mode)
  const [helmetVal, setHelmetVal] = useState("");
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
  const helmetMode = !!data?.helmet_mode; // identify players by helmet sticker, not jersey
  const summary = data?.summary || {};
  const schedule = data?.schedule || {};
  const teamColors = parseTeamColors(data?.checkinSession?.team_colors);

  // Keep the add-player default on a colour this session actually uses, so a
  // Red/Blue session does not offer a stale "White".
  useEffect(() => {
    const names = teamColors.map(c => c.name.toLowerCase());
    if (!names.includes(String(addForm.team_color || "").toLowerCase())) {
      setAddForm(f => ({ ...f, team_color: teamColors[0].name }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data?.checkinSession?.team_colors]);

  const setSessionColors = async (next) => {
    setSavingColors(true);
    try { await doAction("set_team_colors", { team_colors: next }); } finally { setSavingColors(false); }
  };

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

  // Per-colour tallies for whatever palette this session uses, not just L/D.
  const sameColor = (a, name) => String(a.team_color || "").toLowerCase() === name.toLowerCase();
  const colorTallies = teamColors.map(c => ({
    ...c,
    checkedIn: athletes.filter(a => sameColor(a, c.name) && a.checked_in).length,
    total: athletes.filter(a => sameColor(a, c.name)).length,
  })).filter(c => c.total > 0);

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
            {colorTallies.length > 0 && <span className="text-gray-300">·</span>}
            {colorTallies.map(c => (
              <span key={c.name} className="flex items-center gap-1">
                <span className="inline-block w-2.5 h-2.5 rounded-full" style={{ background: c.hex, border: `1px solid ${c.border}` }} />
                <b className="text-ink">{c.checkedIn}/{c.total}</b>
              </span>
            ))}
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

          {/* Jersey colours — set once at the door, because nobody knows what is
              in the bag until it is opened. Applies to this session only. */}
          <div className="mt-3">
            <button onClick={() => setShowColors(v => !v)}
              className="flex items-center gap-2 text-xs font-semibold text-gray-500 hover:text-ink">
              <span className="flex items-center gap-1">
                {teamColors.map(c => (
                  <span key={c.name} className="inline-block w-3.5 h-3.5 rounded-full"
                    style={{ background: c.hex, border: `1px solid ${c.border}` }} />
                ))}
              </span>
              Jersey colours
              <span className="text-gray-400">{showColors ? "▲" : "▼"}</span>
            </button>

            {showColors && (
              <div className="mt-2 p-3 bg-gray-50 border border-gray-200 rounded-xl">
                {teamColors.map((slot, i) => (
                  <div key={i} className="mb-2 last:mb-0">
                    <div className="text-[11px] font-semibold text-gray-500 mb-1">Team {i + 1} — {slot.name}</div>
                    <div className="flex flex-wrap gap-1.5">
                      {PRESET_TEAM_COLORS.map(preset => {
                        const active = preset.name.toLowerCase() === slot.name.toLowerCase();
                        const takenElsewhere = teamColors.some((c, j) => j !== i && c.name.toLowerCase() === preset.name.toLowerCase());
                        return (
                          <button key={preset.name} disabled={savingColors || takenElsewhere}
                            title={takenElsewhere ? `${preset.name} is already Team ${teamColors.findIndex(c => c.name.toLowerCase() === preset.name.toLowerCase()) + 1}` : preset.name}
                            onClick={() => setSessionColors(teamColors.map((c, j) => (j === i ? preset : c)))}
                            className={`w-7 h-7 rounded-full text-[10px] font-bold flex items-center justify-center transition-transform ${
                              active ? "ring-2 ring-accent ring-offset-1 scale-110" : ""
                            } ${takenElsewhere ? "opacity-25 cursor-not-allowed" : "hover:scale-105"}`}
                            style={{ background: preset.hex, color: preset.text, border: `2px solid ${preset.border}` }}>
                            {colorInitial(preset.name)}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
                <p className="text-[11px] text-gray-400 mt-2">
                  Applies to this session only. Players already checked in move with their team.
                </p>
              </div>
            )}
          </div>

          {/* Progress bar */}
          <div className="mt-3 h-1.5 bg-gray-100 rounded-full overflow-hidden">
            <div className="h-full bg-accent rounded-full transition-all" style={{ width: `${pct}%` }} />
          </div>

          {/* Search + filter */}
          <div className="flex gap-2 mt-3">
            <div className="flex-1 min-w-0 flex items-center gap-2 bg-gray-100 rounded-lg px-3 py-2.5">
              <Search size={13} className="text-gray-400 flex-shrink-0" />
              <input value={search} onChange={e => setSearch(e.target.value)}
                placeholder="Search..."
                className="flex-1 min-w-0 bg-transparent text-ink text-sm outline-none placeholder-gray-400" />
              {search && <button onClick={() => setSearch("")} className="text-gray-400 hover:text-ink flex-shrink-0"><X size={12} /></button>}
            </div>
            <div className="flex flex-shrink-0 bg-gray-100 rounded-lg overflow-hidden">
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
            <button onClick={() => setAddForm(f => ({ ...f, team_color: nextColor(f.team_color, teamColors) }))}
              title={`Jersey: ${addForm.team_color}`}
              className="px-2 py-1.5 rounded text-xs font-bold"
              style={swatchStyle(colorFor(addForm.team_color, teamColors))}>
              {colorInitial(addForm.team_color)}
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
              {/* Name (+ team, tournament format only — peace of mind for whoever's handing out jerseys) */}
              <span className="flex items-center gap-1.5 truncate" style={{ minWidth: 0, flex: "1 1 0" }}>
                <span className="text-sm text-ink truncate">{a.last_name}, {a.first_name}</span>
                {a.team_name && (
                  <span className="flex-shrink-0 text-[10px] px-1.5 py-0.5 rounded font-semibold bg-accent-soft text-accent">{a.team_name}</span>
                )}
              </span>

              {/* Identifier: helmet sticker # (persists on the athlete) in helmet mode,
                  otherwise the per-session jersey #. Tap to edit. */}
              {helmetMode ? (
                editingHelmet === a.id ? (
                  <input inputMode="numeric" value={helmetVal} placeholder="####"
                    onChange={e => setHelmetVal(e.target.value.replace(/[^0-9]/g, "").slice(0, 4))}
                    onBlur={() => {
                      if (helmetVal !== (a.helmet_number || "")) doAction("update_helmet", { athlete_id: a.id, helmet_number: helmetVal });
                      setTimeout(() => setEditingHelmet(null), 200);
                    }}
                    onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); if (helmetVal !== (a.helmet_number || "")) doAction("update_helmet", { athlete_id: a.id, helmet_number: helmetVal }); setEditingHelmet(null); quickCheckin(a); } }}
                    className="w-16 bg-white border border-accent rounded px-1 py-1 text-xs text-ink text-center focus:outline-none" autoFocus />
                ) : (
                  <button onClick={() => { setEditingHelmet(a.id); setHelmetVal(a.helmet_number || ""); }}
                    title="Helmet sticker #"
                    className={`w-16 text-center text-xs font-mono rounded py-1 ${a.helmet_number ? "text-ink hover:opacity-70" : "text-amber-500 hover:text-amber-600"}`}>
                    {a.helmet_number || "helmet"}
                  </button>
                )
              ) : editingJersey === a.id ? (
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
              <button onClick={() => doAction("move_team", { athlete_id: a.id, team_color: nextColor(a.team_color, teamColors) })}
                title={`Jersey: ${a.team_color || "unset"} — tap to change`}
                className="w-7 h-7 rounded text-xs font-bold"
                style={swatchStyle(colorFor(a.team_color, teamColors))}>
                {colorInitial(a.team_color)}
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
