"use client";

import { useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { useQuery, useMutation, useQueryClient, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Users, Calendar, Trophy, Plus, ChevronRight, Zap, Copy, Check, ArrowLeft, Trash2, Mail, X, ExternalLink, LogOut } from "lucide-react";
import { OrgAvatar } from "@/lib/orgVisuals";

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
    <div className="min-h-screen bg-app flex items-center justify-center">
      <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-brand" />
    </div>
  );

  if (!orgId) return (
    <div className="min-h-screen bg-app flex items-center justify-center">
      <p className="text-slate-400">No organization selected.</p>
    </div>
  );


  return (
    <div className="min-h-screen bg-app text-slate-100">
      <div className="bg-card border-b border-card-border">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-2 flex justify-end">
          <button onClick={async () => { await fetch("/api/auth/logout", { method: "POST" }); window.location.href = "/account/signin"; }}
            className="flex items-center gap-1.5 text-sm text-slate-400 hover:text-slate-200 py-1">
            <LogOut size={14} /> Sign out
          </button>
        </div>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">


          <div className="flex items-start justify-between flex-wrap gap-4">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <OrgAvatar
                  name={org?.name}
                  logoUrl={org?.logo_url}
                  size={56}
                  onUpload={async (file) => {
                    const fd = new FormData();
                    fd.append("logo", file);
                    const res = await fetch(`/api/organizations/${orgId}/logo`, { method: "POST", body: fd });
                    const data = await res.json();
                    if (!res.ok) throw new Error(data.error || "Upload failed");
                    queryClient.invalidateQueries(["org", orgId]);
                  }}
                  onRemove={async () => {
                    const res = await fetch(`/api/organizations/${orgId}/logo`, { method: "DELETE" });
                    if (res.ok) queryClient.invalidateQueries(["org", orgId]);
                  }}
                />
                <h1 className="text-3xl font-bold text-white">{org?.name || "Association Dashboard"}</h1>
              </div>
              <p className="text-slate-400 text-sm mt-1">Manage age categories, athletes, evaluations, and rankings</p>
            </div>

            <div className="flex items-center gap-3 flex-wrap">
              <button
                onClick={() => { setShowInvite(true); setInviteResult(null); }}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg border border-card-border text-slate-200 hover:bg-card-hover transition-colors text-sm font-medium"
              >
                <Mail size={15} /> Invite Admin
              </button>
              {categories.length > 0 && (
                <a href={`/association/dashboard/add-category?org=${orgId}`}
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-brand text-white font-semibold text-sm hover:bg-brand-strong transition-colors">
                  <Plus size={16} /> Add Age Category
                </a>
              )}
            </div>
          </div>

          {org?.org_code && !serviceProvider && (
            <div className="mt-6 bg-card-hover border border-card-border rounded-xl p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div>
                <p className="text-sm font-semibold text-slate-100">Organization Join Code</p>
                <p className="text-xs text-slate-400 mt-0.5">Share with evaluators to join this association</p>
              </div>
              <div className="flex items-center gap-3">
                <div className="bg-app px-5 py-2.5 rounded-lg border-2 border-brand/40 text-xl font-mono font-bold text-white tracking-widest">
                  {org.org_code}
                </div>
                <button onClick={() => { navigator.clipboard.writeText(org.org_code); setCodeCopied(true); setTimeout(() => setCodeCopied(false), 2000); }}
                  className="px-4 py-2.5 rounded-lg bg-brand text-white hover:bg-brand-strong transition-colors flex items-center gap-2 text-sm font-medium">
                  {codeCopied ? <><Check size={15} /> Copied!</> : <><Copy size={15} /> Copy</>}
                </button>
              </div>
            </div>
          )}

          {categories.length > 0 && (
            <div className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-6">
              {[
                { label: "Age Categories", value: categories.length, icon: Trophy, accent: true },
                { label: "Total Athletes", value: totalAthletes, icon: Users },
                { label: "Total Sessions", value: totalSessions, icon: Calendar },
              ].map(({ label, value, icon: Icon, accent }) => (
                <div key={label} className="bg-card border border-card-border rounded-2xl p-6 hover:bg-card-hover hover:-translate-y-0.5 transition-all relative overflow-hidden">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-slate-400">{label}</p>
                      <p className={`text-4xl font-bold mt-2 ${accent ? "text-accent" : "text-white"}`}>{value}</p>
                    </div>
                    <div className="p-4 rounded-xl bg-app border border-card-border">
                      <Icon className={accent ? "text-accent" : "text-brand"} size={28} />
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
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-6 pt-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            {/* Join Codes */}
            <div className="bg-card border border-card-border rounded-xl overflow-hidden">
              <div className="flex items-center justify-between px-5 py-4 border-b border-card-border">
                <div>
                  <h3 className="text-sm font-semibold text-white">Evaluator Join Codes</h3>
                  <p className="text-xs text-slate-500 mt-0.5">Share with evaluators to let them sign up</p>
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
                  className="inline-flex items-center gap-1.5 px-3 py-2 bg-brand hover:bg-brand-strong text-white rounded-lg text-xs font-semibold transition-colors"
                >
                  + Generate
                </button>
              </div>
              {(joinCodeData.codes || []).filter(c => c.uses < c.max_uses).length === 0 ? (
                <div className="py-6 text-center text-sm text-slate-500">No active codes</div>
              ) : (joinCodeData.codes || []).filter(c => c.uses < c.max_uses).map(code => (
                <div key={code.id} className="flex items-center justify-between px-5 py-3 border-b border-card-border last:border-0">
                  <span className="font-mono font-bold text-white tracking-widest bg-app px-3 py-1 rounded-lg border border-card-border text-sm">
                    {code.code}
                  </span>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-slate-500">{code.uses}/{code.max_uses} uses</span>
                    <button
                      onClick={() => {
                        const url = `${window.location.origin}/evaluator/signup?code=${code.code}`;
                        navigator.clipboard.writeText(url);
                      }}
                      className="text-xs px-3 py-1.5 border border-card-border text-slate-300 rounded-lg hover:bg-card-hover font-medium transition-colors"
                    >
                      Copy Link
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {/* Pending Approvals */}
            <div className="bg-card border border-card-border rounded-xl overflow-hidden">
              <div className="px-5 py-4 border-b border-card-border flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-semibold text-white">Pending Approvals</h3>
                  <p className="text-xs text-slate-500 mt-0.5">Evaluators waiting for access</p>
                </div>
                {(joinCodeData.pending || []).length > 0 && (
                  <span className="text-xs px-2 py-0.5 bg-brand/15 text-brand rounded-full font-medium border border-brand/30">
                    {joinCodeData.pending.length} pending
                  </span>
                )}
              </div>
              {(joinCodeData.pending || []).length === 0 ? (
                <div className="py-6 text-center text-sm text-slate-500">No pending applications</div>
              ) : (joinCodeData.pending || []).map(p => (
                <div key={p.id} className="flex items-center justify-between px-5 py-3 border-b border-card-border last:border-0">
                  <div>
                    <div className="text-sm font-medium text-white">{p.name}</div>
                    <div className="text-xs text-slate-500">{p.email}</div>
                    {p.evaluator_id && <div className="text-xs font-mono text-brand">{p.evaluator_id}</div>}
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
                      className="text-xs px-3 py-1.5 bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 rounded-lg hover:bg-emerald-500/25 font-medium transition-colors"
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
                      className="text-xs px-3 py-1.5 bg-red-500/15 text-red-300 border border-red-500/30 rounded-lg hover:bg-red-500/25 font-medium transition-colors"
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
          <div className="text-center py-20 bg-card rounded-2xl border-2 border-dashed border-card-border">
            <Trophy size={56} className="mx-auto text-slate-600 mb-5" />
            <h3 className="text-2xl font-bold text-white mb-2">No age categories yet</h3>
            <p className="text-slate-400 mb-8 max-w-sm mx-auto">Create your first age category to start organizing athletes and evaluations.</p>
            <a href={`/association/dashboard/add-category?org=${orgId}`}
              className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-brand hover:bg-brand-strong text-white font-semibold transition-colors">
              <Plus size={18} /> Add Age Category
            </a>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {categories.map((cat) => (
              <div key={cat.id} className="group bg-card rounded-2xl border border-card-border p-6 hover:bg-card-hover hover:border-brand/40 transition-all hover:-translate-y-0.5 relative overflow-hidden">
                <div className="absolute top-0 left-0 right-0 h-1 bg-brand rounded-t-2xl opacity-0 group-hover:opacity-100 transition-opacity" />
                <a href={cat.setup_complete ? `/association/dashboard/category/${cat.id}?org=${orgId}` : `/association/dashboard/category/${cat.id}/setup?cat=${cat.id}&org=${orgId}`} className="block">
                  <div className="flex items-center justify-between mb-5">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="text-xl font-bold text-white">{cat.name}</h3>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${cat.setup_complete ? "bg-emerald-500/15 text-emerald-300 border border-emerald-500/30" : "bg-amber-500/15 text-amber-300 border border-amber-500/30"}`}>
                        {cat.setup_complete ? "Active" : "Setup"}
                      </span>
                    </div>
                    <ChevronRight className="text-slate-600 group-hover:text-brand transition-colors" size={22} />
                  </div>
                  <p className="text-sm text-slate-500 mb-5">Ages {cat.min_age}–{cat.max_age}</p>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <div className="text-3xl font-bold text-accent">{cat.athletes_count || 0}</div>
                      <div className="text-xs font-medium text-slate-500 mt-0.5 uppercase tracking-wide">Athletes</div>
                    </div>
                    <div>
                      <div className="text-3xl font-bold text-slate-200">{cat.sessions_count || 0}</div>
                      <div className="text-xs font-medium text-slate-500 mt-0.5 uppercase tracking-wide">Sessions</div>
                    </div>
                  </div>
                  <div className="mt-5 pt-5 border-t border-card-border">
                    <span className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold bg-brand/10 text-brand border border-brand/30 group-hover:bg-brand group-hover:text-white transition-all">
                      Manage <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
                    </span>
                  </div>
                </a>
                <button
                  onClick={(e) => { e.preventDefault(); if (deleteConfirm === cat.id) { deleteMutation.mutate(cat.id); } else { setDeleteConfirm(cat.id); setTimeout(() => setDeleteConfirm(null), 3000); } }}
                  className={`absolute top-4 right-4 p-1.5 rounded-lg transition-all text-xs ${deleteConfirm === cat.id ? "bg-red-600 text-white" : "bg-red-500/15 text-red-400 hover:text-red-300 hover:bg-red-500/25 border border-red-500/30"}`}
                  title={deleteConfirm === cat.id ? "Click again to confirm" : "Delete"}>
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {showInvite && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4" onClick={(e) => e.target === e.currentTarget && setShowInvite(false)}>
          <div className="bg-card border border-card-border rounded-2xl max-w-md w-full p-6 shadow-2xl">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-bold text-white">Invite Association Admin</h2>
              <button onClick={() => setShowInvite(false)} className="p-1 text-slate-400 hover:text-slate-200">
                <X size={18} />
              </button>
            </div>

            {inviteResult ? (
              <div className="text-center py-4">
                {inviteResult.success ? (
                  <>
                    <Check className="w-12 h-12 text-emerald-400 mx-auto mb-3" />
                    <p className="font-semibold text-white mb-2">{inviteResult.message}</p>
                    {inviteResult.inviteUrl && (
                      <div className="mt-4 p-3 bg-app rounded-lg border border-card-border">
                        <p className="text-xs text-slate-500 mb-2 font-medium">Invite link (copy if email not configured):</p>
                        <div className="flex items-center gap-2">
                          <input readOnly value={inviteResult.inviteUrl} className="flex-1 text-xs bg-card border border-card-border rounded px-2 py-1.5 text-slate-300 font-mono" />
                          <button onClick={() => navigator.clipboard.writeText(inviteResult.inviteUrl)}
                            className="px-2 py-1.5 bg-card-hover rounded text-xs text-slate-200 hover:bg-card-border">Copy</button>
                        </div>
                      </div>
                    )}
                    <button onClick={() => { setShowInvite(false); setInviteResult(null); setInviteEmail(""); setInviteName(""); }}
                      className="mt-4 px-5 py-2 bg-brand text-white rounded-lg text-sm font-medium hover:bg-brand-strong">Done</button>
                  </>
                ) : (
                  <>
                    <p className="text-red-400 font-medium">{inviteResult.error}</p>
                    <button onClick={() => setInviteResult(null)} className="mt-3 text-sm text-slate-400 hover:text-slate-200">Try again</button>
                  </>
                )}
              </div>
            ) : (
              <form onSubmit={sendInvite} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-200 mb-1">Name</label>
                  <input type="text" value={inviteName} onChange={e => setInviteName(e.target.value)}
                    className="w-full px-3 py-2.5 bg-app border border-card-border text-slate-100 placeholder:text-slate-500 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand" placeholder="Their full name" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-200 mb-1">Email <span className="text-red-400">*</span></label>
                  <input type="email" value={inviteEmail} onChange={e => setInviteEmail(e.target.value)} required
                    className="w-full px-3 py-2.5 bg-app border border-card-border text-slate-100 placeholder:text-slate-500 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand" placeholder="admin@association.com" />
                </div>
                <div className="flex gap-3 pt-1">
                  <button type="button" onClick={() => setShowInvite(false)}
                    className="flex-1 px-4 py-2.5 border border-card-border text-slate-200 rounded-lg hover:bg-card-hover text-sm font-medium transition-colors">Cancel</button>
                  <button type="submit" disabled={inviteLoading}
                    className="flex-1 px-4 py-2.5 bg-brand text-white rounded-lg hover:bg-brand-strong text-sm font-medium disabled:opacity-50 transition-colors">
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
      <Suspense fallback={<div className="min-h-screen bg-app flex items-center justify-center"><div className="animate-spin rounded-full h-10 w-10 border-b-2 border-brand" /></div>}>
        <Dashboard />
      </Suspense>
    </QueryClientProvider>
  );
}
