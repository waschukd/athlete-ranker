"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, X, Ban } from "lucide-react";
import { parseCsv } from "@/lib/rosterImport";
import { formatTime } from "@/lib/spDashboardUtils";

// SP-owned testing sessions (a testing-only client, not an association you
// evaluate for). Belongs with the schedule, not the tester pool. Add one, bulk
// upload a CSV, and manage the list. Only the SP's testers ever see these.
export default function TestingSessionsControls({ spUrl, onSaved }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const { data: evData } = useQuery({ queryKey: ["sp-testing-events"], queryFn: async () => { const r = await fetch(spUrl("/api/service-provider/testing-events")); return r.json(); } });
  const events = evData?.events || [];
  const blankEv = { client_label: "", age_label: "", scheduled_date: "", start_time: "", end_time: "", location: "", testers_required: "7" };
  const [evForm, setEvForm] = useState(blankEv);
  const [evBusy, setEvBusy] = useState(false);
  const [uploadMsg, setUploadMsg] = useState(null);
  const setEv = (k, v) => setEvForm(f => ({ ...f, [k]: v }));
  const refresh = () => { qc.invalidateQueries({ queryKey: ["sp-testing-events"] }); onSaved?.(); };

  const addEvent = async () => {
    if (!evForm.client_label.trim() || !evForm.scheduled_date) return;
    setEvBusy(true);
    await fetch(spUrl("/api/service-provider/testing-events"), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(evForm) });
    setEvBusy(false); setEvForm(blankEv); refresh();
  };
  const delEvent = async (id) => { await fetch(spUrl(`/api/service-provider/testing-events?id=${id}`), { method: "DELETE" }); refresh(); };
  const onCsv = async (e) => {
    const file = e.target.files?.[0]; if (!file) return;
    setUploadMsg(null);
    const text = await file.text();
    const { headers, rows } = parseCsv(text);
    if (!rows.length) { setUploadMsg({ type: "error", text: "That CSV looks empty." }); e.target.value = ""; return; }
    const findCol = (names) => headers.find(h => names.some(n => h.toLowerCase().includes(n)));
    const col = { client: findCol(["client"]), age: findCol(["age"]), date: findCol(["date"]), start: findCol(["start"]), end: findCol(["end"]), loc: findCol(["location", "rink"]), testers: findCol(["tester"]) };
    const evs = rows.map(r => ({
      client_label: col.client ? r[col.client] : "", age_label: col.age ? r[col.age] : "", scheduled_date: col.date ? r[col.date] : "",
      start_time: col.start ? r[col.start] : "", end_time: col.end ? r[col.end] : "",
      location: col.loc ? r[col.loc] : "", testers_required: col.testers ? r[col.testers] : "",
    })).filter(ev => ev.client_label && ev.scheduled_date);
    e.target.value = "";
    if (!evs.length) { setUploadMsg({ type: "error", text: "No valid rows — the CSV needs Client and Date columns." }); return; }
    const res = await fetch(spUrl("/api/service-provider/testing-events"), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ events: evs }) });
    const d = await res.json().catch(() => ({}));
    if (d.success) { setUploadMsg({ type: "success", text: `Added ${d.created} session${d.created === 1 ? "" : "s"}${d.skipped ? `, skipped ${d.skipped}` : ""}.` }); refresh(); }
    else setUploadMsg({ type: "error", text: d.error || "Upload failed" });
  };
  const downloadTemplate = () => {
    const csv = "Client,Age Category,Date,Start Time,End Time,Location,Testers Needed\nRingette Association,U12,2026-09-15,17:00,18:00,Demo Arena - Rink A,7\n";
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const a = document.createElement("a"); a.href = url; a.download = "testing-sessions-template.csv"; a.click();
  };

  return (
    <>
      <button onClick={() => setOpen(true)} className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-gray-300 text-ink bg-white rounded-lg text-xs font-semibold hover:bg-gray-50">
        <Plus size={13} /> Testing session
      </button>
      {open && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-start justify-center p-4 overflow-y-auto" onClick={(e) => e.target === e.currentTarget && setOpen(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl p-6 mt-10 mb-10">
            <div className="flex items-start justify-between mb-1">
              <h3 className="font-display font-extrabold tracking-tight text-ink text-lg leading-tight">Testing sessions you run</h3>
              <button onClick={() => setOpen(false)} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
            </div>
            <p className="text-xs text-gray-400 mb-4">Testing you schedule directly for a client (e.g. a Ringette association) — not an association you evaluate for. Only your testers see these; associations never do.</p>
            <div className="flex items-center gap-2 justify-end mb-3">
              <button onClick={downloadTemplate} className="text-xs px-3 py-1.5 border border-gray-200 text-gray-600 rounded-lg hover:bg-gray-50 whitespace-nowrap">↓ Template</button>
              <label className="text-xs px-3 py-1.5 bg-[#e8f0fd] text-[#0b5cd6] rounded-lg hover:bg-[#dbe8fc] font-medium cursor-pointer whitespace-nowrap">Upload CSV<input type="file" accept=".csv" onChange={onCsv} className="hidden" /></label>
            </div>
            {uploadMsg && <div className={`mb-3 text-xs font-medium ${uploadMsg.type === "success" ? "text-green-600" : "text-red-500"}`}>{uploadMsg.text}</div>}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <input value={evForm.client_label} onChange={e => setEv("client_label", e.target.value)} placeholder="Client (e.g. Ringette Association)" className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0b5cd6]/30" />
              <input value={evForm.age_label} onChange={e => setEv("age_label", e.target.value)} placeholder="Age category (e.g. U12)" className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0b5cd6]/30" />
              <input type="date" value={evForm.scheduled_date} onChange={e => setEv("scheduled_date", e.target.value)} className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0b5cd6]/30" />
              <input value={evForm.location} onChange={e => setEv("location", e.target.value)} placeholder="Rink / location" className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0b5cd6]/30" />
              <div className="flex items-center gap-2"><span className="text-xs text-gray-400 w-10">Start</span><input type="time" value={evForm.start_time} onChange={e => setEv("start_time", e.target.value)} className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0b5cd6]/30" /></div>
              <div className="flex items-center gap-2"><span className="text-xs text-gray-400 w-10">End</span><input type="time" value={evForm.end_time} onChange={e => setEv("end_time", e.target.value)} className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0b5cd6]/30" /></div>
              <div className="flex items-center gap-2"><span className="text-xs text-gray-400 whitespace-nowrap">Testers needed</span><input type="number" min="0" value={evForm.testers_required} onChange={e => setEv("testers_required", e.target.value)} className="w-20 border border-gray-200 rounded-lg px-3 py-2 text-sm text-center focus:outline-none focus:ring-2 focus:ring-[#0b5cd6]/30" /></div>
            </div>
            <div className="flex justify-end mt-3">
              <button onClick={addEvent} disabled={evBusy || !evForm.client_label.trim() || !evForm.scheduled_date} className="inline-flex items-center gap-1.5 px-5 py-2 bg-gradient-to-r from-[#0b5cd6] to-[#3b82f6] text-white rounded-lg text-sm font-semibold disabled:opacity-40"><Plus size={14} /> {evBusy ? "Adding…" : "Add testing session"}</button>
            </div>
            {events.length > 0 && (
              <div className="mt-5 border border-gray-100 rounded-xl divide-y divide-gray-100">
                {events.map(ev => {
                  const short = parseInt(ev.testers_required || 0) > 0 && parseInt(ev.testers_signed_up || 0) < parseInt(ev.testers_required || 0);
                  return (
                    <div key={ev.id} className="flex items-center justify-between gap-3 px-4 py-3 flex-wrap">
                      <div className="min-w-0">
                        <div className="text-sm font-medium text-ink">{ev.client_label}{ev.age_label && <span className="ml-2 text-[11px] px-2 py-0.5 bg-accent-soft text-accent rounded-full font-semibold">{ev.age_label}</span>}</div>
                        <div className="text-xs text-gray-400 flex items-center gap-2 flex-wrap mt-0.5">
                          <span>{ev.scheduled_date?.toString().split("T")[0]}</span>
                          {ev.start_time && <span>{formatTime(ev.start_time)}{ev.end_time ? ` - ${formatTime(ev.end_time)}` : ""}</span>}
                          {ev.location && <span>{ev.location}</span>}
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className={`text-sm font-bold ${short ? "text-amber-600" : parseInt(ev.testers_signed_up || 0) > 0 ? "text-green-600" : "text-gray-400"}`}>{ev.testers_signed_up || 0}/{ev.testers_required || 0} <span className="text-xs font-normal text-gray-400">testers</span></span>
                        <button onClick={() => { if (confirm("Delete this testing session?")) delEvent(ev.id); }} className="p-1.5 text-gray-300 hover:text-red-400"><Ban size={14} /></button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
