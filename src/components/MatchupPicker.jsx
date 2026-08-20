"use client";

import { useState } from "react";
import { Check, X } from "lucide-react";

// Lets a director create teams inline, right from an unresolved matchup, so
// "we know we're running 4 teams, just haven't set up the schedule yet"
// doesn't require a detour to the Teams tab before they can even start
// picking who plays who.
function InlineCreateTeams({ catId, onCreated }) {
  const [count, setCount] = useState(4);
  const [busy, setBusy] = useState(false);
  const create = async () => {
    setBusy(true);
    try {
      await fetch(`/api/categories/${catId}/scrimmage-teams`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "create", count }),
      });
      onCreated?.();
    } finally { setBusy(false); }
  };
  return (
    <div className="inline-flex items-center gap-1.5 flex-wrap">
      <span className="text-xs text-gray-400">No teams yet —</span>
      <select value={count} onChange={e => setCount(Number(e.target.value))} disabled={busy} className="text-xs border border-gray-200 rounded px-1.5 py-1 bg-white">
        {[2, 3, 4, 5, 6].map(n => <option key={n} value={n}>{n} teams</option>)}
      </select>
      <button onClick={create} disabled={busy} className="text-xs px-2.5 py-1 bg-accent text-white rounded-lg font-semibold disabled:opacity-50">{busy ? "Creating…" : "Create"}</button>
    </div>
  );
}

// Tournament-format only: pick which two teams play a given game. Writes a
// canonical "TeamA vs TeamB" label via the schedule PATCH, which resolves
// into that game's roster server-side (applyMatchup).
export default function MatchupPicker({ entry, teams, catId, onSaved, onTeamsChanged }) {
  const [editing, setEditing] = useState(false);
  const [a, setA] = useState("");
  const [b, setB] = useState("");
  const [saving, setSaving] = useState(false);
  const teamLabel = (name) => String(name || "").replace(/^team\s+/i, "").trim() || name;

  // Whether the stored matchup text ("A vs B") still names two teams that
  // exist under those names — if a team was renamed since the label was
  // written (e.g. imported as "A vs B", then renamed to "1"/"2"), it won't,
  // and the picker needs re-resolving even though matchup text is present.
  const resolvedTeams = teams.filter(t => (entry.matchup || "").toLowerCase().includes(String(t.name).toLowerCase()));
  const needsResolve = !!entry.matchup && resolvedTeams.length < 2;

  const startEdit = () => {
    setA(resolvedTeams[0]?.id ? String(resolvedTeams[0].id) : "");
    setB(resolvedTeams[1]?.id ? String(resolvedTeams[1].id) : "");
    setEditing(true);
  };

  const save = async () => {
    if (!a || !b || a === b) return;
    setSaving(true);
    try {
      // Send team ids, not a client-built "A vs B" string -- the server
      // resolves the label from each team's current name (matchupLabel), so
      // it can't go stale if a team was renamed since this page loaded.
      await fetch(`/api/categories/${catId}/schedule`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: entry.id, team_a_id: a, team_b_id: b }),
      });
      onSaved?.();
    } finally { setSaving(false); setEditing(false); }
  };

  if (!editing) {
    return (
      <button onClick={startEdit} className="inline-flex items-center gap-1.5 text-left hover:opacity-70" title="Click to set which teams play this game">
        {entry.matchup && !needsResolve
          ? <span className="text-sm font-medium text-ink">{entry.matchup}</span>
          : needsResolve
          ? <span className="text-xs px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200 font-medium">{entry.matchup} · needs teams</span>
          : <span className="text-xs px-2 py-1 rounded border border-dashed border-accent/50 text-accent font-medium">+ Set matchup</span>}
      </button>
    );
  }
  if (!teams.length) {
    return <InlineCreateTeams catId={catId} onCreated={() => onTeamsChanged?.()} />;
  }
  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      <select value={a} onChange={e => setA(e.target.value)} autoFocus className="min-w-[110px] text-sm border-2 border-accent/40 rounded-lg px-2 py-1.5 bg-white text-ink font-medium focus:outline-none focus:border-accent">
        <option value="">Choose team</option>
        {teams.map(t => <option key={t.id} value={t.id} disabled={String(t.id) === b}>{teamLabel(t.name)}</option>)}
      </select>
      <span className="text-xs text-gray-400 font-semibold">vs</span>
      <select value={b} onChange={e => setB(e.target.value)} className="min-w-[110px] text-sm border-2 border-accent/40 rounded-lg px-2 py-1.5 bg-white text-ink font-medium focus:outline-none focus:border-accent">
        <option value="">Choose team</option>
        {teams.map(t => <option key={t.id} value={t.id} disabled={String(t.id) === a}>{teamLabel(t.name)}</option>)}
      </select>
      <button onClick={save} disabled={!a || !b || a === b || saving} className="p-1.5 rounded-lg bg-accent text-white disabled:opacity-40" title="Save"><Check size={14} /></button>
      <button onClick={() => setEditing(false)} className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100" title="Cancel"><X size={14} /></button>
    </div>
  );
}
