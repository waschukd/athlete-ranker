"use client";

import { useState, useEffect, useCallback } from "react";
import { Users, Shuffle, Loader2, GripVertical } from "lucide-react";

// Pre-Session-1 team assignment for a round-robin category. Seed teams without
// scores (alphabetical or even), then drag players between teams to adjust —
// reuses the same drag idiom as the final Team Builder. Only rendered when the
// category's eval_format = 'round_robin'.
const posShort = (p) => { const s = (p || "").toLowerCase(); return s.startsWith("d") ? "D" : s.startsWith("g") ? "G" : "F"; };
const nameOf = (a) => `${a.first_name || ""} ${a.last_name || ""}`.trim() || `#${a.jersey_number ?? "?"}`;

export default function ScrimmageTeams({ catId }) {
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(false);
  const [count, setCount] = useState(3);
  const [drag, setDrag] = useState(null); // { athlete_id }

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

  const onDropTo = (teamId) => (e) => {
    e.preventDefault();
    const athleteId = drag?.athlete_id || parseInt(e.dataTransfer.getData("athlete_id"));
    if (athleteId) post({ action: "move_player", athlete_id: athleteId, to_team_id: teamId });
    setDrag(null);
  };

  if (!data) return <div className="py-8 text-center text-sm text-gray-400">Loading teams…</div>;
  const teams = data.teams || [];
  const unassigned = data.unassigned || [];

  const Player = ({ a, from }) => (
    <div draggable
      onDragStart={(e) => { setDrag({ athlete_id: a.id }); e.dataTransfer.setData("athlete_id", String(a.id)); }}
      className="flex items-center gap-2 bg-white border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm cursor-grab active:cursor-grabbing hover:border-accent/40">
      <GripVertical size={13} className="text-gray-300 flex-shrink-0" />
      <span className="font-mono text-xs text-gray-400 w-6">{a.jersey_number ?? ""}</span>
      <span className="truncate flex-1 text-gray-700">{nameOf(a)}</span>
      <span className={`text-[10px] px-1.5 py-0.5 rounded font-semibold ${posShort(a.position) === "D" ? "bg-purple-100 text-purple-700" : "bg-blue-100 text-blue-700"}`}>{posShort(a.position)}</span>
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
        <span className="text-[11px] text-gray-400">Then drag players between teams to adjust.</span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {teams.map(team => {
          const d = team.members.filter(m => posShort(m.position) === "D").length;
          const f = team.members.length - d;
          return (
            <div key={team.id} onDragOver={(e) => e.preventDefault()} onDrop={onDropTo(team.id)}
              className="bg-white border border-gray-200 rounded-xl p-3 min-h-[120px]">
              <div className="flex items-center justify-between mb-2">
                <h4 className="text-sm font-bold text-ink">{team.name}</h4>
                <span className="text-[11px] text-gray-400">{team.members.length} · {f}F/{d}D</span>
              </div>
              <div className="space-y-1.5">
                {team.members.map(a => <Player key={a.id} a={a} from={team.id} />)}
                {team.members.length === 0 && <div className="text-xs text-gray-300 text-center py-4">Drop players here</div>}
              </div>
            </div>
          );
        })}
      </div>

      {unassigned.length > 0 && (
        <div onDragOver={(e) => e.preventDefault()} onDrop={onDropTo(null)} className="bg-amber-50/40 border border-amber-200 rounded-xl p-3">
          <div className="flex items-center gap-2 mb-2"><Users size={14} className="text-amber-600" /><h4 className="text-sm font-semibold text-amber-800">Unassigned ({unassigned.length})</h4></div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-1.5">
            {unassigned.map(a => <Player key={a.id} a={a} from={null} />)}
          </div>
        </div>
      )}
      {teams.length === 0 && <div className="py-8 text-center text-sm text-gray-400">Pick a team count and seed to get started.</div>}
    </div>
  );
}
