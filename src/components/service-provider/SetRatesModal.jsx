"use client";

import { useState } from "react";
import { X } from "lucide-react";

// Set hourly rates modal — batch editor for the full evaluator pool.
// evaluators: full list (all non-deleted/non-suspended as caller prefers)
// onClose: () => void
// onSaved: () => void  (caller refetches + shows banner)
export default function SetRatesModal({ evaluators, onClose, onSaved, postUrl = "/api/service-provider/evaluators", idKey = "evaluator_id", rateKey = "hourly_rate", title = "Evaluator hourly rates", noun = "evaluator" }) {
  // Seed local map: id (string) → input string value, from the chosen rate field
  // (hourly_rate for evaluators, tester_hourly_rate for testers).
  const [rates, setRates] = useState(() => {
    const m = {};
    for (const ev of evaluators) {
      m[String(ev.id)] = ev[rateKey] != null ? String(ev[rateKey]) : "";
    }
    return m;
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const inputCls = "w-24 border border-gray-300 rounded-lg px-2 py-1.5 text-sm text-right focus:outline-none focus:ring-2 focus:ring-accent/30";

  const save = async () => {
    setSaving(true);
    setError(null);
    // Only send rows where value changed vs. original
    const changed = evaluators
      .filter(ev => {
        const orig = ev[rateKey] != null ? String(ev[rateKey]) : "";
        return rates[String(ev.id)] !== orig;
      })
      .map(ev => ({
        [idKey]: ev.id,
        hourly_rate: rates[String(ev.id)] === "" ? null : parseFloat(rates[String(ev.id)]),
      }));
    if (changed.length === 0) { onClose(); return; }
    const res = await fetch(postUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "set_rates", rates: changed }),
    });
    const data = await res.json().catch(() => ({}));
    setSaving(false);
    if (!res.ok || data.error) { setError(data.error || "Failed to save rates"); return; }
    onSaved();
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={(e) => e.target === e.currentTarget && !saving && onClose()}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 flex flex-col" style={{ maxHeight: "90vh" }}>
        <div className="flex items-start justify-between mb-1 flex-shrink-0">
          <h3 className="font-display font-extrabold tracking-tight text-ink text-lg leading-tight">{title}</h3>
          <button onClick={onClose} disabled={saving} className="text-gray-400 hover:text-gray-600 disabled:opacity-50"><X size={18} /></button>
        </div>
        <p className="text-xs text-gray-400 mb-4 flex-shrink-0">Enter $/hour for each {noun}. Blank = no rate.</p>

        {evaluators.length === 0 ? (
          <p className="text-sm text-gray-400 py-4 text-center">No active {noun}s.</p>
        ) : (
          <div className="overflow-y-auto flex-1 divide-y divide-gray-100 -mx-6 px-6">
            {evaluators.map(ev => (
              <div key={ev.id} className="flex items-center justify-between py-2.5 gap-3">
                <div className="min-w-0">
                  <div className="text-sm font-medium text-ink truncate">{ev.name}</div>
                  <div className="text-xs text-gray-400 truncate">{ev.email}</div>
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  <span className="text-sm text-gray-400">$</span>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    inputMode="decimal"
                    value={rates[String(ev.id)]}
                    onChange={e => setRates(p => ({ ...p, [String(ev.id)]: e.target.value }))}
                    className={inputCls}
                    placeholder="—"
                  />
                </div>
              </div>
            ))}
          </div>
        )}

        {error && <p className="text-xs font-medium text-red-500 mt-3 flex-shrink-0">{error}</p>}

        <div className="flex gap-3 pt-4 flex-shrink-0">
          <button onClick={onClose} disabled={saving} className="flex-1 px-4 py-2 border border-gray-300 text-gray-600 rounded-lg text-sm disabled:opacity-50">Cancel</button>
          <button onClick={save} disabled={saving || evaluators.length === 0} className="flex-1 px-4 py-2 bg-accent text-white rounded-lg text-sm font-semibold hover:opacity-90 disabled:opacity-40">
            {saving ? "Saving…" : "Save all"}
          </button>
        </div>
      </div>
    </div>
  );
}
