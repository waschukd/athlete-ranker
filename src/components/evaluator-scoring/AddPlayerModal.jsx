"use client";

import { useState } from "react";
import { X } from "lucide-react";

// Add an on-ice player who was never checked in -- creates the athlete (if
// new), drops them into this game's group, and checks them in via the same
// add_player action the volunteer check-in screen uses, so they show up in
// the roster immediately, ready to score.
export default function AddPlayerModal({ scheduleId, teamColors, onAdded, onClose }) {
  const [form, setForm] = useState({ first_name: "", last_name: "", jersey_number: "", team_color: "White" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const submit = async () => {
    setSaving(true); setError("");
    try {
      const res = await fetch(`/api/checkin/${scheduleId}`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "add_player",
          first_name: form.first_name.trim(),
          last_name: form.last_name.trim(),
          jersey_number: form.jersey_number ? parseInt(form.jersey_number) : null,
          team_color: form.team_color,
        }),
      });
      const d = await res.json();
      if (!res.ok || !d.success) { setError(d.error || "Couldn't add player — try again."); setSaving(false); return; }
      await onAdded();
      setForm({ first_name: "", last_name: "", jersey_number: "", team_color: "White" });
      onClose();
    } catch { setError("Network error — try again."); }
    setSaving(false);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-end md:items-center justify-center" onClick={() => !saving && onClose()}>
      <div className="bg-white rounded-t-2xl md:rounded-2xl w-full md:max-w-sm max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="sticky top-0 bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between">
          <h3 className="font-display font-bold text-ink">Add player</h3>
          <button onClick={onClose} disabled={saving} className="p-1 text-gray-400 hover:text-gray-600 disabled:opacity-40"><X size={18} /></button>
        </div>
        <div className="p-4 space-y-3">
          <p className="text-xs text-gray-400">For a player who's on the ice but never got checked in — adds them to this roster and checks them in so they're ready to score.</p>
          <div className="grid grid-cols-2 gap-2">
            <input value={form.first_name} onChange={e => setForm(f => ({ ...f, first_name: e.target.value }))} placeholder="First name" autoFocus className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent/30" />
            <input value={form.last_name} onChange={e => setForm(f => ({ ...f, last_name: e.target.value }))} placeholder="Last name" className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent/30" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <input value={form.jersey_number} onChange={e => setForm(f => ({ ...f, jersey_number: e.target.value.replace(/\D/g, "") }))} inputMode="numeric" placeholder="Jersey #" className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent/30" />
            <select value={form.team_color} onChange={e => setForm(f => ({ ...f, team_color: e.target.value }))} className="border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-accent/30">
              {teamColors.map(c => <option key={c.name} value={c.name}>{c.name}</option>)}
            </select>
          </div>
          {error && <p className="text-xs text-red-500">{error}</p>}
          <button
            disabled={saving || !form.first_name.trim() || !form.last_name.trim()}
            onClick={submit}
            className="w-full py-2.5 bg-accent text-white rounded-lg text-sm font-semibold disabled:opacity-40">
            {saving ? "Adding…" : "Add & check in"}
          </button>
        </div>
      </div>
    </div>
  );
}
