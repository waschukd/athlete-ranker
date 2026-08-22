"use client";

import { useState, useEffect, useCallback } from "react";
import { Loader2, Pencil, Check as CheckIcon, Trash2, Plus, Shuffle } from "lucide-react";

// Team assignment for a Tournament category. Every player is always listed
// (whether assigned or not) with a tap-target per team to place/move them --
// no drag-and-drop, since native HTML5 drag doesn't fire on touch devices
// (iOS/Android), which is how this is used rinkside. Rendered on the Teams
// tab when the category's eval_format = 'round_robin'.
const posShort = (p) => { const s = (p || "").toLowerCase(); return s.startsWith("d") ? "D" : s.startsWith("g") ? "G" : "F"; };
const nameOf = (a) => `${a.first_name || ""} ${a.last_name || ""}`.trim() || `#${a.jersey_number ?? "?"}`;
const teamLabel = (name) => String(name || "").replace(/^team\s+/i, "").trim() || name;

export default function ScrimmageTeams({ catId }) {
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(false);
  const [movingId, setMovingId] = useState(null);
  const [count, setCount] = useState(3);
  const [applied, setApplied] = useState(null);
  const [err, setErr] = useState("");
  const [renamingId, setRenamingId] = useState(null);
  const [nameDraft, setNameDraft] = useState("");

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

  if (!data) return <div className="py-8 text-center text-sm text-gray-400">Loading teams…</div>;
  const teams = data.teams || [];
  const unassigned = data.unassigned || [];
  const roster = [
    ...teams.flatMap(t => t.members.map(m => ({ ...m, teamId: t.id }))),
    ...unassigned.map(a => ({ ...a, teamId: null })),
  ].sort((x, y) => nameOf(x).localeCompare(nameOf(y)));

  return (
    <div className="space-y-4">
      {err && (
        <div className="flex items-center justify-between bg-red-50 border border-red-200 rounded-xl px-4 py-2.5 text-sm text-red-700">
          <span>{err}</span>
          <button onClick={() => setErr("")} className="text-red-400 hover:text-red-600 text-xs font-semibold">Dismiss</button>
        </div>
      )}

      <div className="flex items-center gap-3 flex-wrap bg-gray-50 border border-gray-200 rounded-xl px-4 py-3">
        {teams.length === 0 ? (
          <>
            <span className="text-xs font-medium text-gray-500">Teams:</span>
            <select value={count} onChange={(e) => setCount(Number(e.target.value))} className="px-2 py-1 border border-gray-300 rounded-lg text-sm bg-white">
              {[2, 3, 4, 5, 6].map(n => <option key={n} value={n}>{n}</option>)}
            </select>
            <button onClick={() => post({ action: "create", count })} disabled={busy} className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 bg-accent text-white rounded-lg font-semibold disabled:opacity-50">
              {busy ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />} Create teams
            </button>
            <button onClick={() => post({ action: "seed", mode: "alphabetical", count })} disabled={busy} className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 border border-gray-300 text-gray-700 rounded-lg font-medium hover:bg-gray-50 disabled:opacity-50">
              <Shuffle size={13} /> Seed alphabetically
            </button>
            <button onClick={() => post({ action: "seed", mode: "even", count })} disabled={busy} className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 border border-gray-300 text-gray-700 rounded-lg font-medium hover:bg-gray-50 disabled:opacity-50">
              Even split (by #)
            </button>
            <span className="text-[11px] text-gray-400 w-full">Pick a team count, then Create teams (place everyone yourself below) or Seed (auto-fills everyone).</span>
          </>
        ) : (
          <>
            <button onClick={() => post({ action: "add_team" })} disabled={busy || teams.length >= 6} title={teams.length >= 6 ? "Maximum of 6 teams" : "Add another team"} className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 border border-gray-300 text-gray-700 rounded-lg font-medium hover:bg-gray-50 disabled:opacity-50">
              <Plus size={13} /> Add team
            </button>
            <button onClick={applyMatchups} disabled={busy} className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 border border-accent text-accent rounded-lg font-semibold hover:bg-accent-soft disabled:opacity-50">
              Apply to schedule
            </button>
            <span className="text-[11px] text-gray-400">Tap a team button next to any player to place or move them. Changes apply to the schedule automatically.</span>
            {applied && <span className="text-[11px] text-gray-500 w-full">Filled {applied.applied} upcoming game{applied.applied === 1 ? "" : "s"}{applied.skipped ? ` · ${applied.skipped} already played/unresolved` : ""}.</span>}
          </>
        )}
      </div>

      {teams.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <div className="px-4 py-2.5 bg-gray-50 border-b border-gray-200 flex items-center justify-between flex-wrap gap-2">
            <h4 className="text-sm font-semibold text-ink">All players ({roster.length}){unassigned.length > 0 ? ` · ${unassigned.length} unassigned` : ""}</h4>
            <div className="flex items-center gap-3 flex-wrap">
              {teams.map(t => (
                <span key={t.id} className="inline-flex items-center gap-1 text-xs">
                  {renamingId === t.id ? (
                    <input
                      autoFocus
                      value={nameDraft}
                      onChange={e => setNameDraft(e.target.value)}
                      onKeyDown={e => { if (e.key === "Enter") saveRename(t.id); if (e.key === "Escape") setRenamingId(null); }}
                      onBlur={() => saveRename(t.id)}
                      maxLength={40}
                      className="w-20 text-xs font-bold text-ink border border-accent/40 rounded px-1.5 py-0.5 focus:outline-none focus:ring-1 focus:ring-accent"
                    />
                  ) : (
                    <button onClick={() => startRename(t)} className="inline-flex items-center gap-1 font-semibold text-ink hover:opacity-70" title="Rename team">
                      {teamLabel(t.name)} <Pencil size={10} className="text-gray-300" />
                    </button>
                  )}
                  <span className="text-gray-400">({t.members.length})</span>
                  {teams.length > 2 && (
                    <button onClick={() => removeTeam(t)} disabled={busy} className="text-gray-300 hover:text-red-500 disabled:opacity-40" title={`Remove ${teamLabel(t.name)}`}>
                      <Trash2 size={12} />
                    </button>
                  )}
                </span>
              ))}
            </div>
          </div>
          <div className="divide-y divide-gray-100 max-h-[70vh] overflow-y-auto">
            {roster.map(a => (
              <div key={a.id} className="flex items-center gap-2 px-4 py-2 text-sm">
                <span className="font-mono text-xs text-gray-400 w-6 flex-shrink-0">{a.jersey_number ?? ""}</span>
                <span className="truncate flex-1 text-gray-700">{nameOf(a)}</span>
                <span className={`text-[10px] px-1.5 py-0.5 rounded font-semibold flex-shrink-0 ${posShort(a.position) === "D" ? "bg-purple-100 text-purple-700" : "bg-blue-100 text-blue-700"}`}>{posShort(a.position)}</span>
                <div className="flex items-center gap-1 flex-shrink-0 flex-wrap justify-end">
                  {teams.map(t => (
                    <button
                      key={t.id}
                      onClick={() => movePlayer(a.id, t.id)}
                      disabled={busy || a.teamId === t.id}
                      className={`text-xs font-semibold px-2.5 py-1 rounded-lg border transition-colors disabled:cursor-default ${a.teamId === t.id ? "bg-accent text-white border-accent" : "bg-white text-gray-600 border-gray-200 hover:border-accent/50 disabled:opacity-40"}`}>
                      {movingId === a.id ? <Loader2 size={11} className="animate-spin" /> : teamLabel(t.name)}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      {teams.length === 0 && <div className="py-8 text-center text-sm text-gray-400">Pick a team count and Create/Seed above to get started.</div>}
    </div>
  );
}
