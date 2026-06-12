"use client";

import { useState, useEffect } from "react";
import { ArrowLeft, Gift, Save } from "lucide-react";
import { useTheme } from "@/lib/useTheme";
import ThemeToggle from "@/components/ThemeToggle";

const money = (cents) => `$${((cents || 0) / 100).toFixed(2)}`;

export default function BonusPage() {
  const [theme, toggleTheme] = useTheme();
  const [data, setData] = useState(null);
  const [rateDollars, setRateDollars] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const load = () => fetch("/api/service-provider/bonus-summary").then(r => r.json()).then(d => {
    setData(d);
    if (d?.note_bonus_cents != null) setRateDollars((d.note_bonus_cents / 100).toFixed(2));
  });
  useEffect(() => { load(); }, []);

  const save = async () => {
    setSaving(true); setSaved(false);
    const cents = Math.max(0, Math.round(parseFloat(rateDollars || "0") * 100));
    const res = await fetch("/api/service-provider/bonus-config", {
      method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ note_bonus_cents: cents }),
    });
    if (res.ok) { setSaved(true); await load(); }
    setSaving(false);
  };

  return (
    <div className="min-h-screen bg-gray-50" data-theme={theme}>
      <div className="bg-white border-b border-gray-200 shadow-sm">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-5 flex items-center justify-between flex-wrap gap-3">
          <div>
            <button onClick={() => window.history.back()} className="inline-flex items-center gap-1.5 font-display text-xs font-bold tracking-[0.2em] uppercase text-accent hover:opacity-70 mb-1">
              <ArrowLeft size={13} /> Service Provider · Bonuses
            </button>
            <h1 className="font-display font-black tracking-tight text-ink text-3xl sm:text-4xl leading-none flex items-center gap-3">
              <Gift size={26} className="text-accent" /> Report Comment Bonus
            </h1>
          </div>
          <ThemeToggle theme={theme} onToggle={toggleTheme} />
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8 space-y-6">
        {/* Rate setter */}
        <div className="bg-white border border-gray-200 rounded-2xl p-5">
          <h3 className="text-sm font-semibold text-gray-900 mb-1">Bonus per note</h3>
          <p className="text-xs text-gray-400 mb-4">Pay each evaluator a flat amount for every note they wrote that appears in a report a parent purchased. Set to $0 to turn it off.</p>
          <div className="flex items-center gap-3 flex-wrap">
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">$</span>
              <input value={rateDollars} onChange={e => { setRateDollars(e.target.value); setSaved(false); }} inputMode="decimal"
                className="w-32 pl-7 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-accent" placeholder="0.00" />
            </div>
            <span className="text-sm text-gray-400">per note</span>
            <button onClick={save} disabled={saving}
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-accent text-white rounded-lg text-sm font-semibold hover:shadow-md disabled:opacity-50">
              <Save size={14} /> {saving ? "Saving…" : "Save rate"}
            </button>
            {saved && <span className="text-sm text-green-600">Saved</span>}
          </div>
        </div>

        {/* Per-evaluator breakdown */}
        <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-900">Earned by evaluator</h3>
            {data && <div className="text-sm text-gray-500">Total: <b className="text-gray-900">{money(data.total_bonus_cents)}</b> · {data.total_eligible_notes} notes in sold reports</div>}
          </div>
          {!data ? (
            <div className="p-8 text-center text-gray-400 text-sm">Loading…</div>
          ) : (data.evaluators || []).length === 0 ? (
            <div className="p-8 text-center text-gray-400 text-sm">No evaluators with notes in sold reports yet.</div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 text-xs text-gray-400 uppercase tracking-wide">
                  <th className="text-left px-5 py-2.5 font-semibold">Evaluator</th>
                  <th className="text-right px-5 py-2.5 font-semibold">Notes in sold reports</th>
                  <th className="text-right px-5 py-2.5 font-semibold">Bonus</th>
                </tr>
              </thead>
              <tbody>
                {data.evaluators.map(e => (
                  <tr key={e.id} className="border-t border-gray-50">
                    <td className="px-5 py-3 text-gray-900 font-medium">{e.name}</td>
                    <td className="px-5 py-3 text-right text-gray-600">{e.eligible_notes}</td>
                    <td className="px-5 py-3 text-right font-semibold text-gray-900">{money(e.bonus_cents)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        <p className="text-xs text-gray-400">A note counts once it appears in a report a parent has purchased. Counts update automatically as reports sell. Payout to evaluators is handled outside the app for now.</p>
      </div>
    </div>
  );
}
