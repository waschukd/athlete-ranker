"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { Loader2, Pencil, Trash2, Plus, Shuffle, Search, Users } from "lucide-react";

// Team assignment for a Tournament category. Every player is always listed
// (whether assigned or not) with a tap-target per team to place/move them --
// no drag-and-drop, since native HTML5 drag doesn't fire on touch devices
// (iOS/Android), which is how this is used rinkside. Rendered on the Teams
// tab when the category's eval_format = 'round_robin'.
const posShort = (p) => { const s = (p || "").toLowerCase(); return s.startsWith("d") ? "D" : s.startsWith("g") ? "G" : "F"; };
const nameOf = (a) => `${a.first_name || ""} ${a.last_name || ""}`.trim() || `#${a.jersey_number ?? "?"}`;
const teamLabel = (name) => String(name || "").replace(/^team\s+/i, "").trim() || name;

// A team named "White"/"Black"/"Gold" etc gets its literal color; anything
// else cycles through a fixed palette by position so every team is still
// visually distinct at a glance.
const NAMED_COLORS = {
  white: "#e5e7eb", black: "#18181b", gold: "#ca8a04", silver: "#94a3b8",
  red: "#dc2626", blue: "#2563eb", green: "#16a34a", navy: "#1e3a8a",
  maroon: "#7f1d1d", orange: "#ea580c", purple: "#9333ea", teal: "#0d9488",
  gray: "#6b7280", grey: "#6b7280", yellow: "#eab308", pink: "#db2777",
};
const PALETTE = ["#2563eb", "#dc2626", "#16a34a", "#9333ea", "#ea580c", "#0d9488"];
const teamColor = (name, idx) => NAMED_COLORS[teamLabel(name).toLowerCase()] || PALETTE[idx % PALETTE.length];

export default function ScrimmageTeams({ catId }) {
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(false);
  const [movingId, setMovingId] = useState(null);
  const [count, setCount] = useState(3);
  const [applied, setApplied] = useState(null);
  const [err, setErr] = useState("");
  const [renamingId, setRenamingId] = useState(null);
  const [nameDraft, setNameDraft] = useState("");
  const [query, setQuery] = useState("");

  const load = useCallback(async () => {
    const res = await fetch(`/api/categories/${catId}/scrimmage-teams`);
    const d = await res.json();
    setData(d);
    if (d.teams?.length) setCount(d.teams.length);
  }, [catId]);
  useEffect(() => { load(); }, [load]);

  const post = async (body) => {
    setBusy(true); setErr("");
    try {
      const res = await fetch(`/api/categories/${catId}/scrimmage-teams`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (!res.ok) { const d = await res.json().catch(() => ({})); setErr(d.error || "That didn't work — try again."); }
      await load();
    } catch { setErr("Network error — try again."); }
    setBusy(false);
  };

  const movePlayer = async (athleteId, toTeamId) => {
    setMovingId(athleteId);
    await post({ action: "move_player", athlete_id: athleteId, to_team_id: toTeamId });
    setMovingId(null);
  };

  const startRename = (team) => { setRenamingId(team.id); setNameDraft(teamLabel(team.name)); };
  const saveRename = async (teamId) => {
    const name = nameDraft.trim();
    setRenamingId(null);
    if (!name) return;
    await post({ action: "rename", team_id: teamId, name });
  };

  const removeTeam = (team) => {
    if (teams.length <= 2) return;
    const withPlayers = team.members.length ? ` Its ${team.members.length} player${team.members.length === 1 ? "" : "s"} will go back to unassigned.` : "";
    if (confirm(`Remove ${teamLabel(team.name)}?${withPlayers} This can't be undone (you'd need to re-add and re-place them).`)) {
      post({ action: "remove_team", team_id: team.id });
    }
  };

  const applyMatchups = async () => {
    setBusy(true); setApplied(null);
    try {
      const res = await fetch(`/api/categories/${catId}/scrimmage-teams`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "apply_matchups" }) });
      setApplied(await res.json());
    } catch {}
    setBusy(false);
  };

  const teams = data?.teams || [];
  const unassigned = data?.unassigned || [];
  const roster = useMemo(() => [
    ...teams.flatMap(t => t.members.map(m => ({ ...m, id: m.athlete_id, teamId: t.id }))),
    ...unassigned.map(a => ({ ...a, teamId: null })),
  ].sort((x, y) => nameOf(x).localeCompare(nameOf(y))), [teams, unassigned]);
  const filtered = query.trim() ? roster.filter(a => nameOf(a).toLowerCase().includes(query.trim().toLowerCase())) : roster;

  if (!data) return <div className="py-10 text-center text-sm text-gray-400">Loading teams…</div>;

  return (
    <div className="space-y-4">
      {err && (
        <div className="flex items-center justify-between bg-red-50 border border-red-200 rounded-xl px-4 py-2.5 text-sm text-red-700">
          <span>{err}</span>
          <button onClick={() => setErr("")} className="text-red-400 hover:text-red-600 text-xs font-semibold">Dismiss</button>
        </div>
      )}

      {teams.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-2xl p-6 text-center space-y-3">
          <Users size={22} className="mx-auto text-gray-300" />
          <p className="text-sm text-gray-500">No teams yet — pick a count to get started.</p>
          <div className="flex items-center justify-center gap-2 flex-wrap">
            <select value={count} onChange={(e) => setCount(Number(e.target.value))} className="px-2.5 py-1.5 border border-gray-300 rounded-lg text-sm bg-white">
              {[2, 3, 4, 5, 6].map(n => <option key={n} value={n}>{n} teams</option>)}
            </select>
            <button onClick={() => post({ action: "create", count })} disabled={busy} className="inline-flex items-center gap-1.5 text-sm px-3.5 py-1.5 bg-accent text-white rounded-lg font-semibold disabled:opacity-50 shadow-sm">
              {busy ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />} Create teams
            </button>
            <button onClick={() => post({ action: "seed", mode: "alphabetical", count })} disabled={busy} className="inline-flex items-center gap-1.5 text-sm px-3.5 py-1.5 border border-gray-300 text-gray-700 rounded-lg font-medium hover:bg-gray-50 disabled:opacity-50">
              <Shuffle size={13} /> Seed alphabetically
            </button>
            <button onClick={() => post({ action: "seed", mode: "even", count })} disabled={busy} className="inline-flex items-center gap-1.5 text-sm px-3.5 py-1.5 border border-gray-300 text-gray-700 rounded-lg font-medium hover:bg-gray-50 disabled:opacity-50">
              Even split (by #)
            </button>
          </div>
          <p className="text-xs text-gray-400">Create teams empty and place everyone below, or seed to auto-fill.</p>
        </div>
      ) : (
        <>
          {/* Team summary strip */}
          <div className="flex items-center gap-2 flex-wrap">
            {teams.map((t, idx) => (
              <div key={t.id} className="group inline-flex items-center gap-2 bg-white border border-gray-200 rounded-full pl-1.5 pr-3 py-1.5 shadow-sm">
                <span className="w-5 h-5 rounded-full flex-shrink-0 ring-1 ring-black/10" style={{ background: teamColor(t.name, idx) }} />
                {renamingId === t.id ? (
                  <input
                    autoFocus
                    value={nameDraft}
                    onChange={e => setNameDraft(e.target.value)}
                    onKeyDown={e => { if (e.key === "Enter") saveRename(t.id); if (e.key === "Escape") setRenamingId(null); }}
                    onBlur={() => saveRename(t.id)}
                    maxLength={40}
                    className="w-20 text-sm font-semibold text-ink border-b border-accent/40 focus:outline-none"
                  />
                ) : (
                  <button onClick={() => startRename(t)} className="inline-flex items-center gap-1 text-sm font-semibold text-ink hover:opacity-70" title="Rename team">
                    {teamLabel(t.name)}
                    <Pencil size={10} className="text-gray-300 opacity-0 group-hover:opacity-100 transition-opacity" />
                  </button>
                )}
                <span className="text-xs text-gray-400 font-medium">{t.members.length}</span>
                {teams.length > 2 && (
                  <button onClick={() => removeTeam(t)} disabled={busy} className="text-gray-300 hover:text-red-500 disabled:opacity-40 opacity-0 group-hover:opacity-100 transition-opacity" title={`Remove ${teamLabel(t.name)}`}>
                    <Trash2 size={12} />
                  </button>
                )}
              </div>
            ))}
            <button onClick={() => post({ action: "add_team" })} disabled={busy || teams.length >= 6} title={teams.length >= 6 ? "Maximum of 6 teams" : "Add another team"} className="inline-flex items-center gap-1.5 text-sm px-3 py-1.5 border border-dashed border-gray-300 text-gray-500 rounded-full font-medium hover:border-accent hover:text-accent disabled:opacity-40">
              <Plus size={13} /> Add team
            </button>
            <div className="flex-1" />
            <button onClick={applyMatchups} disabled={busy} className="inline-flex items-center gap-1.5 text-sm px-3.5 py-1.5 border border-accent text-accent rounded-full font-semibold hover:bg-accent-soft disabled:opacity-50">
              Apply to schedule
            </button>
          </div>
          {applied && <p className="text-xs text-gray-500">Filled {applied.applied} upcoming game{applied.applied === 1 ? "" : "s"}{applied.skipped ? ` · ${applied.skipped} already played/unresolved` : ""}.</p>}

          {/* Roster */}
          <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-sm">
            <div className="px-4 py-3 bg-gray-50/70 border-b border-gray-100 flex items-center justify-between gap-3 flex-wrap">
              <h4 className="text-sm font-semibold text-ink">All players <span className="text-gray-400 font-normal">({roster.length}{unassigned.length > 0 ? ` · ${unassigned.length} unassigned` : ""})</span></h4>
              <div className="relative">
                <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-300" />
                <input
                  value={query}
                  onChange={e => setQuery(e.target.value)}
                  placeholder="Find a player…"
                  className="pl-7 pr-3 py-1.5 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-1 focus:ring-accent/40 w-44"
                />
              </div>
            </div>
            <div className="divide-y divide-gray-50 max-h-[65vh] overflow-y-auto">
              {filtered.map(a => (
                <div key={a.id} className="flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50/60 transition-colors">
                  <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-[11px] font-bold text-gray-500 flex-shrink-0">
                    {a.jersey_number ?? "–"}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium text-ink truncate">{nameOf(a)}</div>
                  </div>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-semibold flex-shrink-0 ${posShort(a.position) === "D" ? "bg-purple-100 text-purple-700" : "bg-blue-100 text-blue-700"}`}>{posShort(a.position)}</span>
                  <div className="flex items-center gap-1.5 flex-shrink-0 flex-wrap justify-end">
                    {teams.map((t, idx) => {
                      const active = a.teamId === t.id;
                      return (
                        <button
                          key={t.id}
                          onClick={() => movePlayer(a.id, t.id)}
                          disabled={busy || active}
                          title={`Move to ${teamLabel(t.name)}`}
                          style={active ? { background: teamColor(t.name, idx), borderColor: teamColor(t.name, idx) } : undefined}
                          className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full border transition-colors disabled:cursor-default ${active ? "text-white shadow-sm" : "bg-white text-gray-600 border-gray-200 hover:border-gray-300 disabled:opacity-40"}`}>
                          {!active && <span className="w-1.5 h-1.5 rounded-full ring-1 ring-black/10 flex-shrink-0" style={{ background: teamColor(t.name, idx) }} />}
                          {movingId === a.id ? <Loader2 size={11} className="animate-spin" /> : teamLabel(t.name)}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
              {filtered.length === 0 && <div className="py-8 text-center text-sm text-gray-300">No players match "{query}".</div>}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
