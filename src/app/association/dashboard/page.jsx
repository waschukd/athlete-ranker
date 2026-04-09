"use client";

import { useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { useQuery, useMutation, useQueryClient, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Users, Calendar, Trophy, Plus, ChevronRight, Zap, Copy, Check, ArrowLeft, Trash2, Mail, X, ExternalLink, LogOut } from "lucide-react";

const qc = new QueryClient();

function Dashboard() {
  const searchParams = useSearchParams();
  const orgId = searchParams.get("org");

  const { data: joinCodeData, refetch: refetchCodes } = useQuery({
    queryKey: ["assoc-join-codes", orgId],
    queryFn: async () => {
      if (!orgId) return null;
      const res = await fetch(`/api/organizations/${orgId}/join-codes`);
      return res.json();
    },
    enabled: !!orgId,
  });
  const queryClient = useQueryClient();
  const [codeCopied, setCodeCopied] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [showInvite, setShowInvite] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteName, setInviteName] = useState("");
  const [inviteResult, setInviteResult] = useState(null);
  const [inviteLoading, setInviteLoading] = useState(false);

  const { data: orgData, isLoading: orgLoading } = useQuery({
    queryKey: ["org", orgId],
    queryFn: async () => {
      const res = await fetch(`/api/organizations/${orgId}`);
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    enabled: !!orgId,
  });

  const { data: categoriesData, isLoading: catLoading } = useQuery({
    queryKey: ["categories", orgId],
    queryFn: async () => {
      const res = await fetch(`/api/organizations/${orgId}/age-categories`);
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    enabled: !!orgId,
  });

  const deleteMutation = useMutation({
    mutationFn: async (catId) => {
      const res = await fetch(`/api/organizations/${orgId}/age-categories/${catId}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    onSuccess: () => { queryClient.invalidateQueries(["categories", orgId]); setDeleteConfirm(null); },
  });

  const sendInvite = async (e) => {
    e.preventDefault();
    setInviteLoading(true);
    const res = await fetch("/api/admin/invite-admin", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ organization_id: parseInt(orgId), email: inviteEmail, name: inviteName }),
    });
    const data = await res.json();
    setInviteResult(data);
    setInviteLoading(false);
  };

  const org = orgData?.organization;
  const serviceProvider = orgData?.service_provider || null;
  const categories = categoriesData?.categories || [];
  const totalAthletes = categories.reduce((s, c) => s + (parseInt(c.athletes_count) || 0), 0);
  const totalSessions = categories.reduce((s, c) => s + (parseInt(c.sessions_count) || 0), 0);

  if (orgLoading || catLoading) return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-[#1A6BFF]" />
    </div>
  );

  if (!orgId) return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <p className="text-gray-500">No organization selected.</p>
    </div>
  );


  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-gradient-to-br from-white via-blue-50/30 to-white border-b border-gray-200 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-2 flex justify-end">
          <button onClick={async () => { await fetch("/api/auth/logout", { method: "POST" }); window.location.href = "/account/signin"; }}
            className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 py-1">
            <LogOut size={14} /> Sign out
          </button>
        </div>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">


          <div className="flex items-start justify-between flex-wrap gap-4">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <div style={{width:"48px",height:"48px",background:"#1A6BFF",borderRadius:"12px",display:"flex",alignItems:"center",justifyContent:"center"}}><svg width="28" height="28" viewBox="0 0 100 100" fill="none"><path d="M70 15 Q80 15 80 25 L80 38 Q80 45 73 45 L45 45 Q38 45 38 52 L38 58 Q38 65 45 65 L72 65 L72 55 L85 55 L85 75 Q85 85 75 85 L30 85 Q20 85 20 75 L20 62 Q20 55 27 55 L55 55 Q62 55 62 48 L62 42 Q62 35 55 35 L28 35 L28 45 L15 45 L15 25 Q15 15 25 15 Z" fill="white"/></svg></div>
                <h1 className="text-3xl font-bold text-gray-900">{org?.name || "Association Dashboard"}</h1>
              </div>
              <p className="text-gray-500 text-sm mt-1">Manage age categories, athletes, evaluations, and rankings</p>
            </div>

            <div className="flex items-center gap-3 flex-wrap">
              <button
                onClick={() => { setShowInvite(true); setInviteResult(null); }}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50 transition-colors text-sm font-medium"
              >
                <Mail size={15} /> Invite Admin
              </button>
              {categories.length > 0 && (
                <a href={`/association/dashboard/add-category?org=${orgId}`}
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-[#1A6BFF] to-[#4D8FFF] text-white font-semibold text-sm hover:shadow-lg transition-shadow">
                  <Plus size={16} /> Add Age Category
                </a>
              )}
            </div>
          </div>

          {org?.org_code && !serviceProvider && (
            <div className="mt-6 bg-blue-50 border border-blue-200 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div>
                <p className="text-sm font-semibold text-gray-700">Organization Join Code</p>
                <p className="text-xs text-gray-500 mt-0.5">Share with evaluators to join this association</p>
              </div>
              <div className="flex items-center gap-3">
                <div className="bg-white px-5 py-2.5 rounded-lg border-2 border-blue-300 text-xl font-mono font-bold text-gray-900 tracking-widest">
                  {org.org_code}
                </div>
                <button onClick={() => { navigator.clipboard.writeText(org.org_code); setCodeCopied(true); setTimeout(() => setCodeCopied(false), 2000); }}
                  className="px-4 py-2.5 rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-colors flex items-center gap-2 text-sm font-medium">
                  {codeCopied ? <><Check size={15} /> Copied!</> : <><Copy size={15} /> Copy</>}
                </button>
              </div>
            </div>
          )}

          {categories.length > 0 && (
            <div className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-6">
              {[
                { label: "Age Categories", value: categories.length, color: "bg-[#1A6BFF]", gradient: "from-blue-500 to-blue-600", icon: Trophy },
                { label: "Total Athletes", value: totalAthletes, color: "bg-purple-500", gradient: "from-purple-500 to-purple-600", icon: Users },
                { label: "Total Sessions", value: totalSessions, color: "bg-emerald-500", gradient: "from-emerald-500 to-emerald-600", icon: Calendar },
              ].map(({ label, value, color, gradient, icon: Icon }) => (
                <div key={label} className="bg-white border border-gray-200 rounded-2xl p-6 hover:shadow-lg transition-all hover:-translate-y-0.5 relative overflow-hidden">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-gray-500">{label}</p>
                      <p className="text-4xl font-bold text-gray-900 mt-2">{value}</p>
                    </div>
                    <div className={`p-4 rounded-xl bg-gradient-to-br ${gradient}`}>
                      <Icon className="text-white" size={28} />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Join Codes + Pending Approvals — hidden if association has an SP */}
      {joinCodeData && !serviceProvider && (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            {/* Join Codes */}
            <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
              <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
                <div>
                  <h3 className="text-sm font-semibold text-gray-900">Evaluator Join Codes</h3>
                  <p className="text-xs text-gray-400 mt-0.5">Share with evaluators to let them sign up</p>
                </div>
                <button
                  onClick={async () => {
                    await fetch(`/api/organizations/${orgId}/join-codes`, {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ action: "generate", max_uses: 100 }),
                    });
                    refetchCodes();
                  }}
                  className="inline-flex items-center gap-1.5 px-3 py-2 bg-gradient-to-r from-[#1A6BFF] to-[#4D8FFF] text-white rounded-lg text-xs font-semibold"
                >
                  + Generate
                </button>
              </div>
              {(joinCodeData.codes || []).filter(c => c.uses < c.max_uses).length === 0 ? (
                <div className="py-6 text-center text-sm text-gray-400">No active codes</div>
              ) : (joinCodeData.codes || []).filter(c => c.uses < c.max_uses).map(code => (
                <div key={code.id} className="flex items-center justify-between px-5 py-3 border-b border-gray-50 last:border-0">
                  <span className="font-mono font-bold text-gray-900 tracking-widest bg-gray-50 px-3 py-1 rounded-lg border border-gray-200 text-sm">
                    {code.code}
                  </span>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-400">{code.uses}/{code.max_uses} uses</span>
                    <button
                      onClick={() => {
                        const url = `${window.location.origin}/evaluator/signup?code=${code.code}`;
                        navigator.clipboard.writeText(url);
                      }}
                      className="text-xs px-3 py-1.5 border border-gray-200 text-gray-600 rounded-lg hover:bg-gray-50 font-medium"
                    >
                      Copy Link
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {/* Pending Approvals */}
            <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
              <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-semibold text-gray-900">Pending Approvals</h3>
                  <p className="text-xs text-gray-400 mt-0.5">Evaluators waiting for access</p>
                </div>
                {(joinCodeData.pending || []).length > 0 && (
                  <span className="text-xs px-2 py-0.5 bg-blue-100 text-blue-700 rounded-full font-medium">
                    {joinCodeData.pending.length} pending
                  </span>
                )}
              </div>
              {(joinCodeData.pending || []).length === 0 ? (
                <div className="py-6 text-center text-sm text-gray-400">No pending applications</div>
              ) : (joinCodeData.pending || []).map(p => (
                <div key={p.id} className="flex items-center justify-between px-5 py-3 border-b border-gray-50 last:border-0">
                  <div>
                    <div className="text-sm font-medium text-gray-900">{p.name}</div>
                    <div className="text-xs text-gray-400">{p.email}</div>
                    {p.evaluator_id && <div className="text-xs font-mono text-[#1A6BFF]">{p.evaluator_id}</div>}
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={async () => {
                        await fetch(`/api/organizations/${orgId}/join-codes`, {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ action: "approve", membership_id: p.membership_id, user_id: p.id }),
                        });
                        refetchCodes();
                      }}
                      className="text-xs px-3 py-1.5 bg-green-100 text-green-700 rounded-lg hover:bg-green-200 font-medium"
                    >Approve</button>
                    <button
                      onClick={async () => {
                        if (confirm(`Deny ${p.name}?`)) {
                          await fetch(`/api/organizations/${orgId}/join-codes`, {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ action: "deny", membership_id: p.membership_id }),
                          });
                          refetchCodes();
                        }
                      }}
                      className="text-xs px-3 py-1.5 bg-red-50 text-red-600 rounded-lg hover:bg-red-100 font-medium"
                    >Deny</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">


        {categories.length === 0 ? (
          <div className="text-center py-20 bg-white rounded-2xl border-2 border-dashed border-gray-300">
            <Trophy size={56} className="mx-auto text-gray-300 mb-5" />
            <h3 className="text-2xl font-bold text-gray-900 mb-2">No age categories yet</h3>
            <p className="text-gray-500 mb-8 max-w-sm mx-auto">Create your first age category to start organizing athletes and evaluations.</p>
            <a href={`/association/dashboard/add-category?org=${orgId}`}
              className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-gradient-to-r from-[#1A6BFF] to-[#4D8FFF] text-white font-semibold hover:shadow-lg transition-shadow">
              <Plus size={18} /> Add Age Category
            </a>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {categories.map((cat) => (
              <div key={cat.id} className="group bg-white rounded-2xl border border-gray-200 p-6 hover:shadow-xl hover:border-[#1A6BFF]/40 transition-all hover:-translate-y-0.5 relative overflow-hidden">
                <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-[#1A6BFF] to-[#4D8FFF] rounded-t-2xl opacity-0 group-hover:opacity-100 transition-opacity" />
                <a href={cat.setup_complete ? `/association/dashboard/category/${cat.id}?org=${orgId}` : `/association/dashboard/category/${cat.id}/setup?cat=${cat.id}&org=${orgId}`} className="block">
                  <div className="flex items-center justify-between mb-5">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="text-xl font-bold text-gray-900">{cat.name}</h3>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${cat.setup_complete ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-600"}`}>
                        {cat.setup_complete ? "Active" : "Setup"}
                      </span>
                    </div>
                    <ChevronRight className="text-gray-300 group-hover:text-[#1A6BFF] transition-colors" size={22} />
                  </div>
                  <p className="text-sm text-gray-400 mb-5">Ages {cat.min_age}–{cat.max_age}</p>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <div className="text-3xl font-bold text-[#1A6BFF]">{cat.athletes_count || 0}</div>
                      <div className="text-xs font-medium text-gray-400 mt-0.5 uppercase tracking-wide">Athletes</div>
                    </div>
                    <div>
                      <div className="text-3xl font-bold text-gray-700">{cat.sessions_count || 0}</div>
                      <div className="text-xs font-medium text-gray-400 mt-0.5 uppercase tracking-wide">Sessions</div>
                    </div>
                  </div>
                  <div className="mt-5 pt-5 border-t border-gray-100">
                    <span className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold bg-[#1A6BFF]/8 text-[#1A6BFF] border border-[#1A6BFF]/20 group-hover:bg-[#1A6BFF] group-hover:text-white transition-all">
                      Manage <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
                    </span>
                  </div>
                </a>
                <button
                  onClick={(e) => { e.preventDefault(); if (deleteConfirm === cat.id) { deleteMutation.mutate(cat.id); } else { setDeleteConfirm(cat.id); setTimeout(() => setDeleteConfirm(null), 3000); } }}
                  className={`absolute top-4 right-4 p-1.5 rounded-lg transition-all text-xs ${deleteConfirm === cat.id ? "bg-red-600 text-white" : "bg-red-50 text-red-400 hover:text-red-600 hover:bg-red-100"}`}
                  title={deleteConfirm === cat.id ? "Click again to confirm" : "Delete"}>
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {showInvite && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={(e) => e.target === e.currentTarget && setShowInvite(false)}>
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-bold text-gray-900">Invite Association Admin</h2>
              <button onClick={() => setShowInvite(false)} className="p-1 text-gray-400 hover:text-gray-600">
                <X size={18} />
              </button>
            </div>

            {inviteResult ? (
              <div className="text-center py-4">
                {inviteResult.success ? (
                  <>
                    <Check className="w-12 h-12 text-green-500 mx-auto mb-3" />
                    <p className="font-semibold text-gray-900 mb-2">{inviteResult.message}</p>
                    {inviteResult.inviteUrl && (
                      <div className="mt-4 p-3 bg-gray-50 rounded-lg border border-gray-200">
                        <p className="text-xs text-gray-500 mb-2 font-medium">Invite link (copy if email not configured):</p>
                        <div className="flex items-center gap-2">
                          <input readOnly value={inviteResult.inviteUrl} className="flex-1 text-xs bg-white border border-gray-200 rounded px-2 py-1.5 text-gray-700 font-mono" />
                          <button onClick={() => navigator.clipboard.writeText(inviteResult.inviteUrl)}
                            className="px-2 py-1.5 bg-gray-200 rounded text-xs hover:bg-gray-300">Copy</button>
                        </div>
                      </div>
                    )}
                    <button onClick={() => { setShowInvite(false); setInviteResult(null); setInviteEmail(""); setInviteName(""); }}
                      className="mt-4 px-5 py-2 bg-[#1A6BFF] text-white rounded-lg text-sm font-medium hover:bg-[#0F4FCC]">Done</button>
                  </>
                ) : (
                  <>
                    <p className="text-red-600 font-medium">{inviteResult.error}</p>
                    <button onClick={() => setInviteResult(null)} className="mt-3 text-sm text-gray-500 hover:text-gray-700">Try again</button>
                  </>
                )}
              </div>
            ) : (
              <form onSubmit={sendInvite} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
                  <input type="text" value={inviteName} onChange={e => setInviteName(e.target.value)}
                    className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1A6BFF]" placeholder="Their full name" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Email <span className="text-red-400">*</span></label>
                  <input type="email" value={inviteEmail} onChange={e => setInviteEmail(e.target.value)} required
                    className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1A6BFF]" placeholder="admin@association.com" />
                </div>
                <div className="flex gap-3 pt-1">
                  <button type="button" onClick={() => setShowInvite(false)}
                    className="flex-1 px-4 py-2.5 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 text-sm font-medium">Cancel</button>
                  <button type="submit" disabled={inviteLoading}
                    className="flex-1 px-4 py-2.5 bg-[#1A6BFF] text-white rounded-lg hover:bg-[#0F4FCC] text-sm font-medium disabled:opacity-50">
                    {inviteLoading ? "Sending..." : "Send Invite"}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default function AssociationDashboard() {
  return (
    <QueryClientProvider client={qc}>
      <Suspense fallback={<div className="min-h-screen bg-gray-50 flex items-center justify-center"><div className="animate-spin rounded-full h-10 w-10 border-b-2 border-[#1A6BFF]" /></div>}>
        <Dashboard />
      </Suspense>
    </QueryClientProvider>
  );
}
