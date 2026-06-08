"use client";

import { useState, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Trophy, Plus, Copy, Check, Trash2, Mail, X, LogOut } from "lucide-react";
import { OrgAvatar } from "@/lib/orgVisuals";
import { useTrackPageView } from "@/lib/useAnalytics";
import ConfirmDialog from "@/components/ConfirmDialog";

const qc = new QueryClient();

function Dashboard() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const orgId = searchParams.get("org");
  useTrackPageView("dashboard.association.viewed", { orgId });

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
  const [categorySearch, setCategorySearch] = useState("");
  const [approvalSearch, setApprovalSearch] = useState("");
  const [showAllApprovals, setShowAllApprovals] = useState(false);
  const APPROVALS_CAP = 10;

  const { data: myOrgsData } = useQuery({
    queryKey: ["my-organizations"],
    queryFn: async () => {
      const res = await fetch("/api/organizations");
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
  });
  const myOrgs = myOrgsData?.organizations || [];

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

  const filteredCategories = categorySearch.trim()
    ? categories.filter(c => c.name.toLowerCase().includes(categorySearch.trim().toLowerCase()))
    : categories;

  const allPending = joinCodeData?.pending || [];
  const filteredPending = approvalSearch.trim()
    ? allPending.filter(p =>
        (p.name || "").toLowerCase().includes(approvalSearch.trim().toLowerCase()) ||
        (p.email || "").toLowerCase().includes(approvalSearch.trim().toLowerCase())
      )
    : allPending;
  const visiblePending = showAllApprovals ? filteredPending : filteredPending.slice(0, APPROVALS_CAP);
  const hasMorePending = filteredPending.length > APPROVALS_CAP && !showAllApprovals;

  if (orgLoading || catLoading) return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-accent" />
    </div>
  );

  if (!orgId) return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <p className="text-gray-500">No organization selected.</p>
    </div>
  );


  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white border-b border-gray-200 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-2 flex justify-end">
          <button onClick={async () => { await fetch("/api/auth/logout", { method: "POST" }); window.location.href = "/account/signin"; }}
            className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 py-1">
            <LogOut size={14} /> Sign out
          </button>
        </div>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-8 pt-1">

          <div className="flex items-start justify-between flex-wrap gap-4">
            <div className="min-w-0">
              <div className="font-display text-xs font-bold tracking-[0.2em] uppercase text-accent mb-2">Association Dashboard</div>
              <div className="flex items-end gap-4 flex-wrap">
                <h1 className="font-display font-black tracking-tight text-ink text-4xl sm:text-5xl leading-none">{org?.name || "Association"}</h1>
                <OrgAvatar
                  name={org?.name}
                  logoUrl={org?.logo_url}
                  size={48}
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
              </div>
              {categories.length > 0 && (
                <div className="flex items-center gap-2 mt-3 flex-wrap text-sm text-gray-500 font-medium">
                  <span><b className="text-ink">{categories.length}</b> age categor{categories.length === 1 ? "y" : "ies"}</span>
                  <span className="text-gray-300">·</span>
                  <span><b className="text-ink">{totalAthletes}</b> athletes</span>
                  <span className="text-gray-300">·</span>
                  <span><b className="text-ink">{totalSessions}</b> sessions</span>
                </div>
              )}
            </div>

            <div className="flex items-center gap-3 flex-wrap">
              {myOrgs.length > 1 && (
                <select
                  value={orgId || ""}
                  onChange={(e) => { router.push(`/association/dashboard?org=${e.target.value}`); }}
                  className="px-3 py-2.5 rounded-lg border border-gray-300 text-gray-700 bg-white text-sm font-medium focus:outline-none focus:ring-2 focus:ring-accent/30 cursor-pointer max-w-[14rem]"
                  aria-label="Switch club"
                >
                  {myOrgs.map(o => (
                    <option key={o.id} value={o.id}>{o.name}</option>
                  ))}
                </select>
              )}
              <button
                onClick={() => { setShowInvite(true); setInviteResult(null); }}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50 transition-colors text-sm font-medium"
              >
                <Mail size={15} /> Invite Admin
              </button>
              {categories.length > 0 && (
                <a href={`/association/dashboard/add-category?org=${orgId}`}
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-accent text-white font-semibold text-sm hover:shadow-lg transition-shadow">
                  <Plus size={16} /> Add Age Category
                </a>
              )}
            </div>
          </div>

          {org?.org_code && !serviceProvider && (
            <div className="mt-6 bg-accent-soft border border-accent/20 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div>
                <p className="text-sm font-semibold text-gray-700">Organization Join Code</p>
                <p className="text-xs text-gray-500 mt-0.5">Share with evaluators to join this association</p>
              </div>
              <div className="flex items-center gap-3">
                <div className="bg-white px-5 py-2.5 rounded-lg border-2 border-accent/30 text-xl font-mono font-bold text-ink tracking-widest">
                  {org.org_code}
                </div>
                <button onClick={() => { navigator.clipboard.writeText(org.org_code); setCodeCopied(true); setTimeout(() => setCodeCopied(false), 2000); }}
                  className="px-4 py-2.5 rounded-lg bg-accent text-white hover:opacity-90 transition-opacity flex items-center gap-2 text-sm font-medium">
                  {codeCopied ? <><Check size={15} /> Copied!</> : <><Copy size={15} /> Copy</>}
                </button>
              </div>
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
                  className="inline-flex items-center gap-1.5 px-3 py-2 bg-accent text-white rounded-lg text-xs font-semibold"
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
                {allPending.length > 0 && (
                  <span className="text-xs px-2 py-0.5 bg-accent-soft text-accent rounded-full font-medium">
                    {allPending.length} pending
                  </span>
                )}
              </div>
              {allPending.length > APPROVALS_CAP && (
                <div className="px-5 pt-3 pb-1 relative">
                  <input
                    type="text"
                    value={approvalSearch}
                    onChange={e => { setApprovalSearch(e.target.value); setShowAllApprovals(false); }}
                    placeholder="Search by name or email…"
                    className="w-full pl-8 pr-7 py-1.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-accent/30 bg-white text-ink placeholder:text-gray-400"
                  />
                  <svg className="absolute left-7.5 top-1/2 mt-0.5 -translate-y-1/2 text-gray-400 pointer-events-none" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
                  {approvalSearch && (
                    <button
                      onClick={() => setApprovalSearch("")}
                      className="absolute right-7 top-1/2 mt-0.5 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                      aria-label="Clear search"
                    >
                      <X size={13} />
                    </button>
                  )}
                </div>
              )}
              {allPending.length === 0 ? (
                <div className="py-6 text-center text-sm text-gray-400">No pending applications</div>
              ) : filteredPending.length === 0 ? (
                <div className="py-6 text-center text-sm text-gray-400">No results for "{approvalSearch}"</div>
              ) : (
                <>
                  {visiblePending.map(p => (
                    <div key={p.id} className="flex items-center justify-between px-5 py-3 border-b border-gray-50 last:border-0">
                      <div>
                        <div className="text-sm font-medium text-gray-900">{p.name}</div>
                        <div className="text-xs text-gray-400">{p.email}</div>
                        {p.evaluator_id && <div className="text-xs font-mono text-accent">{p.evaluator_id}</div>}
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
                  {hasMorePending && (
                    <button
                      onClick={() => setShowAllApprovals(true)}
                      className="w-full py-2.5 text-xs font-semibold text-accent hover:bg-accent-soft transition-colors border-t border-gray-100"
                    >
                      Show all {filteredPending.length} pending
                    </button>
                  )}
                  {showAllApprovals && filteredPending.length > APPROVALS_CAP && (
                    <button
                      onClick={() => setShowAllApprovals(false)}
                      className="w-full py-2.5 text-xs font-semibold text-gray-400 hover:bg-gray-50 transition-colors border-t border-gray-100"
                    >
                      Show less
                    </button>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">


        {categories.length === 0 ? (
          <div className="text-center py-20 bg-white rounded-2xl border border-dashed border-gray-300">
            <Trophy size={56} className="mx-auto text-gray-300 mb-5" />
            <h3 className="font-display font-black tracking-tight text-ink text-2xl mb-2">No age categories yet</h3>
            <p className="text-gray-500 mb-8 max-w-sm mx-auto">Create your first age category to start organizing athletes and evaluations.</p>
            <a href={`/association/dashboard/add-category?org=${orgId}`}
              className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-accent text-white font-semibold hover:opacity-90 transition-opacity">
              <Plus size={18} /> Add Age Category
            </a>
          </div>
        ) : (
          <>
            {categories.length > 6 && (
              <div className="mb-5 relative max-w-sm">
                <input
                  type="text"
                  value={categorySearch}
                  onChange={e => setCategorySearch(e.target.value)}
                  placeholder="Search categories…"
                  className="w-full pl-9 pr-8 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-accent/30 bg-white text-ink placeholder:text-gray-400"
                />
                <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
                {categorySearch && (
                  <button
                    onClick={() => setCategorySearch("")}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                    aria-label="Clear search"
                  >
                    <X size={14} />
                  </button>
                )}
              </div>
            )}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {filteredCategories.length === 0 ? (
              <div className="col-span-full text-center py-12 text-gray-400 text-sm">
                No categories match <span className="font-medium text-ink">"{categorySearch}"</span>
              </div>
            ) : filteredCategories.map((cat) => {
              const ready = cat.setup_complete;
              return (
              <div key={cat.id} className="group relative bg-white rounded-2xl border border-[#ededeb] p-5 transition-all hover:border-accent/40 hover:shadow-[0_20px_50px_-34px_rgba(10,12,16,0.35)]">
                <a href={ready ? `/association/dashboard/category/${cat.id}?org=${orgId}` : `/association/dashboard/category/${cat.id}/setup?cat=${cat.id}&org=${orgId}`} className="block">
                  <div className="mb-3">
                    <span className={`inline-flex items-center gap-1.5 font-display text-[11px] font-bold tracking-[0.12em] uppercase px-2.5 py-1 rounded-full ${ready ? "bg-green-50 text-green-700" : "bg-amber-50 text-amber-700"}`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${ready ? "bg-green-500" : "bg-amber-500"}`} />
                      {ready ? "Active" : "Needs setup"}
                    </span>
                  </div>
                  <h3 className="font-display font-black tracking-tight text-ink text-2xl leading-none">{cat.name}</h3>
                  <p className="text-xs text-gray-400 mt-1.5">Ages {cat.min_age}–{cat.max_age}</p>
                  <div className="flex items-center gap-2 mt-4 text-sm text-gray-500 font-medium">
                    <span><b className="text-ink tabular-nums">{cat.athletes_count || 0}</b> athletes</span>
                    <span className="text-gray-300">·</span>
                    <span><b className="text-ink tabular-nums">{cat.sessions_count || 0}</b> sessions</span>
                  </div>
                  <div className="mt-4 pt-4 border-t border-[#ededeb]">
                    <span className="inline-flex items-center gap-1.5 font-display text-xs font-bold tracking-wide text-accent group-hover:gap-2.5 transition-all">
                      {ready ? "Open rankings" : "Finish setup"}
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
                    </span>
                  </div>
                </a>
                <button
                  onClick={(e) => { e.preventDefault(); setDeleteConfirm(cat); }}
                  className="absolute top-4 right-4 p-1.5 rounded-lg transition-all text-xs bg-red-50 text-red-400 hover:text-red-600 hover:bg-red-100 opacity-0 group-hover:opacity-100"
                  title="Delete category">
                  <Trash2 size={14} />
                </button>
              </div>
              );
            })}
          </div>
          </>
        )}
      </div>

      <ConfirmDialog
        open={!!deleteConfirm}
        title={`Delete ${deleteConfirm?.name || "this category"}?`}
        message="This permanently removes the category along with all its athletes, sessions, schedule, and scores. This can't be undone."
        confirmLabel="Delete category"
        busy={deleteMutation.isPending}
        onConfirm={() => deleteConfirm && deleteMutation.mutate(deleteConfirm.id)}
        onCancel={() => setDeleteConfirm(null)}
      />

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
                      className="mt-4 px-5 py-2 bg-accent text-white rounded-lg text-sm font-medium hover:opacity-90">Done</button>
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
                    className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-accent" placeholder="Their full name" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Email <span className="text-red-400">*</span></label>
                  <input type="email" value={inviteEmail} onChange={e => setInviteEmail(e.target.value)} required
                    className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-accent" placeholder="admin@association.com" />
                </div>
                <div className="flex gap-3 pt-1">
                  <button type="button" onClick={() => setShowInvite(false)}
                    className="flex-1 px-4 py-2.5 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 text-sm font-medium">Cancel</button>
                  <button type="submit" disabled={inviteLoading}
                    className="flex-1 px-4 py-2.5 bg-accent text-white rounded-lg hover:opacity-90 text-sm font-medium disabled:opacity-50">
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
      <Suspense fallback={<div className="min-h-screen bg-gray-50 flex items-center justify-center"><div className="animate-spin rounded-full h-10 w-10 border-b-2 border-accent" /></div>}>
        <Dashboard />
      </Suspense>
    </QueryClientProvider>
  );
}
