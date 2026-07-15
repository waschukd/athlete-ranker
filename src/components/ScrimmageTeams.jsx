"use client";

import { useState, useEffect, useCallback } from "react";
import { Users, Shuffle, Loader2, GripVertical } from "lucide-react";

// Team assignment for a Tournament category. Seed teams without scores
// (alphabetical or even), then move players between teams — drag the grip handle
// (works on desktop AND touch via pointer events) or use each player's team
// dropdown — and "Apply to schedule" to fill upcoming matchup games. Rendered on
// the Teams tab when the category's eval_format = 'round_robin'.
const posShort = (p) => { const s = (p || "").toLowerCase(); return s.startsWith("d") ? "D" : s.startsWith("g") ? "G" : "F"; };
const nameOf = (a) => `${a.first_name || ""} ${a.last_name || ""}`.trim() || `#${a.jersey_number ?? "?"}`;
const teamLabel = (name) => String(name || "").replace(/^team\s+/i, "").trim() || name;

export default function ScrimmageTeams({ catId }) {
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(false);
  const [count, setCount] = useState(3);
  const [drag, setDrag] = useState(null); // { athleteId, name } while dragging
  const [ghostPos, setGhostPos] = useState({ x: 0, y: 0 });
  const [overTeam, setOverTeam] = useState(null); // team id currently under the pointer
  const [applied, setApplied] = useState(null);

  const load = useCallback(async () => {
    const res = await fetch(`/api/categories/${catId}/scrimmage-teams`);
    const d = await res.json();
    setData(d);
    if (d.teams?.length) setCount(d.teams.length);
  }, [catId]);
  useEffect(() => { load(); }, [load]);

  const post = async (body) => {
    setBusy(true);
    try { await fetch(`/api/categories/${catId}/scrimmage-teams`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }); await load(); } catch {}
    setBusy(false);
  };

  const applyMatchups = async () => {
    setBusy(true); setApplied(null);
    try {
      const res = await fetch(`/api/categories/${catId}/scrimmage-teams`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "apply_matchups" }) });
      setApplied(await res.json());
    } catch {}
    setBusy(false);
  };

  // Pointer-based drag: works for mouse and touch (native HTML5 DnD does not fire
  // on touch). Start on the grip handle; the drop target is whichever team column
  // sits under the pointer on release (found via elementFromPoint + data-teamid).
  const startDrag = (a) => (e) => {
    e.preventDefault();
    setGhostPos({ x: e.clientX, y: e.clientY });
    setDrag({ athleteId: a.id, name: nameOf(a) });
  };

  useEffect(() => {
    if (!drag) return;
    const zoneAt = (x, y) => document.elementFromPoint(x, y)?.closest("[data-teamid]")?.getAttribute("data-teamid") || null;
    const move = (e) => {
      if (e.cancelable) e.preventDefault();
      setGhostPos({ x: e.clientX, y: e.clientY });
      const z = zoneAt(e.clientX, e.clientY);
      setOverTeam(z ? parseInt(z) : null);
    };
    const up = (e) => {
      const z = zoneAt(e.clientX, e.clientY);
      const athleteId = drag.athleteId;
      setDrag(null); setOverTeam(null);
      if (z) post({ action: "move_player", athlete_id: athleteId, to_team_id: parseInt(z) });
    };
    window.addEventListener("pointermove", move, { passive: false });
    window.addEventListener("pointerup", up, { once: true });
    window.addEventListener("pointercancel", () => { setDrag(null); setOverTeam(null); }, { once: true });
    return () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); };
  }, [drag]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!data) return <div className="py-8 text-center text-sm text-gray-400">Loading teams…</div>;
  const teams = data.teams || [];
  const unassigned = data.unassigned || [];

  const Player = ({ a, teamId }) => (
    <div className={`flex items-center gap-2 bg-white border rounded-lg px-2.5 py-1.5 text-sm ${drag?.athleteId === a.id ? "opacity-40 border-accent" : "border-gray-200 hover:border-accent/40"}`}>
      <span onPointerDown={startDrag(a)} className="flex-shrink-0 cursor-grab active:cursor-grabbing touch-none text-gray-300 hover:text-gray-500 -m-1 p-1" title="Drag to a team">
        <GripVertical size={14} />
      </span>
      <span className="font-mono text-xs text-gray-400 w-6">{a.jersey_number ?? ""}</span>
      <span className="truncate flex-1 text-gray-700">{nameOf(a)}</span>
      <span className={`text-[10px] px-1.5 py-0.5 rounded font-semibold ${posShort(a.position) === "D" ? "bg-purple-100 text-purple-700" : "bg-blue-100 text-blue-700"}`}>{posShort(a.position)}</span>
      <select
        value={teamId ?? ""}
        onChange={(e) => { const v = e.target.value; if (v) post({ action: "move_player", athlete_id: a.id, to_team_id: parseInt(v) }); }}
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
      <div className="flex items-center gap-3 flex-wrap bg-gray-50 border border-gray-200 rounded-xl px-4 py-3">
        <span className="text-xs font-medium text-gray-500">Teams:</span>
        <select value={count} onChange={(e) => setCount(Number(e.target.value))} className="px-2 py-1 border border-gray-300 rounded-lg text-sm bg-white">
          {[2, 3, 4, 5, 6].map(n => <option key={n} value={n}>{n}</option>)}
        </select>
        <button onClick={() => post({ action: "seed", mode: "alphabetical", count })} disabled={busy} className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 bg-accent text-white rounded-lg font-semibold disabled:opacity-50">
          {busy ? <Loader2 size={13} className="animate-spin" /> : <Shuffle size={13} />} Seed alphabetically
        </button>
        <button onClick={() => post({ action: "seed", mode: "even", count })} disabled={busy} className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 border border-gray-300 text-gray-700 rounded-lg font-medium hover:bg-gray-50 disabled:opacity-50">
          Even split (by #)
        </button>
        <button onClick={applyMatchups} disabled={busy} className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 border border-accent text-accent rounded-lg font-semibold hover:bg-accent-soft disabled:opacity-50">
          Apply to schedule
        </button>
        <span className="text-[11px] text-gray-400">Drag the grip handle to a team (or use the dropdown), then Apply.</span>
        {applied && <span className="text-[11px] text-gray-500 w-full">Filled {applied.applied} upcoming game{applied.applied === 1 ? "" : "s"}{applied.skipped ? ` · ${applied.skipped} already played/unresolved` : ""}.</span>}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {teams.map(team => {
          const d = team.members.filter(m => posShort(m.position) === "D").length;
          const f = team.members.length - d;
          return (
            <div key={team.id} data-teamid={team.id}
              className={`bg-white border rounded-xl p-3 min-h-[120px] transition-colors ${overTeam === team.id ? "border-accent ring-2 ring-accent/30 bg-accent-soft/40" : drag ? "border-dashed border-accent/40" : "border-gray-200"}`}>
              <div className="flex items-center justify-between mb-2">
                <h4 className="text-sm font-bold text-ink">{team.name}</h4>
                <span className="text-[11px] text-gray-400">{team.members.length} · {f}F/{d}D</span>
              </div>
              <div className="space-y-1.5">
                {team.members.map(a => <Player key={a.id} a={a} teamId={team.id} />)}
                {team.members.length === 0 && <div className="text-xs text-gray-300 text-center py-4">{drag ? "Drop here" : "No players"}</div>}
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

      {/* Floating drag chip following the pointer */}
      {drag && (
        <div className="fixed z-[60] pointer-events-none px-2.5 py-1.5 bg-white border-2 border-accent rounded-lg text-sm font-medium text-ink shadow-lg"
          style={{ left: ghostPos.x + 10, top: ghostPos.y + 10 }}>
          {drag.name}
        </div>
      )}
    </div>
  );
}
