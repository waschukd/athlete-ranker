"use client";

import { useState, useEffect, useCallback } from "react";
import { Users, Shuffle, Loader2, GripVertical, Pencil, Check as CheckIcon, Trash2, Plus } from "lucide-react";

// Team assignment for a Tournament category. Seed teams without scores
// (alphabetical or even), then move players between teams — drag a player row
// onto a team (native HTML5 drag-and-drop, same mechanism the Manage Groups
// page already uses for standard-evaluation groups) or use each player's team
// dropdown — and "Apply to schedule" to fill upcoming matchup games. Rendered
// on the Teams tab when the category's eval_format = 'round_robin'.
const posShort = (p) => { const s = (p || "").toLowerCase(); return s.startsWith("d") ? "D" : s.startsWith("g") ? "G" : "F"; };
const nameOf = (a) => `${a.first_name || ""} ${a.last_name || ""}`.trim() || `#${a.jersey_number ?? "?"}`;
const teamLabel = (name) => String(name || "").replace(/^team\s+/i, "").trim() || name;

export default function ScrimmageTeams({ catId }) {
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(false);
  const [count, setCount] = useState(3);
  const [dragging, setDragging] = useState(null); // { athleteId, fromTeamId } while dragging
  const [dragOver, setDragOver] = useState(null); // team id currently under the drag
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
      // A failed move (permission, validation, network) used to fail
      // silently -- the row would just snap back with zero explanation,
      // which reads as "nothing happens" even though something did.
      if (!res.ok) { const d = await res.json().catch(() => ({})); setErr(d.error || "That didn't work — try again."); }
      await load();
    } catch { setErr("Network error — try again."); }
    setBusy(false);
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
    const withPlayers = team.members.length ? ` Its ${team.members.length} player${team.members.length === 1 ? "" : "s"} will go back to the unassigned pool — drag them onto the remaining teams.` : "";
    if (confirm(`Remove ${teamLabel(team.name)}?${withPlayers} This can't be undone (you'd need to re-add and re-seed).`)) {
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

  // Native HTML5 drag-and-drop -- the same mechanism the Manage Groups page
  // already uses to move players between session groups, instead of the
  // previous hand-rolled pointer-event + elementFromPoint hit-test. The
  // browser itself resolves the real drop target via dragover/drop events,
  // which is what the custom version was trying (and occasionally failing)
  // to reimplement.
  const onDragStart = (e, athleteId, fromTeamId) => {
    setDragging({ athleteId, fromTeamId });
    e.dataTransfer.effectAllowed = "move";
  };
  const onDragOver = (e, teamId) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDragOver(teamId);
  };
  const onDrop = (e, toTeamId) => {
    e.preventDefault();
    setDragOver(null);
    const athleteId = dragging?.athleteId;
    setDragging(null);
    if (!Number.isFinite(athleteId) || !Number.isFinite(toTeamId)) return;
    post({ action: "move_player", athlete_id: athleteId, to_team_id: toTeamId });
  };

  if (!data) return <div className="py-8 text-center text-sm text-gray-400">Loading teams…</div>;
  const teams = data.teams || [];
  const unassigned = data.unassigned || [];

  const Player = ({ a, teamId }) => (
    <div
      draggable
      onDragStart={e => onDragStart(e, a.id, teamId)}
      className={`flex items-center gap-2 bg-white border rounded-lg px-2.5 py-1.5 text-sm cursor-grab active:cursor-grabbing select-none ${dragging?.athleteId === a.id ? "opacity-40 border-accent" : "border-gray-200 hover:border-accent/40"}`}>
      <span className="flex-shrink-0 text-gray-300" title="Drag to a team">
        <GripVertical size={14} />
      </span>
      <span className="font-mono text-xs text-gray-400 w-6">{a.jersey_number ?? ""}</span>
      <span className="truncate flex-1 text-gray-700">{nameOf(a)}</span>
      <span className={`text-[10px] px-1.5 py-0.5 rounded font-semibold ${posShort(a.position) === "D" ? "bg-purple-100 text-purple-700" : "bg-blue-100 text-blue-700"}`}>{posShort(a.position)}</span>
      <select
        value={teamId ?? ""}
        onChange={(e) => { const v = e.target.value ? parseInt(e.target.value) : null; if (Number.isFinite(a.id) && Number.isFinite(v)) post({ action: "move_player", athlete_id: a.id, to_team_id: v }); }}
        disabled={busy}
        title="Move to team"
        className="text-[11px] border border-gray-200 rounded px-1 py-0.5 bg-white text-gray-700 focus:outline-none focus:ring-1 focus:ring-accent/40 disabled:opacity-50">
        {teamId == null && <option value="">—</option>}
        {teams.map(t => <option key={t.id} value={t.id}>{teamLabel(t.name)}</option>)}
      </select>
    </div>
  );

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
            {/* Plain, unseeded team creation -- every player starts unassigned,
                placed by hand via the per-player dropdown or drag-and-drop
                below. Previously the only way to create teams at all was one
                of the Seed buttons, which auto-place everyone immediately. */}
            <button onClick={() => post({ action: "create", count })} disabled={busy} className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 bg-accent text-white rounded-lg font-semibold disabled:opacity-50">
              {busy ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />} Create teams
            </button>
          </>
        ) : (
          <button onClick={() => post({ action: "add_team" })} disabled={busy || teams.length >= 6} title={teams.length >= 6 ? "Maximum of 6 teams" : "Add another team"} className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 border border-gray-300 text-gray-700 rounded-lg font-medium hover:bg-gray-50 disabled:opacity-50">
            <Plus size={13} /> Add team
          </button>
        )}
        {teams.length === 0 && (
          <>
            <button onClick={() => post({ action: "seed", mode: "alphabetical", count })} disabled={busy} className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 border border-gray-300 text-gray-700 rounded-lg font-medium hover:bg-gray-50 disabled:opacity-50">
              <Shuffle size={13} /> Seed alphabetically
            </button>
            <button onClick={() => post({ action: "seed", mode: "even", count })} disabled={busy} className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 border border-gray-300 text-gray-700 rounded-lg font-medium hover:bg-gray-50 disabled:opacity-50">
              Even split (by #)
            </button>
          </>
        )}
        <button onClick={applyMatchups} disabled={busy} className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 border border-accent text-accent rounded-lg font-semibold hover:bg-accent-soft disabled:opacity-50">
          Apply to schedule
        </button>
        <span className="text-[11px] text-gray-400">{teams.length === 0 ? "Pick a team count, then Create teams (empty, place players yourself) or Seed (auto-fills everyone)." : "Drag a player row to a team (or use its dropdown), then Apply to schedule. Add team grows the set without disturbing existing rosters."}</span>
        {applied && <span className="text-[11px] text-gray-500 w-full">Filled {applied.applied} upcoming game{applied.applied === 1 ? "" : "s"}{applied.skipped ? ` · ${applied.skipped} already played/unresolved` : ""}.</span>}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {teams.map(team => {
          const d = team.members.filter(m => posShort(m.position) === "D").length;
          const f = team.members.length - d;
          return (
            <div key={team.id}
              onDragOver={e => onDragOver(e, team.id)}
              onDrop={e => onDrop(e, team.id)}
              className={`bg-white border rounded-xl p-3 min-h-[120px] transition-colors ${dragOver === team.id ? "border-accent ring-2 ring-accent/30 bg-accent-soft/40" : dragging ? "border-dashed border-accent/40" : "border-gray-200"}`}>
              <div className="flex items-center justify-between mb-2 gap-2">
                {renamingId === team.id ? (
                  <span className="inline-flex items-center gap-1 min-w-0 flex-1">
                    <input
                      autoFocus
                      value={nameDraft}
                      onChange={e => setNameDraft(e.target.value)}
                      onKeyDown={e => { if (e.key === "Enter") saveRename(team.id); if (e.key === "Escape") setRenamingId(null); }}
                      onBlur={() => saveRename(team.id)}
                      maxLength={40}
                      className="min-w-0 flex-1 text-sm font-bold text-ink border border-accent/40 rounded px-1.5 py-0.5 focus:outline-none focus:ring-1 focus:ring-accent"
                    />
                    <button onClick={() => saveRename(team.id)} className="text-accent flex-shrink-0" title="Save name"><CheckIcon size={14} /></button>
                  </span>
                ) : (
                  <button onClick={() => startRename(team)} className="inline-flex items-center gap-1.5 text-sm font-bold text-ink hover:opacity-70 min-w-0" title="Rename team">
                    <span className="truncate">{team.name}</span>
                    <Pencil size={11} className="text-gray-300 flex-shrink-0" />
                  </button>
                )}
                <span className="text-[11px] text-gray-400 flex-shrink-0">{team.members.length} · {f}F/{d}D</span>
                {teams.length > 2 && (
                  <button onClick={() => removeTeam(team)} disabled={busy} className="text-gray-300 hover:text-red-500 flex-shrink-0 disabled:opacity-40" title={`Remove ${teamLabel(team.name)}`}>
                    <Trash2 size={13} />
                  </button>
                )}
              </div>
              <div className="space-y-1.5">
                {team.members.map(a => <Player key={a.id} a={a} teamId={team.id} />)}
                {team.members.length === 0 && <div className="text-xs text-gray-300 text-center py-4">{dragging ? "Drop here" : "No players"}</div>}
              </div>
            </div>
          );
        })}
      </div>

      {unassigned.length > 0 && (
        <div className="bg-amber-50/40 border border-amber-200 rounded-xl p-3">
          <div className="flex items-center gap-2 mb-2"><Users size={14} className="text-amber-600" /><h4 className="text-sm font-semibold text-amber-800">Unassigned ({unassigned.length})</h4></div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-1.5">
            {unassigned.map(a => <Player key={a.id} a={a} teamId={null} />)}
          </div>
        </div>
      )}
      {teams.length === 0 && <div className="py-8 text-center text-sm text-gray-400">Pick a team count and seed to get started.</div>}
    </div>
  );
}
