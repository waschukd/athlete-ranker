"use client";

import { useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { useQuery, useQueryClient, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Building2, Calendar, Users, Zap, LogOut, Clock, MapPin, CheckCircle, AlertCircle, ExternalLink, X, Plus } from "lucide-react";

const qc = new QueryClient();

const SESSION_TYPE_COLORS = {
  testing: "bg-blue-100 text-blue-700",
  skills: "bg-purple-100 text-purple-700",
  scrimmage: "bg-green-100 text-green-700",
};

function formatTime(t) {
  if (!t) return "";
  const [h, m] = t.toString().split(":");
  const hr = parseInt(h);
  return `${hr > 12 ? hr - 12 : hr}:${m} ${hr >= 12 ? "PM" : "AM"}`;
}

function formatDate(d) {
  if (!d) return "";
  const str = d.toString().split("T")[0];
  const [year, month, day] = str.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  return date.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" });
}

function JoinCodesPanel({ orgId, data, refetch }) {
  const [generating, setGenerating] = useState(false);
  const [copied, setCopied] = useState(null);
  const codes = data?.codes || [];
  const activeCodes = codes.filter(c => c.uses < c.max_uses);
  const generateCode = async () => {
    setGenerating(true);
    await fetch(`/api/organizations/${orgId}/join-codes`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "generate", max_uses: 100 }) });
    await refetch();
    setGenerating(false);
  };
  const copySignupLink = (code) => {
    navigator.clipboard.writeText(`${window.location.origin}/evaluator/signup?code=${code}`);
    setCopied(code);
    setTimeout(() => setCopied(null), 2000);
  };
  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
      <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
        <div>
          <h3 className="text-sm font-semibold text-gray-900">Evaluator Join Codes</h3>
          <p className="text-xs text-gray-400 mt-0.5">Share with evaluators so they can join</p>
        </div>
        <button onClick={generateCode} disabled={generating} className="inline-flex items-center gap-1.5 px-4 py-2 bg-gradient-to-r from-[#1A6BFF] to-[#4D8FFF] text-white rounded-lg text-sm font-semibold disabled:opacity-50">
          {generating ? "Generating..." : "+ Generate Code"}
        </button>
      </div>
      {activeCodes.length === 0 ? (
        <div className="py-8 text-center text-gray-400 text-sm">No active codes. Generate one to start recruiting evaluators.</div>
      ) : (
        <div className="divide-y divide-gray-100">
          {activeCodes.map(code => (
            <div key={code.id} className="flex items-center justify-between px-5 py-3">
              <div className="flex items-center gap-3">
                <span className="font-mono text-lg font-bold text-gray-900 tracking-widest bg-gray-50 px-3 py-1 rounded-lg border border-gray-200">{code.code}</span>
                <div className="text-xs text-gray-400">{code.uses} / {code.max_uses} uses</div>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => copySignupLink(code.code)} className={`text-xs px-3 py-1.5 rounded-lg border font-medium transition-all ${copied === code.code ? "bg-green-100 text-green-700 border-green-200" : "bg-white text-gray-600 border-gray-200"}`}>
                  {copied === code.code ? "Copied!" : "Copy Signup Link"}
                </button>
                <button onClick={async () => { if (confirm("Deactivate this code?")) { await fetch(`/api/organizations/${orgId}/join-codes`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "deactivate", code_id: code.id }) }); refetch(); } }} className="text-xs px-3 py-1.5 border border-red-100 text-red-400 rounded-lg hover:bg-red-50">Deactivate</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function BlastButton({ scheduleId, spotsOpen }) {
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [message, setMessage] = useState("");
  const sendBlast = async () => {
    setSending(true);
    const res = await fetch("/api/service-provider/notify", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ schedule_id: scheduleId, message }) });
    setResult(await res.json());
    setSending(false);
  };
  return (
    <>
      <button onClick={() => setShowModal(true)} className="text-xs px-3 py-1.5 bg-amber-100 text-amber-700 border border-amber-200 rounded-lg hover:bg-amber-200 font-medium">Blast ({spotsOpen} open)</button>
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={e => e.target === e.currentTarget && setShowModal(false)}>
          <div className="bg-white rounded-2xl w-full max-w-md p-6 shadow-xl">
            <h3 className="font-bold text-gray-900 mb-1">Blast Evaluator Pool</h3>
            <p className="text-sm text-gray-500 mb-4">{spotsOpen} spot{spotsOpen !== 1 ? "s" : ""} need to be filled.</p>
            {result ? (
              <div className="text-center py-4">
                <p className="font-semibold text-gray-900 mb-2">{result.message}</p>
                <button onClick={() => { setShowModal(false); setResult(null); }} className="px-5 py-2 bg-[#1A6BFF] text-white rounded-lg text-sm">Done</button>
              </div>
            ) : (
              <>
                <textarea value={message} onChange={e => setMessage(e.target.value)} placeholder="Optional message..." className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1A6BFF] resize-none mb-4" rows={3} />
                <div className="flex gap-3">
                  <button onClick={() => setShowModal(false)} className="flex-1 py-2.5 border border-gray-300 text-gray-600 rounded-lg text-sm">Cancel</button>
                  <button onClick={sendBlast} disabled={sending} className="flex-1 py-2.5 bg-amber-500 text-white rounded-lg text-sm font-semibold disabled:opacity-50">{sending ? "Sending..." : "Send Blast"}</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}

function EvaluatorEfficiencyReport() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState(null);
  const load = async () => {
    setLoading(true);
    const res = await fetch("/api/service-provider/reports", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "evaluator_efficiency" }) });
    setData(await res.json());
    setLoading(false);
  };
  const evalHistory = selected ? (data?.sessionHistory || []).filter(s => s.evaluator_id === selected.id) : [];
  const totalHours = evalHistory.reduce((s, r) => s + parseFloat(r.hours_worked || 0), 0);
  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
      <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
        <div>
          <div className="font-semibold text-gray-900">Evaluator Efficiency Report</div>
          <div className="text-xs text-gray-400">Scoring behaviour, attendance, hours and pay</div>
        </div>
        <button onClick={load} disabled={loading} className="px-4 py-2 bg-gradient-to-r from-blue-500 to-blue-700 text-white rounded-lg text-sm font-semibold disabled:opacity-50">
          {loading ? "Loading..." : data ? "Refresh" : "Generate Report"}
        </button>
      </div>
      {!data && !loading && <div className="py-12 text-center text-gray-400 text-sm">Click Generate Report to load evaluator data</div>}
      {loading && <div className="py-12 text-center text-gray-400 text-sm">Loading...</div>}
      {data && !selected && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Evaluator</th>
                <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase">Sessions</th>
                <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase">Strikes</th>
                <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase">Approved Hrs</th>
                <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase">Pending Hrs</th>
                <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase">Rating</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {(data.evaluators || []).length === 0 && <tr><td colSpan={6} className="py-10 text-center text-gray-400 text-sm">No evaluators found</td></tr>}
              {(data.evaluators || []).map(ev => (
                <tr key={ev.id} className="hover:bg-gray-50 cursor-pointer" onClick={() => setSelected(ev)}>
                  <td className="px-4 py-3"><div className="font-medium text-gray-900">{ev.name}</div><div className="text-xs text-gray-400">{ev.email}</div></td>
                  <td className="px-4 py-3 text-center">{parseInt(ev.total_sessions || 0)}</td>
                  <td className="px-4 py-3 text-center"><span className={`font-bold ${parseInt(ev.late_cancel_strikes || 0) === 0 ? "text-green-600" : "text-red-500"}`}>{ev.late_cancel_strikes || 0}</span></td>
                  <td className="px-4 py-3 text-center font-semibold">{parseFloat(ev.approved_hours || 0).toFixed(1)}h</td>
                  <td className="px-4 py-3 text-center">{parseFloat(ev.pending_hours || 0) > 0 ? <span className="text-xs px-2 py-0.5 bg-amber-100 text-amber-700 rounded-full">{parseFloat(ev.pending_hours).toFixed(1)}h</span> : "-"}</td>
                  <td className="px-4 py-3 text-center">{parseFloat(ev.avg_rating || 0) > 0 ? `${parseFloat(ev.avg_rating).toFixed(1)} *` : "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {data && selected && (
        <div className="p-5 space-y-4">
          <button onClick={() => setSelected(null)} className="text-xs px-3 py-1.5 border border-gray-200 text-gray-600 rounded-lg">Back</button>
          <div className="font-bold text-gray-900">{selected.name} - {selected.email}</div>
          <div className="border border-gray-200 rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50"><tr><th className="px-4 py-2 text-left text-xs text-gray-500 uppercase">Date</th><th className="px-4 py-2 text-left text-xs text-gray-500 uppercase">Session</th><th className="px-4 py-2 text-center text-xs text-gray-500 uppercase">Status</th><th className="px-4 py-2 text-center text-xs text-gray-500 uppercase">Hours</th></tr></thead>
              <tbody className="divide-y divide-gray-100">
                {evalHistory.map((s, i) => (
                  <tr key={i}>
                    <td className="px-4 py-2.5 text-gray-600">{s.scheduled_date?.toString().split("T")[0]}</td>
                    <td className="px-4 py-2.5"><div className="font-medium">{s.org_name} - {s.category_name}</div><div className="text-xs text-gray-400">S{s.session_number} G{s.group_number}</div></td>
                    <td className="px-4 py-2.5 text-center">{s.no_show ? <span className="text-xs px-2 py-0.5 bg-red-100 text-red-600 rounded-full">No Show</span> : s.completed ? <span className="text-xs px-2 py-0.5 bg-green-100 text-green-600 rounded-full">Completed</span> : <span className="text-xs px-2 py-0.5 bg-blue-100 text-blue-600 rounded-full">Signed Up</span>}</td>
                    <td className="px-4 py-2.5 text-center font-semibold">{s.hours_worked ? `${parseFloat(s.hours_worked).toFixed(1)}h` : "-"}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-gray-50 border-t border-gray-200"><tr><td colSpan={3} className="px-4 py-2 font-semibold text-gray-700">Total</td><td className="px-4 py-2 text-center font-bold">{totalHours.toFixed(1)}h</td></tr></tfoot>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function StaffingReports() {
  const [loading, setLoading] = useState(null);
  const [msg, setMsg] = useState("");
  const run = async (action) => {
    setLoading(action);
    setMsg("");
    const res = await fetch("/api/service-provider/reports", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action }) });
    const data = await res.json();
    setMsg(data.message || data.error || "Done");
    setLoading(null);
  };
  return (
    <div className="space-y-5">
      <h2 className="text-lg font-semibold text-gray-900">Reports and Notifications</h2>
      {msg && <div className="bg-green-50 border border-green-200 rounded-xl px-4 py-3 text-sm text-green-700">{msg}</div>}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-white border border-gray-200 rounded-xl p-5">
          <div className="font-semibold text-gray-900 mb-1">Weekly Staffing Report</div>
          <p className="text-xs text-gray-500 mb-4">All sessions for the next 7 days with evaluator rosters.</p>
          <button onClick={() => run("weekly_report")} disabled={loading === "weekly_report"} className="w-full py-2.5 bg-gradient-to-r from-[#1A6BFF] to-[#4D8FFF] text-white rounded-xl text-sm font-semibold disabled:opacity-50">
            {loading === "weekly_report" ? "Sending..." : "Send Weekly Report Now"}
          </button>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-5">
          <div className="font-semibold text-gray-900 mb-1">Daily Staffing Alert</div>
          <p className="text-xs text-gray-500 mb-4">Sessions in next 48 hours that need evaluators.</p>
          <button onClick={() => run("daily_alert")} disabled={loading === "daily_alert"} className="w-full py-2.5 bg-gradient-to-r from-amber-500 to-amber-600 text-white rounded-xl text-sm font-semibold disabled:opacity-50">
            {loading === "daily_alert" ? "Checking..." : "Send Daily Alert Now"}
          </button>
        </div>
      </div>
    </div>
  );
}

function SPDashboard() {
  const searchParams = useSearchParams();
  const orgParam = searchParams.get("org");
  const spUrl = (path) => {
    if (!orgParam) return path;
    const sep = path.includes("?") ? "&" : "?";
    return `${path}${sep}org=${orgParam}`;
  };

  const [activeTab, setActiveTab] = useState("associations");
  const queryClient = useQueryClient();
  const [showPastSessions, setShowPastSessions] = useState(false);
  const [evalInviteEmail, setEvalInviteEmail] = useState("");
  const [evalInviteSending, setEvalInviteSending] = useState(false);
  const [evalInviteMsg, setEvalInviteMsg] = useState(null);
  const [showNewClient, setShowNewClient] = useState(false);
  const [newClient, setNewClient] = useState({ name: "", contact_name: "", contact_email: "", contact_phone: "", address: "" });
  const [newClientSaving, setNewClientSaving] = useState(false);
  const [newClientMsg, setNewClientMsg] = useState(null);

  const { data: assocData, isLoading: assocLoading } = useQuery({
    queryKey: ["sp-associations", orgParam],
    queryFn: async () => {
      const res = await fetch(spUrl("/api/service-provider/associations"));
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
  });

  const { data: joinCodeData, refetch: refetchCodes } = useQuery({
    queryKey: ["sp-join-codes", assocData?.sp?.id],
    queryFn: async () => {
      if (!assocData?.sp?.id) return null;
      const res = await fetch(`/api/organizations/${assocData.sp.id}/join-codes`);
      return res.json();
    },
    enabled: !!assocData?.sp?.id,
  });

  const { data: evalData } = useQuery({
    queryKey: ["sp-evaluators", orgParam],
    queryFn: async () => {
      const res = await fetch(spUrl("/api/service-provider/evaluators"));
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
  });

  const { data: schedData, isLoading: schedLoading } = useQuery({
    queryKey: ["sp-schedule", orgParam],
    queryFn: async () => {
      const res = await fetch(spUrl("/api/service-provider/schedule"));
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
  });

  const sp = assocData?.sp;
  const associations = assocData?.associations || [];
  const evaluatorStats = assocData?.evaluatorStats || {};
  const evaluators = evalData?.evaluators || [];
  const flags = evalData?.flags || [];
  const pendingHours = evalData?.pendingHours || [];
  const rawSchedule = schedData?.schedule || [];
  const byDate = rawSchedule.reduce((acc, entry) => {
    const date = entry.scheduled_date?.toString().split("T")[0];
    if (!date) return acc;
    if (!acc[date]) acc[date] = [];
    acc[date].push({ ...entry, spots_open: parseInt(entry.evaluators_required) - parseInt(entry.evaluators_signed_up || 0) });
    return acc;
  }, {});
  const schedule = Object.values(byDate).flat();
  const today = new Date().toISOString().split("T")[0];
  const allDates = Object.keys(byDate).sort();
  const upcomingDates = showPastSessions ? allDates : allDates.filter(d => d >= today);
  const pastCount = allDates.filter(d => d < today).length;
  const needsEvaluators = schedule.filter(s => s.spots_open > 0 && s.scheduled_date?.toString().split("T")[0] >= today).length;
  const totalUpcoming = schedule.filter(s => s.scheduled_date?.toString().split("T")[0] >= today).length;

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white border-b border-gray-200 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-[#1A6BFF] to-[#4D8FFF] flex items-center justify-center shadow-md">
              <Zap className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-gray-900">{sp?.name || "Service Provider"}</h1>
              <p className="text-xs text-gray-400">{orgParam ? "Viewing as Super Admin" : "Service Provider Dashboard"}</p>
            </div>
          </div>
          <button onClick={async () => { await fetch("/api/auth/logout", { method: "POST" }); window.location.href = orgParam ? "/admin/god-mode" : "/account/signin"; }} className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700">
            <LogOut size={15} /> {orgParam ? "Back to God Mode" : "Sign out"}
          </button>
        </div>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: "Client Associations", value: associations.length, icon: Building2, color: "text-blue-600" },
              { label: "Upcoming Sessions", value: totalUpcoming, icon: Calendar, color: "text-[#1A6BFF]" },
              { label: "Needs Evaluators", value: needsEvaluators, icon: AlertCircle, color: "text-amber-500" },
              { label: "Evaluator Pool", value: evaluatorStats.total_evaluators || 0, icon: Users, color: "text-green-600" },
            ].map(({ label, value, icon: Icon, color }) => (
              <div key={label} className="bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 flex items-center gap-3">
                <Icon size={18} className={color} />
                <div><div className="text-xl font-bold text-gray-900">{value}</div><div className="text-xs text-gray-500">{label}</div></div>
              </div>
            ))}
          </div>
        </div>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex gap-1">
            {[{ id: "associations", label: "Associations" }, { id: "schedule", label: "Master Schedule" }, { id: "evaluators", label: "Evaluator Pool" }, { id: "reports", label: "Reports" }].map(tab => (
              <button key={tab.id} onClick={() => setActiveTab(tab.id)} className={`px-4 py-3 text-sm font-medium border-b-2 whitespace-nowrap transition-colors ${activeTab === tab.id ? "border-[#1A6BFF] text-[#1A6BFF]" : "border-transparent text-gray-500 hover:text-gray-700"}`}>
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">

        {activeTab === "associations" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-900">Client Associations</h2>
              <div className="flex items-center gap-3">
                <p className="text-sm text-gray-400">{associations.length} clients</p>
                <button onClick={() => { setShowNewClient(true); setNewClientMsg(null); }} className="inline-flex items-center gap-1.5 px-4 py-2 bg-gradient-to-r from-[#1A6BFF] to-[#4D8FFF] text-white rounded-lg text-sm font-semibold hover:shadow-md transition-shadow">
                  <Plus size={15} /> New Client
                </button>
              </div>
            </div>

            {showNewClient && (
              <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
                <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
                  <div className="flex items-center justify-between mb-5">
                    <h3 className="text-base font-bold text-gray-900">Add New Client Association</h3>
                    <button onClick={() => setShowNewClient(false)} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
                  </div>
                  <div className="space-y-3">
                    <div><label className="text-xs font-medium text-gray-500 mb-1 block">Organization Name *</label><input type="text" placeholder="e.g. Calgary Minor Hockey" value={newClient.name} onChange={e => setNewClient(p => ({ ...p, name: e.target.value }))} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1A6BFF]/30" /></div>
                    <div className="grid grid-cols-2 gap-3">
                      <div><label className="text-xs font-medium text-gray-500 mb-1 block">Contact Name *</label><input type="text" placeholder="Jane Smith" value={newClient.contact_name} onChange={e => setNewClient(p => ({ ...p, contact_name: e.target.value }))} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1A6BFF]/30" /></div>
                      <div><label className="text-xs font-medium text-gray-500 mb-1 block">Contact Email *</label><input type="email" placeholder="jane@org.com" value={newClient.contact_email} onChange={e => setNewClient(p => ({ ...p, contact_email: e.target.value }))} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1A6BFF]/30" /></div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div><label className="text-xs font-medium text-gray-500 mb-1 block">Phone</label><input type="text" placeholder="403-555-1234" value={newClient.contact_phone} onChange={e => setNewClient(p => ({ ...p, contact_phone: e.target.value }))} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1A6BFF]/30" /></div>
                      <div><label className="text-xs font-medium text-gray-500 mb-1 block">City / Address</label><input type="text" placeholder="Calgary, AB" value={newClient.address} onChange={e => setNewClient(p => ({ ...p, address: e.target.value }))} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1A6BFF]/30" /></div>
                    </div>
                    {newClientMsg && <p className={`text-xs font-medium ${newClientMsg.type === "success" ? "text-green-600" : "text-red-500"}`}>{newClientMsg.text}</p>}
                    <div className="flex gap-3 pt-2">
                      <button onClick={() => setShowNewClient(false)} className="flex-1 px-4 py-2 border border-gray-200 text-gray-600 rounded-lg text-sm">Cancel</button>
                      <button disabled={!newClient.name || !newClient.contact_email || !newClient.contact_name || newClientSaving}
                        onClick={async () => {
                          setNewClientSaving(true);
                          setNewClientMsg(null);
                          const res = await fetch("/api/organizations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...newClient, type: "association" }) });
                          const data = await res.json();
                          if (!data.organization) { setNewClientMsg({ type: "error", text: data.error || "Failed to create" }); setNewClientSaving(false); return; }
                          await fetch(spUrl("/api/service-provider/associations"), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ association_id: data.organization.id }) });
                          setNewClientMsg({ type: "success", text: `${newClient.name} created and linked!` });
                          setNewClientSaving(false);
                          setNewClient({ name: "", contact_name: "", contact_email: "", contact_phone: "", address: "" });
                          queryClient.invalidateQueries(["sp-associations"]);
                          setTimeout(() => setShowNewClient(false), 1500);
                        }}
                        className="flex-1 px-4 py-2 bg-gradient-to-r from-[#1A6BFF] to-[#4D8FFF] text-white rounded-lg text-sm font-semibold disabled:opacity-40">
                        {newClientSaving ? "Creating..." : "Create and Link"}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {assocLoading ? <div className="py-12 text-center text-gray-400">Loading...</div> : associations.length === 0 ? (
              <div className="py-16 text-center bg-white border border-dashed border-gray-200 rounded-2xl">
                <Building2 size={48} className="mx-auto text-gray-200 mb-4" />
                <h3 className="font-semibold text-gray-600 mb-2">No client associations yet</h3>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {associations.map(assoc => {
                  const assocSessions = schedule.filter(s => s.org_id === assoc.id && s.scheduled_date >= today);
                  const needsEval = assocSessions.filter(s => s.spots_open > 0).length;
                  return (
                    <div key={assoc.id} className="bg-white border border-gray-200 rounded-xl p-5 hover:border-[#1A6BFF]/50 hover:shadow-md transition-all">
                      <div className="flex items-start justify-between mb-4">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-lg bg-orange-50 flex items-center justify-center"><Building2 size={18} className="text-[#1A6BFF]" /></div>
                          <div><h3 className="font-bold text-gray-900">{assoc.name}</h3><p className="text-xs text-gray-400">{assoc.contact_email}</p></div>
                        </div>
                        {needsEval > 0 && <span className="text-xs px-2 py-0.5 bg-amber-100 text-amber-700 rounded-full font-medium">{needsEval} needs eval</span>}
                      </div>
                      <div className="grid grid-cols-3 gap-2 mb-4 text-center">
                        <div className="bg-gray-50 rounded-lg py-2"><div className="text-lg font-bold text-gray-900">{assoc.age_categories || 0}</div><div className="text-xs text-gray-400">Categories</div></div>
                        <div className="bg-gray-50 rounded-lg py-2"><div className="text-lg font-bold text-gray-900">{assoc.athletes || 0}</div><div className="text-xs text-gray-400">Athletes</div></div>
                        <div className="bg-gray-50 rounded-lg py-2"><div className="text-lg font-bold text-gray-900">{assocSessions.length}</div><div className="text-xs text-gray-400">Upcoming</div></div>
                      </div>
                      <a href={`/association/dashboard?org=${assoc.id}`} className="w-full flex items-center justify-center gap-2 py-2.5 bg-gradient-to-r from-[#1A6BFF] to-[#4D8FFF] text-white rounded-lg text-sm font-semibold hover:shadow-md transition-shadow">
                        <ExternalLink size={14} /> Open Dashboard
                      </a>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {activeTab === "schedule" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <h2 className="text-lg font-semibold text-gray-900">Master Schedule</h2>
              <button onClick={() => setShowPastSessions(!showPastSessions)} className="text-xs px-3 py-1.5 rounded-lg border font-medium bg-white text-gray-600 border-gray-200">
                {showPastSessions ? "Hide Past" : `Show Past (${pastCount})`}
              </button>
            </div>
            {schedLoading ? <div className="py-12 text-center text-gray-400">Loading schedule...</div> : upcomingDates.length === 0 ? (
              <div className="py-16 text-center bg-white border border-dashed border-gray-200 rounded-2xl">
                <Calendar size={48} className="mx-auto text-gray-200 mb-4" />
                <h3 className="font-semibold text-gray-600">No upcoming sessions</h3>
              </div>
            ) : (
              <div className="space-y-6">
                {upcomingDates.map(date => (
                  <div key={date}>
                    <div className="flex items-center gap-3 mb-3">
                      <div className="h-px flex-1 bg-gray-200" />
                      <span className="text-sm font-semibold text-gray-600 whitespace-nowrap">{formatDate(date)}</span>
                      <div className="h-px flex-1 bg-gray-200" />
                    </div>
                    <div className="space-y-2">
                      {byDate[date].map(entry => (
                        <div key={entry.schedule_id} className={`bg-white border rounded-xl p-4 flex items-center gap-4 flex-wrap ${entry.spots_open > 0 ? "border-amber-200" : "border-gray-200"}`}>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap mb-1">
                              <span className="font-semibold text-gray-900">{entry.org_name}</span>
                              <span className="text-gray-600 text-sm">{entry.category_name}</span>
                              {entry.session_type && <span className={`text-xs px-2 py-0.5 rounded-full font-medium capitalize ${SESSION_TYPE_COLORS[entry.session_type] || "bg-gray-100 text-gray-600"}`}>{entry.session_type}</span>}
                            </div>
                            <div className="flex items-center gap-3 text-xs text-gray-500">
                              <span className="flex items-center gap-1"><Clock size={11} />{formatTime(entry.start_time)}{entry.end_time ? ` - ${formatTime(entry.end_time)}` : ""}</span>
                              {entry.location && <span className="flex items-center gap-1"><MapPin size={11} />{entry.location}</span>}
                              <span>S{entry.session_number}{entry.group_number ? ` G${entry.group_number}` : ""}</span>
                            </div>
                          </div>
                          <div className="flex items-center gap-3 flex-shrink-0">
                            <div className="text-center">
                              <div className={`text-sm font-bold ${entry.spots_open > 0 ? "text-amber-600" : "text-green-600"}`}>{entry.evaluators_signed_up}/{entry.evaluators_required}</div>
                              <div className="text-xs text-gray-400">evaluators</div>
                            </div>
                            {entry.spots_open > 0 ? <span className="text-xs px-2 py-1 bg-amber-100 text-amber-700 rounded-full">{entry.spots_open} open</span> : <span className="text-xs px-2 py-1 bg-green-100 text-green-700 rounded-full flex items-center gap-1"><CheckCircle size={11} /> Full</span>}
                            <a href={`/checkin/${entry.schedule_id}`} className="text-xs px-3 py-1.5 border border-gray-200 text-gray-600 rounded-lg hover:bg-gray-50">Check-in</a>
                            {entry.spots_open > 0 && <BlastButton scheduleId={entry.schedule_id} spotsOpen={entry.spots_open} />}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === "reports" && (
          <div className="space-y-6">
            <StaffingReports />
            <EvaluatorEfficiencyReport />
          </div>
        )}

        {activeTab === "evaluators" && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-900">Evaluator Pool</h2>
              <div className="flex items-center gap-3">
                {flags.length > 0 && <span className="text-xs px-3 py-1.5 bg-red-100 text-red-700 rounded-full">{flags.length} open flags</span>}
                {pendingHours.length > 0 && <span className="text-xs px-3 py-1.5 bg-amber-100 text-amber-700 rounded-full">{pendingHours.length} pending hours</span>}
              </div>
            </div>

            {flags.length > 0 && (
              <div className="bg-red-50 border border-red-200 rounded-xl p-4">
                <h3 className="text-sm font-semibold text-red-800 mb-3">Performance Flags</h3>
                <div className="space-y-2">
                  {flags.map(flag => (
                    <div key={flag.id} className="flex items-center justify-between bg-white rounded-lg p-3 border border-red-100">
                      <div>
                        <span className="font-medium text-gray-900 text-sm">{flag.evaluator_name}</span>
                        <span className="mx-2 text-gray-300">-</span>
                        <span className="text-xs text-gray-500">{flag.org_name} S{flag.session_number}</span>
                        <span className="mx-2 text-gray-300">-</span>
                        <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">{flag.flag_type.replace(/_/g, " ")}</span>
                      </div>
                      <button onClick={async () => { await fetch("/api/service-provider/evaluators", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "dismiss_flag", flag_id: flag.id }) }); queryClient.invalidateQueries(["sp-evaluators"]); }} className="text-xs text-gray-400 hover:text-gray-600 px-2 py-1 hover:bg-gray-100 rounded">Dismiss</button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {pendingHours.length > 0 && (
              <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                <div className="px-5 py-3 bg-amber-50 border-b border-amber-200"><h3 className="text-sm font-semibold text-amber-800">Pending Hours Approval</h3></div>
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b border-gray-100"><tr><th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Evaluator</th><th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Session</th><th className="px-4 py-2 text-center text-xs font-medium text-gray-500 uppercase">Hours</th><th className="px-4 py-2 text-center text-xs font-medium text-gray-500 uppercase">Action</th></tr></thead>
                  <tbody className="divide-y divide-gray-100">
                    {pendingHours.map(h => (
                      <tr key={h.id} className="hover:bg-gray-50">
                        <td className="px-4 py-2.5 font-medium text-gray-900">{h.evaluator_name}</td>
                        <td className="px-4 py-2.5 text-gray-500">{h.org_name} - {h.category_name} S{h.session_number}</td>
                        <td className="px-4 py-2.5 text-center font-bold text-gray-900">{parseFloat(h.hours_worked).toFixed(1)}h</td>
                        <td className="px-4 py-2.5 text-center"><button onClick={async () => { await fetch("/api/service-provider/evaluators", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "approve_hours", hours_id: h.id }) }); queryClient.invalidateQueries(["sp-evaluators"]); }} className="text-xs px-3 py-1 bg-green-100 text-green-700 rounded-full hover:bg-green-200 font-medium">Approve</button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <JoinCodesPanel orgId={assocData?.sp?.id} data={joinCodeData} refetch={refetchCodes} />

            <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
              <div className="px-5 py-4 border-b border-gray-100">
                <h3 className="text-sm font-semibold text-gray-900">Invite Evaluator by Email</h3>
              </div>
              <div className="p-5">
                <div className="flex items-center gap-3">
                  <input type="email" placeholder="Evaluator email address" value={evalInviteEmail} onChange={e => setEvalInviteEmail(e.target.value)} className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1A6BFF]/30" />
                  <button disabled={!evalInviteEmail || evalInviteSending}
                    onClick={async () => {
                      const activeCode = joinCodeData?.codes?.find(c => c.uses < c.max_uses);
                      if (!activeCode) { setEvalInviteMsg({ type: "error", text: "Generate a join code first" }); return; }
                      setEvalInviteSending(true);
                      const signupUrl = `${window.location.origin}/evaluator/signup?code=${activeCode.code}`;
                      const res = await fetch("/api/service-provider/notify", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "invite_evaluator", email: evalInviteEmail, signup_url: signupUrl, sp_name: sp?.name }) });
                      const data = await res.json();
                      setEvalInviteSending(false);
                      if (data.success) { setEvalInviteMsg({ type: "success", text: `Invite sent to ${evalInviteEmail}` }); setEvalInviteEmail(""); }
                      else { setEvalInviteMsg({ type: "error", text: data.error || "Failed" }); }
                    }}
                    className="px-5 py-2 bg-gradient-to-r from-[#1A6BFF] to-[#4D8FFF] text-white rounded-lg text-sm font-semibold disabled:opacity-40 whitespace-nowrap">
                    {evalInviteSending ? "Sending..." : "Send Invite"}
                  </button>
                </div>
                {evalInviteMsg && <p className={`text-xs font-medium mt-2 ${evalInviteMsg.type === "success" ? "text-green-600" : "text-red-500"}`}>{evalInviteMsg.text}</p>}
              </div>
            </div>

            <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Evaluator</th>
                    <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Sessions</th>
                    <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Hours</th>
                    <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Pending</th>
                    <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Rating</th>
                    <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {evaluators.length === 0 ? <tr><td colSpan={6} className="py-10 text-center text-gray-400 text-sm">No evaluators in pool yet</td></tr> : evaluators.map(ev => (
                    <tr key={ev.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 cursor-pointer" onClick={() => window.location.href = `/service-provider/evaluator/${ev.id}`}>
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-gray-900 hover:text-[#1A6BFF]">{ev.name}</span>
                          {ev.membership_status === "pending" && <span className="text-xs px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded-full">Pending</span>}
                          {ev.membership_status === "suspended" && <span className="text-xs px-1.5 py-0.5 bg-red-100 text-red-700 rounded-full">Suspended</span>}
                        </div>
                        <div className="text-xs text-gray-400">{ev.email}</div>
                      </td>
                      <td className="px-4 py-3 text-center text-gray-700">{ev.total_sessions || 0}</td>
                      <td className="px-4 py-3 text-center font-semibold text-gray-900">{parseFloat(ev.total_hours || 0).toFixed(1)}h</td>
                      <td className="px-4 py-3 text-center">{parseFloat(ev.pending_hours || 0) > 0 ? <span className="text-xs px-2 py-0.5 bg-amber-100 text-amber-700 rounded-full">{parseFloat(ev.pending_hours).toFixed(1)}h</span> : "-"}</td>
                      <td className="px-4 py-3 text-center">{parseFloat(ev.avg_rating || 0) > 0 ? `${parseFloat(ev.avg_rating).toFixed(1)} *` : "-"}</td>
                      <td className="px-4 py-3 text-center">
                        <div className="flex items-center justify-center gap-1">
                          {ev.membership_status === "pending" && <button onClick={async (e) => { e.stopPropagation(); await fetch("/api/service-provider/evaluators", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "approve", evaluator_id: ev.id }) }); queryClient.invalidateQueries(["sp-evaluators"]); }} className="text-xs px-2 py-1 bg-green-100 text-green-700 border border-green-200 rounded-lg hover:bg-green-200">Approve</button>}
                          {ev.membership_status !== "suspended" ? <button onClick={async (e) => { e.stopPropagation(); if (confirm(`Suspend ${ev.name}?`)) { await fetch("/api/service-provider/evaluators", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "suspend", evaluator_id: ev.id }) }); queryClient.invalidateQueries(["sp-evaluators"]); } }} className="text-xs px-2 py-1 bg-amber-50 text-amber-600 border border-amber-200 rounded-lg hover:bg-amber-100">Suspend</button> : <button onClick={async (e) => { e.stopPropagation(); await fetch("/api/service-provider/evaluators", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "reinstate", evaluator_id: ev.id }) }); queryClient.invalidateQueries(["sp-evaluators"]); }} className="text-xs px-2 py-1 bg-green-50 text-green-600 border border-green-200 rounded-lg hover:bg-green-100">Reinstate</button>}
                          <button onClick={async (e) => { e.stopPropagation(); if (confirm(`Delete ${ev.name}?`)) { const res = await fetch("/api/service-provider/evaluators", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "delete_account", evaluator_id: ev.id }) }); const data = await res.json(); if (data.error) alert(data.error); queryClient.invalidateQueries(["sp-evaluators"]); } }} className="text-xs px-2 py-1 bg-red-50 text-red-500 border border-red-200 rounded-lg hover:bg-red-100">Delete</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function ServiceProviderDashboardPage() {
  return (
    <QueryClientProvider client={qc}>
      <Suspense fallback={<div className="min-h-screen bg-gray-50 flex items-center justify-center"><div className="animate-spin rounded-full h-10 w-10 border-b-2 border-[#1A6BFF]" /></div>}>
        <SPDashboard />
      </Suspense>
    </QueryClientProvider>
  );
}
