"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { FileText, X, Loader2, Send, DollarSign, Receipt } from "lucide-react";

// Self-service home for the Development Report: set a price (if the SP has
// granted control), send the purchase link to parents per category, and
// track what's sold. Card lives on the association dashboard's right rail;
// everything else lives behind the modal it opens.
export default function EndOfEvalReportsCard({ orgId }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="w-full bg-white border border-gray-200 rounded-xl overflow-hidden text-left hover:border-accent/40 hover:shadow-sm transition-all"
      >
        <div className="px-5 py-4 flex items-center gap-2">
          <FileText size={15} className="text-accent" />
          <h3 className="font-display font-bold text-ink text-sm">End of Eval Reports</h3>
          <span className="ml-auto text-xs text-gray-400">Set price · Send · Track →</span>
        </div>
      </button>
      {open && <EndOfEvalReportsModal orgId={orgId} onClose={() => setOpen(false)} />}
    </>
  );
}

function EndOfEvalReportsModal({ orgId, onClose }) {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState("price"); // price | send | track
  const [priceDraft, setPriceDraft] = useState("");
  const [savingPrice, setSavingPrice] = useState(false);
  const [priceMsg, setPriceMsg] = useState("");
  const [sendingId, setSendingId] = useState(null);
  const [sendMsg, setSendMsg] = useState({});

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

  const sendReports = async (catId) => {
    setSendingId(catId);
    try {
      const res = await fetch(`/api/categories/${catId}/send-reports`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
      const data = await res.json();
      setSendMsg(m => ({ ...m, [catId]: data.success ? `Sent to ${data.sent} of ${data.total}.` : (data.error || "Failed.") }));
    } catch { setSendMsg(m => ({ ...m, [catId]: "Failed." })); }
    setSendingId(null);
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 flex-shrink-0">
          <h2 className="font-display font-bold text-ink">End of Eval Reports</h2>
          <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>

        <div className="flex border-b border-gray-100 flex-shrink-0">
          {[["price", "Price", DollarSign], ["send", "Send", Send], ["track", "Track", Receipt]].map(([id, label, Icon]) => (
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
          ) : tab === "send" ? (
            <div className="space-y-2">
              {settings.categories.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-6">No categories yet.</p>
              ) : settings.categories.map(cat => (
                <div key={cat.id} className="flex items-center gap-3 bg-gray-50 border border-gray-200 rounded-xl px-4 py-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-ink truncate">{cat.name}</p>
                    <p className="text-xs text-gray-400">{cat.has_scores ? "Has scores" : "No scores recorded yet"}</p>
                    {sendMsg[cat.id] && <p className="text-xs text-accent mt-0.5">{sendMsg[cat.id]}</p>}
                  </div>
                  <button
                    onClick={() => sendReports(cat.id)}
                    disabled={!cat.has_scores || sendingId === cat.id}
                    title={!cat.has_scores ? "No scores yet — nothing to report" : "Email every parent a report link"}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-accent text-white rounded-lg text-xs font-semibold disabled:opacity-40 whitespace-nowrap"
                  >
                    {sendingId === cat.id ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />} Send
                  </button>
                </div>
              ))}
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
                          <p className="text-xs text-gray-400 truncate">{p.category_name}</p>
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
