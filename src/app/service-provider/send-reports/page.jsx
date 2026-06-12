"use client";

import { useState, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { ArrowLeft, Mail, Send } from "lucide-react";
import { useTheme } from "@/lib/useTheme";
import ThemeToggle from "@/components/ThemeToggle";

function SendInner() {
  const searchParams = useSearchParams();
  const catId = searchParams.get("cat");
  const [theme, toggleTheme] = useTheme();
  const [info, setInfo] = useState(null);
  const [spName, setSpName] = useState("");
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState(null);

  useEffect(() => {
    if (!catId) return;
    fetch(`/api/categories/${catId}/send-reports`).then(r => r.json()).then(setInfo);
  }, [catId]);

  const send = async () => {
    if (!confirm(`Email ${info?.with_email ?? "all"} parents a link to their child's report? This sends real emails.`)) return;
    setSending(true); setResult(null);
    const res = await fetch(`/api/categories/${catId}/send-reports`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ spName }),
    });
    setResult(await res.json());
    setSending(false);
  };

  const priceStr = info?.price_cents ? `$${(info.price_cents / 100).toFixed(2)}` : "$24.99";

  return (
    <div className="min-h-screen bg-gray-50" data-theme={theme}>
      <div className="bg-white border-b border-gray-200 shadow-sm">
        <div className="max-w-2xl mx-auto px-4 sm:px-6 py-5 flex items-center justify-between flex-wrap gap-3">
          <div>
            <button onClick={() => window.history.back()} className="inline-flex items-center gap-1.5 font-display text-xs font-bold tracking-[0.2em] uppercase text-accent hover:opacity-70 mb-1">
              <ArrowLeft size={13} /> Service Provider · Reports
            </button>
            <h1 className="font-display font-black tracking-tight text-ink text-3xl sm:text-4xl leading-none flex items-center gap-3">
              <Mail size={26} className="text-accent" /> Send Reports to Parents
            </h1>
          </div>
          <ThemeToggle theme={theme} onToggle={toggleTheme} />
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 sm:px-6 py-8 space-y-6">
        {!catId && <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-700">Add <code>?cat=&lt;category id&gt;</code> to the URL.</div>}

        <div className="bg-white border border-gray-200 rounded-2xl p-5">
          <p className="text-sm text-gray-600 mb-4">
            Each parent with an email on file gets a link to <b>their own child's</b> report — a free preview, with the full report unlockable for <b>{priceStr}</b>. {info && <>This will email <b>{info.with_email}</b> parent{info.with_email === 1 ? "" : "s"} in <b>{info.org_name}</b>.</>}
          </p>
          <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Service provider name (for "on behalf of")</label>
          <input value={spName} onChange={e => setSpName(e.target.value)} placeholder="e.g. Competitive Thread"
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-accent mb-4" />
          <button onClick={send} disabled={sending || !info?.with_email}
            className="inline-flex items-center gap-1.5 px-5 py-2.5 bg-accent text-white rounded-lg text-sm font-semibold hover:shadow-md disabled:opacity-50">
            <Send size={15} /> {sending ? "Sending…" : `Email ${info?.with_email ?? ""} parents`}
          </button>
          <p className="text-xs text-gray-400 mt-3">
            Preview the email parents receive:{" "}
            <a href="/email-preview/parent-report" target="_blank" rel="noreferrer" className="text-accent hover:underline">open sample</a>.
          </p>
        </div>

        {result && (
          <div className={`rounded-2xl p-5 ${result.success ? "bg-green-50 border border-green-200" : "bg-red-50 border border-red-200"}`}>
            {result.success ? (
              <div className="text-sm text-green-800">
                Sent <b>{result.sent}</b> of {result.total}.{result.skipped ? ` ${result.skipped} skipped (email not configured).` : ""}{result.failed ? ` ${result.failed} failed.` : ""}
              </div>
            ) : (
              <div className="text-sm text-red-700">{result.error || "Something went wrong."}</div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default function SendReportsPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-gray-50 flex items-center justify-center" data-theme="premium-light"><div className="animate-spin rounded-full h-10 w-10 border-b-2 border-[#0b5cd6]" /></div>}>
      <SendInner />
    </Suspense>
  );
}
