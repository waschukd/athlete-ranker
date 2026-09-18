"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { FileText, X, Loader2, Send, DollarSign, Receipt, Settings } from "lucide-react";

// Self-service home for the Development Report. As evaluations wind down,
// directors need to send the purchase link out fast -- so the ready-to-send
// categories are inline on the dashboard's right rail, one click, no modal.
// Price and purchase tracking are secondary and stay behind a small settings
// modal opened from the card header.
export default function EndOfEvalReportsCard({ orgId }) {
  const queryClient = useQueryClient();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [sendingId, setSendingId] = useState(null);
  const [sendMsg, setSendMsg] = useState({});

  const { data: settings, isLoading } = useQuery({
    queryKey: ["report-settings", orgId],
    queryFn: async () => {
      const res = await fetch(`/api/organizations/${orgId}/report-settings`);
      return res.json();
    },
  });

  const sendReports = async (catId) => {
    setSendingId(catId);
    try {
      const res = await fetch(`/api/categories/${catId}/send-reports`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
      const data = await res.json();
      setSendMsg(m => ({ ...m, [catId]: data.success ? `Sent to ${data.sent} of ${data.total}.` : (data.error || "Failed.") }));
    } catch { setSendMsg(m => ({ ...m, [catId]: "Failed." })); }
    setSendingId(null);
  };

  // Manual, per-category confirmation -- deliberately not inferred from
  // anything in-app, since some associations build their real rosters in a
  // separate tool entirely and this app has no way to know that's done.
  const toggleFinalized = async (catId, finalized) => {
    await fetch(`/api/categories/${catId}/teams-finalized`, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ finalized }),
    });
    queryClient.invalidateQueries({ queryKey: ["report-settings", orgId] });
  };

  // Only categories with something to actually report on -- and ready
  // (finalized + has scores) ones first, so a director scanning this at a
  // glance sees who they can send to right now.
  const evaluated = (settings?.categories || []).filter(c => c.has_scores);
  const ready = (c) => c.has_scores && !!c.teams_finalized_at;
  const sortedCats = [...evaluated].sort((a, b) => (ready(b) - ready(a)));

  return (
    <>
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-2">
          <FileText size={15} className="text-accent" />
          <h3 className="font-display font-bold text-ink text-sm">Send Report Purchase</h3>
          <button onClick={() => setSettingsOpen(true)} title="Price & tracking" className="ml-auto text-gray-400 hover:text-accent">
            <Settings size={15} />
          </button>
        </div>
        {isLoading || !settings ? (
          <div className="py-8 px-5 text-center text-sm text-gray-400">Loading…</div>
        ) : sortedCats.length === 0 ? (
          <div className="py-8 px-5 text-center text-sm text-gray-400">Once a category has scores, it shows up here to send.</div>
        ) : (
          <div className="divide-y divide-gray-100">
            {sortedCats.map(cat => {
              const finalized = !!cat.teams_finalized_at;
              const canSend = cat.has_scores && finalized;
              return (
                <div key={cat.id} className="px-5 py-3">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold text-ink truncate flex-1 min-w-0">{cat.name}</p>
                    <button
                      onClick={() => sendReports(cat.id)}
                      disabled={!canSend || sendingId === cat.id}
                      title={!finalized ? "Mark teams finalized first" : "Email every parent a report link"}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-accent text-white rounded-lg text-xs font-semibold disabled:opacity-40 whitespace-nowrap"
                    >
                      {sendingId === cat.id ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />} Send
                    </button>
                  </div>
                  {finalized ? (
                    sendMsg[cat.id] && <p className="text-xs text-accent mt-1">{sendMsg[cat.id]}</p>
                  ) : (
                    <button onClick={() => toggleFinalized(cat.id, true)} className="text-[11px] font-semibold text-amber-600 hover:opacity-70 mt-1">
                      Teams not finalized yet — click to confirm they're set →
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
      {settingsOpen && <ReportSettingsModal orgId={orgId} onClose={() => setSettingsOpen(false)} />}
    </>
  );
}

function ReportSettingsModal({ orgId, onClose }) {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState("price"); // price | track
  const [priceDraft, setPriceDraft] = useState("");
  const [savingPrice, setSavingPrice] = useState(false);
  const [priceMsg, setPriceMsg] = useState("");

  const { data: settings, isLoading } = useQuery({
    queryKey: ["report-settings", orgId],
    queryFn: async () => {
      const res = await fetch(`/api/organizations/${orgId}/report-settings`);
      return res.json();
    },
  });

  const { data: tracker } = useQuery({
    queryKey: ["report-purchases", orgId],
    queryFn: async () => {
      const res = await fetch(`/api/organizations/${orgId}/report-purchases`);
      return res.json();
    },
    enabled: tab === "track",
  });

  const fmt = (cents) => `$${((cents || 0) / 100).toFixed(2)}`;

  // Live preview as they type, using the same math the server enforces —
  // so what they see here is exactly what they'll actually net.
  const previewCents = (() => {
    const dollars = parseFloat(priceDraft);
    if (!Number.isFinite(dollars) || dollars <= 0 || !settings) return null;
    const price = Math.round(dollars * 100);
    const remainder = price - settings.spFlatFeeCents;
    if (remainder <= 0) return 0;
    return Math.max(0, remainder - Math.min(settings.associationTxFeeCents, remainder));
  })();

  const savePrice = async () => {
    const dollars = parseFloat(priceDraft);
    if (!Number.isFinite(dollars) || dollars <= 0) return;
    setSavingPrice(true);
    setPriceMsg("");
    try {
      const res = await fetch(`/api/organizations/${orgId}/report-settings`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ price_cents: Math.round(dollars * 100) }),
      });
      const data = await res.json();
      if (data.success) { setPriceMsg("Price saved."); queryClient.invalidateQueries({ queryKey: ["report-settings", orgId] }); }
      else setPriceMsg(data.error || "Couldn't save.");
    } catch { setPriceMsg("Couldn't save."); }
    setSavingPrice(false);
  };

  const togglePurchasing = async (enabled) => {
    await fetch(`/api/organizations/${orgId}/report-settings`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ purchasing_enabled: enabled }),
    });
    queryClient.invalidateQueries({ queryKey: ["report-settings", orgId] });
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 flex-shrink-0">
          <h2 className="font-display font-bold text-ink">Report Price & Tracking</h2>
          <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>

        <div className="flex border-b border-gray-100 flex-shrink-0">
          {[["price", "Price", DollarSign], ["track", "Track", Receipt]].map(([id, label, Icon]) => (
            <button key={id} onClick={() => setTab(id)} className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 text-sm font-semibold border-b-2 -mb-px transition-colors ${tab === id ? "border-accent text-ink" : "border-transparent text-gray-400 hover:text-gray-600"}`}>
              <Icon size={13} /> {label}
            </button>
          ))}
        </div>

        <div className="p-5 overflow-y-auto">
          {isLoading || !settings ? (
            <div className="py-10 text-center text-sm text-gray-400">Loading…</div>
          ) : tab === "price" ? (
            <div className="space-y-4">
              {!settings.granted ? (
                <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 text-sm text-gray-600">
                  Your provider sets this at <b className="text-ink">{fmt(settings.defaultPriceCents)}</b> — you haven't been given control to set your own price. Contact them if you'd like to.
                </div>
              ) : (
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1.5">Your report price</label>
                  <div className="flex items-center gap-2">
                    <div className="relative flex-1">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
                      <input
                        type="number" step="0.01" min="0"
                        placeholder={(settings.priceCents / 100).toFixed(2)}
                        value={priceDraft}
                        onChange={e => setPriceDraft(e.target.value)}
                        className="w-full pl-6 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-accent/30"
                      />
                    </div>
                    <button onClick={savePrice} disabled={savingPrice || !priceDraft} className="px-4 py-2 bg-accent text-white rounded-lg text-sm font-semibold disabled:opacity-50 whitespace-nowrap">
                      {savingPrice ? <Loader2 size={14} className="animate-spin" /> : "Save"}
                    </button>
                  </div>
                  {priceMsg && <p className="text-xs text-gray-500 mt-1.5">{priceMsg}</p>}
                  <div className="mt-3 bg-accent-soft border border-accent/20 rounded-xl p-3.5 text-sm">
                    <p className="text-gray-600">Currently: <b className="text-ink">{fmt(settings.priceCents)}</b> per report</p>
                    <p className="text-gray-500 text-xs mt-1">Your provider keeps {fmt(settings.spFlatFeeCents)} flat, you cover a {fmt(settings.associationTxFeeCents)} transaction fee, you keep the rest.</p>
                    <p className="text-ink font-bold mt-2">
                      Your take: {fmt(previewCents ?? settings.associationAmountCents)} {previewCents != null ? "per report at that price" : "per report right now"}
                    </p>
                  </div>
                </div>
              )}
              <div className="flex items-center justify-between pt-2 border-t border-gray-100">
                <div>
                  <p className="text-sm font-medium text-ink">Purchasing enabled</p>
                  <p className="text-xs text-gray-400">Turn off to hide the buy button — parents still see the free preview.</p>
                </div>
                <button onClick={() => togglePurchasing(!settings.purchasingEnabled)} className={`w-11 h-6 rounded-full transition-colors flex-shrink-0 ${settings.purchasingEnabled ? "bg-accent" : "bg-gray-300"}`}>
                  <span className={`block w-5 h-5 bg-white rounded-full shadow transform transition-transform ${settings.purchasingEnabled ? "translate-x-5" : "translate-x-0.5"}`} />
                </button>
              </div>
            </div>
          ) : (
            <div>
              {!tracker ? (
                <div className="py-10 text-center text-sm text-gray-400">Loading…</div>
              ) : tracker.purchases.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-6">No reports purchased yet.</p>
              ) : (
                <>
                  <div className="flex items-center gap-4 mb-3 text-sm">
                    <span className="text-gray-500">{tracker.totalCompleted} purchased</span>
                    {settings?.granted && <span className="text-ink font-semibold">{fmt(tracker.totalAssociationCents)} your take</span>}
                  </div>
                  <div className="divide-y divide-gray-100 border border-gray-200 rounded-xl overflow-hidden">
                    {tracker.purchases.map(p => (
                      <div key={p.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                        <div className="flex-1 min-w-0">
                          <p className="text-ink font-medium truncate">{p.athlete_name}</p>
                          <span className="inline-block mt-0.5 px-1.5 py-0.5 bg-accent-soft text-accent text-[11px] font-semibold rounded truncate max-w-full">{p.category_name || "Unknown age group"}</span>
                        </div>
                        <div className="text-right flex-shrink-0">
                          <p className={`font-semibold ${p.status === "completed" ? "text-ink" : "text-gray-400"}`}>{fmt(p.amount_cents)}</p>
                          <p className="text-xs text-gray-400">{p.status}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
