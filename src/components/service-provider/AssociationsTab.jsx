"use client";

import { useState } from "react";
import { Plus, X, Building2, ExternalLink } from "lucide-react";
import { OrgAvatar } from "@/lib/orgVisuals";
import { AssocColorPicker } from "@/components/service-provider/AssociationWidgets";

export default function AssociationsTab({ associations, assocLoading, schedule, today, sp, spUrl, queryClient }) {
  const [showNewClient, setShowNewClient] = useState(false);
  const [newClient, setNewClient] = useState({ name: "", contact_name: "", contact_email: "", contact_phone: "", address: "" });
  const [newClientSaving, setNewClientSaving] = useState(false);
  const [newClientMsg, setNewClientMsg] = useState(null);
  const [adminInviteEmail, setAdminInviteEmail] = useState("");
  const [adminInviteName, setAdminInviteName] = useState("");
  const [adminInviteSending, setAdminInviteSending] = useState(false);
  const [adminInviteMsg, setAdminInviteMsg] = useState(null);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-900">Client Associations</h2>
        <div className="flex items-center gap-3">
          <p className="text-sm text-gray-400">{associations.length} clients</p>
          <button onClick={() => { setShowNewClient(true); setNewClientMsg(null); }} className="inline-flex items-center gap-1.5 px-4 py-2 bg-gradient-to-r from-[#0b5cd6] to-[#3b82f6] text-white rounded-lg text-sm font-semibold hover:shadow-md transition-shadow">
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
              <div><label className="text-xs font-medium text-gray-500 mb-1 block">Organization Name *</label><input type="text" placeholder="e.g. Calgary Minor Hockey" value={newClient.name} onChange={e => setNewClient(p => ({ ...p, name: e.target.value }))} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0b5cd6]/30" /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="text-xs font-medium text-gray-500 mb-1 block">Contact Name *</label><input type="text" placeholder="Jane Smith" value={newClient.contact_name} onChange={e => setNewClient(p => ({ ...p, contact_name: e.target.value }))} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0b5cd6]/30" /></div>
                <div><label className="text-xs font-medium text-gray-500 mb-1 block">Contact Email *</label><input type="email" placeholder="jane@org.com" value={newClient.contact_email} onChange={e => setNewClient(p => ({ ...p, contact_email: e.target.value }))} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0b5cd6]/30" /></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="text-xs font-medium text-gray-500 mb-1 block">Phone</label><input type="text" placeholder="403-555-1234" value={newClient.contact_phone} onChange={e => setNewClient(p => ({ ...p, contact_phone: e.target.value }))} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0b5cd6]/30" /></div>
                <div><label className="text-xs font-medium text-gray-500 mb-1 block">City / Address</label><input type="text" placeholder="Calgary, AB" value={newClient.address} onChange={e => setNewClient(p => ({ ...p, address: e.target.value }))} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0b5cd6]/30" /></div>
              </div>
              {newClientMsg && (
                <div className={`text-xs font-medium ${newClientMsg.type === "success" ? "text-green-600" : newClientMsg.type === "warn" ? "text-amber-600" : "text-red-500"}`}>
                  <p>{newClientMsg.text}</p>
                  {newClientMsg.url && (
                    <div className="mt-2 flex items-center gap-2">
                      <input readOnly value={newClientMsg.url} className="flex-1 text-[11px] bg-gray-50 border border-gray-200 rounded px-2 py-1.5 text-gray-700 font-mono" />
                      <button type="button" onClick={() => navigator.clipboard.writeText(newClientMsg.url)} className="px-2.5 py-1.5 bg-accent text-white rounded text-xs font-semibold hover:opacity-90">Copy</button>
                    </div>
                  )}
                </div>
              )}
              <div className="flex gap-3 pt-2">
                <button onClick={() => setShowNewClient(false)} className="flex-1 px-4 py-2 border border-gray-200 text-gray-600 rounded-lg text-sm">Close</button>
                <button disabled={!newClient.name || !newClient.contact_email || !newClient.contact_name || newClientSaving}
                  onClick={async () => {
                    setNewClientSaving(true);
                    setNewClientMsg(null);
                    const res = await fetch("/api/organizations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...newClient, type: "association" }) });
                    const data = await res.json();
                    if (!data.organization) { setNewClientMsg({ type: "error", text: data.error || "Failed to create" }); setNewClientSaving(false); return; }
                    await fetch(spUrl("/api/service-provider/associations"), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ association_id: data.organization.id }) });
                    const inv = data.invite;
                    setNewClientMsg(
                      inv?.sent
                        ? { type: "success", text: `${newClient.name} created — ${inv.message}` }
                        : { type: inv?.url ? "warn" : "success", text: inv?.message || `${newClient.name} created and linked!`, url: inv?.url || null }
                    );
                    setNewClientSaving(false);
                    setNewClient({ name: "", contact_name: "", contact_email: "", contact_phone: "", address: "" });
                    queryClient.invalidateQueries({ queryKey: ["sp-associations"] });
                    if (inv?.sent) setTimeout(() => setShowNewClient(false), 1800);
                  }}
                  className="flex-1 px-4 py-2 bg-gradient-to-r from-[#0b5cd6] to-[#3b82f6] text-white rounded-lg text-sm font-semibold disabled:opacity-40">
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
            const uploadLogo = async (file) => {
              const fd = new FormData();
              fd.append("logo", file);
              const res = await fetch(`/api/organizations/${assoc.id}/logo`, { method: "POST", body: fd });
              const data = await res.json();
              if (!res.ok) throw new Error(data.error || "Upload failed");
              queryClient.invalidateQueries({ queryKey: ["sp-associations"] });
            };
            const removeLogo = async () => {
              const res = await fetch(`/api/organizations/${assoc.id}/logo`, { method: "DELETE" });
              if (res.ok) queryClient.invalidateQueries({ queryKey: ["sp-associations"] });
            };
            return (
              <div key={assoc.id} className="bg-white border border-gray-200 rounded-xl p-5 hover:border-[#0b5cd6]/50 hover:shadow-md transition-all">
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-3 min-w-0">
                    <OrgAvatar
                      name={assoc.name}
                      logoUrl={assoc.logo_url}
                      size={48}
                      onUpload={uploadLogo}
                      onRemove={removeLogo}
                    />
                    <div className="min-w-0">
                      <h3 className="font-bold text-gray-900 truncate" title={assoc.name}>{assoc.name}</h3>
                      <p className="text-xs text-gray-400 truncate">{assoc.contact_email}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {needsEval > 0 && <span className="text-xs px-2 py-0.5 bg-amber-100 text-amber-700 rounded-full font-medium">{needsEval} needs eval</span>}
                    <AssocColorPicker assoc={assoc} spId={sp?.id} onSaved={() => queryClient.invalidateQueries({ queryKey: ["sp-associations"] })} />
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-2 mb-4 text-center">
                  <div className="bg-gray-50 rounded-lg py-2"><div className="text-lg font-bold text-gray-900">{assoc.age_categories || 0}</div><div className="text-xs text-gray-400">Categories</div></div>
                  <div className="bg-gray-50 rounded-lg py-2"><div className="text-lg font-bold text-gray-900">{assoc.athletes || 0}</div><div className="text-xs text-gray-400">Athletes</div></div>
                  <div className="bg-gray-50 rounded-lg py-2"><div className="text-lg font-bold text-gray-900">{assocSessions.length}</div><div className="text-xs text-gray-400">Upcoming</div></div>
                </div>
                <label className="flex items-start gap-2.5 mb-3 px-3 py-2.5 bg-gray-50 rounded-lg cursor-pointer">
                  <input
                    type="checkbox"
                    checked={!!assoc.allow_association_evaluators}
                    onChange={async (e) => {
                      const allow = e.target.checked;
                      try {
                        const res = await fetch(`/api/service-provider/associations${sp?.id ? `?org=${sp.id}` : ""}`, {
                          method: "PATCH",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ action: "set_evaluator_access", association_id: assoc.id, allow }),
                        });
                        if (!res.ok) throw new Error();
                        queryClient.invalidateQueries({ queryKey: ["sp-associations"] });
                      } catch {
                        queryClient.invalidateQueries({ queryKey: ["sp-associations"] });
                      }
                    }}
                    className="mt-0.5 h-4 w-4 rounded border-gray-300 text-[#0b5cd6] focus:ring-[#0b5cd6]/30"
                  />
                  <span className="text-xs text-gray-600 leading-snug">
                    <span className="font-semibold text-gray-800">Let them add their own evaluators</span><br />
                    Their coaches' scores show as a <b>comparison only</b> — your evaluators' scores stay the official ranking.
                  </span>
                </label>
                <a href={`/association/dashboard?org=${assoc.id}`} className="w-full flex items-center justify-center gap-2 py-2.5 bg-gradient-to-r from-[#0b5cd6] to-[#3b82f6] text-white rounded-lg text-sm font-semibold hover:shadow-md transition-shadow">
                  <ExternalLink size={14} /> Open Dashboard
                </a>
              </div>
            );
          })}
        </div>
      )}

      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100">
          <h3 className="text-sm font-semibold text-gray-900">Add Co-Admin <span className="text-accent font-medium">· full access</span></h3>
          <p className="text-xs text-gray-500 mt-0.5">Sees and manages <b className="text-ink">every</b> association under {sp?.name || "this service provider"} — for a partner who helps anywhere.</p>
          <p className="text-xs text-gray-400 mt-1">Only need them on one or two associations? Use the <b className="text-gray-500">Leads</b> tab instead.</p>
        </div>
        <div className="p-5">
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
            <input type="text" placeholder="Name (optional)" value={adminInviteName} onChange={e => setAdminInviteName(e.target.value)} className="sm:w-48 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0b5cd6]/30" />
            <input type="email" placeholder="Admin email address" value={adminInviteEmail} onChange={e => setAdminInviteEmail(e.target.value)} className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0b5cd6]/30" />
            <button disabled={!adminInviteEmail || adminInviteSending || !sp?.id}
              onClick={async () => {
                setAdminInviteSending(true);
                setAdminInviteMsg(null);
                try {
                  const res = await fetch("/api/admin/invite-admin", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ organization_id: sp.id, email: adminInviteEmail, name: adminInviteName || null }) });
                  const data = await res.json();
                  if (data.success) {
                    setAdminInviteMsg({ type: "success", text: data.message || `Invitation sent to ${adminInviteEmail}` });
                    setAdminInviteEmail("");
                    setAdminInviteName("");
                  } else {
                    setAdminInviteMsg({ type: "error", text: data.error || "Failed to send invite" });
                  }
                } catch {
                  setAdminInviteMsg({ type: "error", text: "Failed to send invite" });
                }
                setAdminInviteSending(false);
              }}
              className="px-5 py-2 bg-gradient-to-r from-[#0b5cd6] to-[#3b82f6] text-white rounded-lg text-sm font-semibold disabled:opacity-40 whitespace-nowrap">
              {adminInviteSending ? "Sending..." : "Send Invite"}
            </button>
          </div>
          {adminInviteMsg && <p className={`text-xs font-medium mt-2 break-words ${adminInviteMsg.type === "success" ? "text-green-600" : "text-red-500"}`}>{adminInviteMsg.text}</p>}
        </div>
      </div>
    </div>
  );
}
