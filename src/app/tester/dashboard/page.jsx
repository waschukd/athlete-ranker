"use client";

import { useState, useEffect, useCallback } from "react";
import { Calendar, Clock, MapPin, Check, Loader2, ClipboardList, Users } from "lucide-react";

const fmtDate = (d) => {
  if (!d) return "";
  const iso = d.toString().split("T")[0];
  const [y, m, dd] = iso.split("-").map(Number);
  if (!y) return iso;
  return new Date(y, m - 1, dd).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
};
const fmtTime = (t) => {
  if (!t) return "";
  const [h, m] = t.toString().split(":").map(Number);
  const ampm = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m || 0).padStart(2, "0")} ${ampm}`;
};

export default function TesterDashboard() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/tester/sessions");
      setData(await res.json());
    } catch { setData({ isTester: false, available: [], mine: [] }); }
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  const act = async (schedule_id, action) => {
    setBusyId(`${action}-${schedule_id}`);
    try {
      await fetch("/api/tester/sessions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ schedule_id, action }) });
      await load();
    } catch {}
    setBusyId(null);
  };

  const mine = data?.mine || [];
  const available = data?.available || [];

  const Card = ({ s, mineCard }) => {
    const filled = parseInt(s.testers_signed_up || 0);
    const need = parseInt(s.testers_required || 0);
    return (
      <div className="bg-white border border-gray-200 rounded-xl p-4 flex items-center gap-4 flex-wrap">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <span className="inline-block px-2.5 py-1 rounded-lg bg-accent-soft text-accent text-sm font-bold whitespace-nowrap">{fmtDate(s.scheduled_date)}</span>
            <span className="text-sm font-semibold text-ink truncate">{s.org_name}</span>
            {s.category_name && <span className="text-xs text-gray-500">· {s.category_name}</span>}
          </div>
          <div className="flex items-center gap-3 text-xs text-gray-500 flex-wrap">
            {s.start_time && <span className="flex items-center gap-1"><Clock size={11} />{fmtTime(s.start_time)}{s.end_time ? ` – ${fmtTime(s.end_time)}` : ""}</span>}
            {s.location && <span className="flex items-center gap-1"><MapPin size={11} />{s.location}</span>}
            {need > 0 && <span className="flex items-center gap-1"><Users size={11} />{filled}/{need} testers</span>}
          </div>
        </div>
        {mineCard ? (
          <button onClick={() => act(s.schedule_id, "cancel")} disabled={busyId === `cancel-${s.schedule_id}`}
            className="text-xs px-4 py-2 border border-red-200 text-red-500 rounded-lg font-medium hover:bg-red-50 disabled:opacity-50">
            {busyId === `cancel-${s.schedule_id}` ? "…" : "Cancel"}
          </button>
        ) : (
          <button onClick={() => act(s.schedule_id, "signup")} disabled={busyId === `signup-${s.schedule_id}`}
            className="inline-flex items-center gap-1.5 text-sm px-4 py-2 bg-gradient-to-r from-[#0b5cd6] to-[#3b82f6] text-white rounded-lg font-semibold hover:shadow-md disabled:opacity-50">
            {busyId === `signup-${s.schedule_id}` ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />} Sign up
          </button>
        )}
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-3xl mx-auto px-4 py-8">
        <div className="flex items-center gap-3 mb-1">
          <ClipboardList size={22} className="text-accent" />
          <h1 className="font-display text-2xl font-extrabold tracking-tight text-ink">Testing Sessions</h1>
        </div>
        <p className="text-sm text-gray-500 mb-6">Sign up for the testing sessions you'll run, and manage the ones you're on. Switch back to your other roles from the top bar.</p>

        {loading ? (
          <div className="py-16 text-center text-gray-400">Loading…</div>
        ) : !data?.isTester ? (
          <div className="py-14 text-center bg-white border border-dashed border-gray-200 rounded-2xl">
            <ClipboardList size={40} className="mx-auto text-gray-200 mb-3" />
            <h3 className="font-semibold text-gray-600">You're not set up as a tester yet</h3>
            <p className="text-sm text-gray-400 mt-1">On your Service Provider dashboard → Testers, turn on <b>“I'm a tester too.”</b></p>
          </div>
        ) : (
          <div className="space-y-8">
            <section>
              <h2 className="text-sm font-bold uppercase tracking-wide text-gray-500 mb-3">My testing sessions ({mine.length})</h2>
              {mine.length === 0 ? (
                <div className="py-8 text-center bg-white border border-dashed border-gray-200 rounded-xl text-sm text-gray-400">You haven't signed up for any testing sessions yet.</div>
              ) : (
                <div className="space-y-2">{mine.map(s => <Card key={s.schedule_id} s={s} mineCard />)}</div>
              )}
            </section>

            <section>
              <h2 className="text-sm font-bold uppercase tracking-wide text-gray-500 mb-3">Available to sign up ({available.length})</h2>
              {available.length === 0 ? (
                <div className="py-8 text-center bg-white border border-dashed border-gray-200 rounded-xl text-sm text-gray-400">No open testing sessions right now.</div>
              ) : (
                <div className="space-y-2">{available.map(s => <Card key={s.schedule_id} s={s} />)}</div>
              )}
            </section>
          </div>
        )}
      </div>
    </div>
  );
}
