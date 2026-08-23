"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { X } from "lucide-react";

export default function LeadsSection({ spUrl, orgParam, associations }) {
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [selectedAssocs, setSelectedAssocs] = useState([]);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState(null);

  const { data: leadsData, isLoading } = useQuery({
    queryKey: ["sp-leads", orgParam],
    queryFn: async () => {
      const res = await fetch(spUrl("/api/service-provider/leads"));
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
  });
  const leads = leadsData?.leads || [];
  const pool = leadsData?.pool || [];
  // Only offer pool members who aren't already a lead.
  const leadIds = new Set(leads.map(l => l.user_id));
  const candidates = pool.filter(p => !leadIds.has(p.user_id));

  const toggleAssoc = (id) =>
    setSelectedAssocs(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);

  const assignLead = async () => {
    setSaving(true);
    setMsg(null);
    const res = await fetch(spUrl("/api/service-provider/leads"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, name: name || null, association_ids: selectedAssocs }),
    });
    const data = await res.json().catch(() => ({}));
    setSaving(false);
    if (!res.ok || data.error) {
      setMsg({ type: "error", text: data.error || "Failed to assign lead" });
      return;
    }
    setMsg({ type: "success", text: `Lead assigned to ${data.count} association${data.count !== 1 ? "s" : ""}.` });
    setName("");
    setEmail("");
    setSelectedAssocs([]);
    queryClient.invalidateQueries({ queryKey: ["sp-leads", orgParam] });
  };

  const removeAssoc = async (userId, associationId) => {
    await fetch(spUrl(`/api/service-provider/leads?user_id=${userId}&association_id=${associationId}`), { method: "DELETE" });
    queryClient.invalidateQueries({ queryKey: ["sp-leads", orgParam] });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Association Leads <span className="text-accent text-sm font-medium">· scoped access</span></h2>
          <p className="text-xs text-gray-400 mt-0.5">A lead manages <b className="text-gray-500">only the associations you pick</b> — for someone running one or two clubs. Need someone with full access to everything? Add a <b className="text-gray-500">Co-Admin</b> instead.</p>
        </div>
        <p className="text-sm text-gray-400 flex-shrink-0">{leads.length} lead{leads.length !== 1 ? "s" : ""}</p>
      </div>

      {/* Current leads */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100">
          <h3 className="text-sm font-semibold text-gray-900">Current Leads</h3>
          <p className="text-xs text-gray-400 mt-0.5">Each lead has scoped admin access to the associations they cover.</p>
        </div>
        {isLoading ? (
          <div className="py-10 text-center text-gray-400 text-sm">Loading...</div>
        ) : leads.length === 0 ? (
          <div className="py-10 text-center text-gray-400 text-sm">No leads assigned yet. Use the form below to add one.</div>
        ) : (
          <div className="divide-y divide-gray-100">
            {leads.map(lead => (
              <div key={lead.user_id} className="px-5 py-4 flex items-start justify-between gap-4 flex-wrap">
                <div className="min-w-0">
                  <div className="font-medium text-gray-900">{lead.name || lead.email}</div>
                  <div className="text-xs text-gray-400">{lead.email}</div>
                </div>
                <div className="flex items-center gap-1.5 flex-wrap justify-end">
                  {lead.associations.map(a => (
                    <span key={a.id} className="inline-flex items-center gap-1 text-xs px-2 py-1 bg-blue-50 text-blue-700 border border-blue-200 rounded-full">
                      {a.name}
                      <button
                        onClick={() => removeAssoc(lead.user_id, a.id)}
                        className="text-blue-400 hover:text-blue-700"
                        aria-label={`Remove ${a.name}`}
                        title="Remove access"
                      >
                        <X size={12} />
                      </button>
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Assign new lead */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100">
          <h3 className="text-sm font-semibold text-gray-900">Assign New Lead</h3>
          <p className="text-xs text-gray-400 mt-0.5">Pick someone from <b className="text-gray-500">your evaluator pool</b> and give them scoped admin access to one or more of your associations.</p>
        </div>
        <div className="p-5 space-y-4">
          <div>
            <label className="text-xs font-medium text-gray-500 mb-1 block">Evaluator *</label>
            {candidates.length === 0 ? (
              <p className="text-xs text-gray-400">Everyone in your evaluator pool is already a lead. Add people to your pool first.</p>
            ) : (
              <select
                value={email}
                onChange={e => {
                  setEmail(e.target.value);
                  setName(candidates.find(c => c.email === e.target.value)?.name || null);
                }}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#0b5cd6]/30"
              >
                <option value="">Select from your pool…</option>
                {candidates.map(c => (
                  <option key={c.user_id} value={c.email}>{c.name || c.email} ({c.email})</option>
                ))}
              </select>
            )}
          </div>
          <div>
            <label className="text-xs font-medium text-gray-500 mb-2 block">Associations *</label>
            {associations.length === 0 ? (
              <p className="text-xs text-gray-400">No associations available.</p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                {associations.map(assoc => (
                  <label key={assoc.id} className="flex items-center gap-2 px-3 py-2 border border-gray-200 rounded-lg text-sm cursor-pointer hover:bg-gray-50">
                    <input type="checkbox" checked={selectedAssocs.includes(assoc.id)} onChange={() => toggleAssoc(assoc.id)} className="rounded border-gray-300" />
                    <span className="truncate text-gray-700" title={assoc.name}>{assoc.name}</span>
                  </label>
                ))}
              </div>
            )}
          </div>
          {msg && <p className={`text-xs font-medium ${msg.type === "success" ? "text-green-600" : "text-red-500"}`}>{msg.text}</p>}
          <div>
            <button
              disabled={!email || selectedAssocs.length === 0 || saving}
              onClick={assignLead}
              className="px-5 py-2 bg-gradient-to-r from-[#0b5cd6] to-[#3b82f6] text-white rounded-lg text-sm font-semibold disabled:opacity-40">
              {saving ? "Assigning..." : "Assign Lead"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
