"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Star, ShieldCheck, X } from "lucide-react";
import { useTheme } from "@/lib/useTheme";
import ThemeToggle from "@/components/ThemeToggle";

// Standalone response page for a goalie SP's "connect to an existing association"
// request -- deliberately not under /association/dashboard or /goalie-provider,
// so it carries no branding/nav from either side. The invited admin signs in with
// their EXISTING account (nothing new to create) and approves or declines here.
function Inner() {
  const sp = useSearchParams();
  const token = sp.get("token");
  const [theme, toggleTheme] = useTheme();
  const [req, setReq] = useState(null);
  const [user, setUser] = useState(undefined); // undefined = loading, null = signed out
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [err, setErr] = useState(null);

  useEffect(() => {
    if (!token) { setErr("Missing link token."); return; }
    fetch(`/api/goalie-connect?token=${token}`).then(r => r.json()).then(d => {
      if (d.error) setErr(d.error); else setReq(d.request);
    }).catch(() => setErr("Couldn't load this request."));
    fetch("/api/auth/me").then(r => r.json()).then(d => setUser(d.user)).catch(() => setUser(null));
  }, [token]);

  const respond = async (action) => {
    setBusy(true); setErr(null);
    try {
      const res = await fetch("/api/goalie-connect", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, action }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok || d.error) setErr(d.error || "Something went wrong.");
      else setResult(d.outcome);
    } catch { setErr("Network error — please try again."); }
    setBusy(false);
  };

  const emailMatches = user && req && user.email?.toLowerCase() === req.invited_email?.toLowerCase();

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4" data-theme={theme}>
      <div className="absolute top-4 right-4"><ThemeToggle theme={theme} onToggle={toggleTheme} /></div>
      <div className="w-full max-w-md bg-white border border-gray-200 rounded-2xl p-7 shadow-sm">
        <div className="flex items-center gap-2 mb-5">
          <Star size={22} className="text-accent" />
          <span className="font-display text-xs font-bold tracking-[0.2em] uppercase text-accent">Goalie evaluation request</span>
        </div>

        {err && !req ? (
          <p className="text-sm text-red-600">{err}</p>
        ) : !req ? (
          <p className="text-sm text-gray-400">Loading…</p>
        ) : result ? (
          <div className="text-center py-4">
            {result === "approved" ? (
              <>
                <ShieldCheck size={36} className="mx-auto text-green-500 mb-3" />
                <h2 className="font-semibold text-ink mb-1">Connected</h2>
                <p className="text-sm text-gray-500">{req.sp_name} now handles goalie evaluations for {req.association_name}. Nothing about your skater programs changed.</p>
              </>
            ) : (
              <>
                <X size={36} className="mx-auto text-gray-300 mb-3" />
                <h2 className="font-semibold text-ink mb-1">Declined</h2>
                <p className="text-sm text-gray-500">No connection was made.</p>
              </>
            )}
          </div>
        ) : req.status !== "pending" ? (
          <p className="text-sm text-gray-500">This request was already {req.status}.</p>
        ) : (
          <>
            <h2 className="font-semibold text-ink text-lg mb-1">{req.sp_name} wants to connect</h2>
            <p className="text-sm text-gray-500 mb-5">as <strong className="text-ink">{req.association_name}</strong>'s goalie service provider — running goalie evaluations, scheduling, and rankings on your behalf. Your skater programs are unaffected either way.</p>

            {user === undefined ? (
              <p className="text-sm text-gray-400">Checking your sign-in…</p>
            ) : !emailMatches ? (
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
                <p className="text-sm text-amber-800 mb-3">Sign in as <strong>{req.invited_email}</strong> to respond to this request.</p>
                <a href={`/account/signin`} className="inline-block px-4 py-2 bg-accent text-white rounded-lg text-sm font-semibold hover:opacity-90">Sign in</a>
                <p className="text-xs text-amber-700 mt-2">After signing in, come back to this link to approve or decline.</p>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <button onClick={() => respond("approve")} disabled={busy} className="flex-1 inline-flex items-center justify-center gap-1.5 px-4 py-2.5 bg-accent text-white rounded-lg text-sm font-semibold disabled:opacity-40 hover:opacity-90">
                  <ShieldCheck size={15} /> Approve
                </button>
                <button onClick={() => respond("decline")} disabled={busy} className="flex-1 px-4 py-2.5 border border-gray-300 text-gray-600 rounded-lg text-sm font-medium disabled:opacity-40 hover:bg-gray-50">
                  Decline
                </button>
              </div>
            )}
            {err && <p className="text-xs font-medium text-red-500 mt-3">{err}</p>}
          </>
        )}
      </div>
    </div>
  );
}

export default function GoalieConnectRespondPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-gray-50" data-theme="premium" />}>
      <Inner />
    </Suspense>
  );
}
