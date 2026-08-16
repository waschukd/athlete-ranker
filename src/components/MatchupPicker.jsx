"use client";

import { useState } from "react";
import { Check, X } from "lucide-react";

// Tournament-format only: pick which two teams play a given game. Writes a
// canonical "TeamA vs TeamB" label via the schedule PATCH, which resolves
// into that game's roster server-side (applyMatchup).
export default function MatchupPicker({ entry, teams, catId, onSaved }) {
  const [editing, setEditing] = useState(false);
  const [a, setA] = useState("");
  const [b, setB] = useState("");
  const [saving, setSaving] = useState(false);
  const teamLabel = (name) => String(name || "").replace(/^team\s+/i, "").trim() || name;

  const startEdit = () => {
    // Best-effort preselect: if the current matchup text names two teams that
    // still exist under those names, default the pickers to them.
    const found = teams.filter(t => (entry.matchup || "").toLowerCase().includes(String(t.name).toLowerCase()));
    setA(found[0]?.id ? String(found[0].id) : "");
    setB(found[1]?.id ? String(found[1].id) : "");
    setEditing(true);
  };

  const save = async () => {
    if (!a || !b || a === b) return;
    setSaving(true);
    const teamA = teams.find(t => String(t.id) === a);
    const teamB = teams.find(t => String(t.id) === b);
    const matchup = teamA && teamB ? `${teamA.name} vs ${teamB.name}` : null;
    try {
      await fetch(`/api/categories/${catId}/schedule`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: entry.id, matchup }),
      });
      onSaved?.();
    } finally { setSaving(false); setEditing(false); }
  };

  if (!editing) {
    return (
      <button onClick={startEdit} className="text-left hover:opacity-70" title="Set which teams play this game">
        {entry.matchup
          ? <span className="text-sm font-medium text-ink">{entry.matchup}</span>
          : <span className="text-xs text-gray-400 italic">Set matchup…</span>}
      </button>
    );
  }
  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      <select value={a} onChange={e => setA(e.target.value)} className="text-xs border border-gray-200 rounded px-1.5 py-1 bg-white">
        <option value="">Team…</option>
        {teams.map(t => <option key={t.id} value={t.id} disabled={String(t.id) === b}>{teamLabel(t.name)}</option>)}
      </select>
      <span className="text-xs text-gray-400">vs</span>
      <select value={b} onChange={e => setB(e.target.value)} className="text-xs border border-gray-200 rounded px-1.5 py-1 bg-white">
        <option value="">Team…</option>
        {teams.map(t => <option key={t.id} value={t.id} disabled={String(t.id) === a}>{teamLabel(t.name)}</option>)}
      </select>
      <button onClick={save} disabled={!a || !b || a === b || saving} className="text-accent disabled:opacity-40" title="Save"><Check size={14} /></button>
      <button onClick={() => setEditing(false)} className="text-gray-400 hover:text-gray-600" title="Cancel"><X size={14} /></button>
    </div>
  );
}
