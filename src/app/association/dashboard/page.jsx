"use client";

import { useState, useEffect, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Trophy, Plus, Copy, Check, Trash2, Mail, X, LogOut, LayoutGrid, UserCheck, Calendar, Clock, MapPin, AlertTriangle, ChevronRight, Shield, Search } from "lucide-react";
import { OrgAvatar } from "@/lib/orgVisuals";
import { useTrackPageView } from "@/lib/useAnalytics";
import ConfirmDialog from "@/components/ConfirmDialog";
import { useTheme } from "@/lib/useTheme";
import ThemeToggle from "@/components/ThemeToggle";

const qc = new QueryClient();

function fmtDate(d) {
  if (!d) return "";
  const s = d.toString().split("T")[0];
  const [y, m, dd] = s.split("-").map(Number);
  if (!y) return s;
  return new Date(y, m - 1, dd).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}
function fmtTime(t) {
  if (!t) return "";
  const [h, m] = t.toString().split(":");
  const hr = parseInt(h);
  return `${hr > 12 ? hr - 12 : (hr === 0 ? 12 : hr)}:${m} ${hr >= 12 ? "PM" : "AM"}`;
}

// Association-wide goalie evaluation: set once, every category inherits it.
function GoalieEvalCard({ orgId }) {
  const [data, setData] = useState(null);
  const [q, setQ] = useState("");
  const [showInvite, setShowInvite] = useState(false);
  const [inviteName, setInviteName] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);

  const load = () => fetch(`/api/organizations/${orgId}/goalie-provider`).then(r => r.json()).then(setData).catch(() => {});
  useEffect(() => { if (orgId) load(); }, [orgId]); // eslint-disable-line

  const post = async (payload, okMsg) => {
    setBusy(true); setMsg(null);
    const res = await fetch(`/api/organizations/${orgId}/goalie-provider`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    const d = await res.json(); setBusy(false);
    if (res.ok) { if (okMsg) setMsg({ type: "ok", text: typeof okMsg === "function" ? okMsg(d) : okMsg }); load(); return d; }
    setMsg({ type: "err", text: d.error || "Failed" }); return null;
  };
  const setMode = (m) => post({ action: "set_mode", goalie_eval_mode: m });
  const link = (id) => post({ action: "link", goalie_sp_id: id }, "Connected ✓");
  const invite = async () => {
    if (!inviteName || !inviteEmail) return;
    const d = await post({ action: "invite", name: inviteName, email: inviteEmail }, (r) => r.invite?.url ? `Invited ${r.name}. Invite link: ${r.invite.url}` : `Invited ${r.name}.`);
    if (d) { setShowInvite(false); setInviteName(""); setInviteEmail(""); }
  };

  const mode = data?.goalie_eval_mode || "association";
  const providers = data?.providers || [];
  const linked = data?.linked || null;
  const filtered = providers.filter(p => p.name.toLowerCase().includes(q.toLowerCase()));
  const OPTIONS = [
    { value: "association", label: "We evaluate in-house" },
    { value: "service_provider", label: "Our service provider does it" },
    { value: "goalie_service_provider", label: "A goalie service provider does it" },
  ];

  return (
    <section className="bg-white border border-gray-200 rounded-xl overflow-hidden">
      <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-2">
        <Shield size={16} className="text-accent" />
        <div>
          <h3 className="text-sm font-semibold text-gray-900">Goalie Evaluation</h3>
          <p className="text-xs text-gray-400 mt-0.5">Set once — every age category inherits this.</p>
        </div>
      </div>
      <div className="p-5">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mb-4">
          {OPTIONS.map(o => (
            <button key={o.value} onClick={() => setMode(o.value)} disabled={busy} className={`text-left p-3 rounded-lg border-2 text-sm transition-all ${mode === o.value ? "border-accent bg-accent-soft" : "border-gray-200 hover:border-gray-300"}`}>
              <div className="flex items-center justify-between"><span className="font-medium text-gray-800">{o.label}</span>{mode === o.value && <Check size={14} className="text-accent" />}</div>
            </button>
          ))}
        </div>

        {mode === "goalie_service_provider" && (
          <div className="border-t border-gray-100 pt-4">
            {linked && <div className="flex items-center justify-between bg-green-50 border border-green-200 rounded-lg px-3 py-2 mb-3 text-sm"><span className="text-green-800 font-medium flex items-center gap-1.5"><Check size={14} /> Connected: {linked.name}</span></div>}
            <div className="relative mb-3"><Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" /><input value={q} onChange={e => setQ(e.target.value)} placeholder="Search goalie service providers…" className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-accent/30" /></div>
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {filtered.length === 0 && <p className="text-xs text-gray-400 px-1">No matches — invite one below.</p>}
              {filtered.map(p => (
                <button key={p.id} onClick={() => link(p.id)} disabled={busy} className={`w-full flex items-center justify-between px-3 py-2 rounded-lg border text-left text-sm ${linked?.id === p.id ? "border-accent bg-accent-soft" : "border-gray-200 hover:border-gray-300"}`}>
                  <span className="font-medium text-gray-800">{p.name}</span>
                  {linked?.id === p.id ? <span className="text-xs text-accent font-semibold flex items-center gap-1"><Check size={13} /> Connected</span> : <span className="text-xs text-gray-400">Connect</span>}
                </button>
              ))}
            </div>
            {!showInvite ? (
              <button onClick={() => setShowInvite(true)} className="mt-3 inline-flex items-center gap-1.5 text-xs text-accent hover:opacity-70 font-medium"><Plus size={13} /> Not listed? Add &amp; invite a goalie SP</button>
            ) : (
              <div className="mt-3 bg-gray-50 border border-gray-200 rounded-lg p-3 space-y-2">
                <input value={inviteName} onChange={e => setInviteName(e.target.value)} placeholder="Company name" className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
                <input value={inviteEmail} onChange={e => setInviteEmail(e.target.value)} placeholder="Admin email" type="email" className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
                <div className="flex gap-2">
                  <button onClick={() => setShowInvite(false)} className="px-3 py-1.5 border border-gray-300 text-gray-600 rounded-lg text-xs">Cancel</button>
                  <button onClick={invite} disabled={busy || !inviteName || !inviteEmail} className="px-3 py-1.5 bg-accent text-white rounded-lg text-xs font-semibold disabled:opacity-50">{busy ? "Inviting…" : "Create & invite"}</button>
                </div>
              </div>
            )}
          </div>
        )}
        {msg && <p className={`text-xs mt-3 break-words ${msg.type === "ok" ? "text-green-600" : "text-red-500"}`}>{msg.text}</p>}
      </div>
    </section>
  );
}

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
  const [goalieEvalOpen, setGoalieEvalOpen] = useState(false);
  const [categorySearch, setCategorySearch] = useState("");
  const [approvalSearch, setApprovalSearch] = useState("");
  const [showAllApprovals, setShowAllApprovals] = useState(false);
  const APPROVALS_CAP = 10;
  const [theme, toggleTheme] = useTheme();

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
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["categories", orgId] }); setDeleteConfirm(null); },
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

  const signOut = async () => { await fetch("/api/auth/logout", { method: "POST" }); window.location.href = "/account/signin"; };

  const org = orgData?.organization;
  const serviceProvider = orgData?.service_provider || null;
  // Order categories by age group (U9 before U11AA), then by name — so the grid
  // flows youngest → oldest regardless of when each was created.
  const ageKey = (name) => { const m = String(name || "").match(/\d+/); return m ? parseInt(m[0], 10) : 999; };
  const categories = [...(categoriesData?.categories || [])].sort((a, b) => ageKey(a.name) - ageKey(b.name) || String(a.name).localeCompare(String(b.name)));
  const upcoming = categoriesData?.upcoming || [];
  const upcomingTotal = categoriesData?.upcomingTotal ?? upcoming.length;
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

  // ── Needs-attention items (association-wide, derived from data on hand) ──
  const needSetup = categories.filter(c => !c.setup_complete);
  const understaffed = upcoming.filter(s => (parseInt(s.evaluators_required) || 0) > 0 && (parseInt(s.signups) || 0) < (parseInt(s.evaluators_required) || 0));
  // Evaluations complete = setup done, has sessions, and every session is marked complete → time to build teams.
  const readyForTeams = categories.filter(c => c.setup_complete && parseInt(c.cs_total) > 0 && parseInt(c.cs_complete) === parseInt(c.cs_total));
  const attention = [
    ...readyForTeams.map(c => ({ icon: Trophy, tone: "emerald", text: `${c.name} evaluations are complete — it's time to make teams`, href: `/association/dashboard/category/${c.id}/teams?org=${orgId}` })),
    !serviceProvider && allPending.length > 0 && { icon: UserCheck, tone: "amber", text: `${allPending.length} evaluator${allPending.length === 1 ? "" : "s"} awaiting approval`, anchor: "approvals" },
    needSetup.length > 0 && { icon: AlertTriangle, tone: "amber", text: `${needSetup.length} categor${needSetup.length === 1 ? "y" : "ies"} need setup`, anchor: "categories" },
    !serviceProvider && understaffed.length > 0 && { icon: Calendar, tone: "amber", text: `${understaffed.length} upcoming session${understaffed.length === 1 ? "" : "s"} need evaluators`, anchor: "categories" },
  ].filter(Boolean);

  const jumpTo = (id) => document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });

  if (orgLoading || catLoading) return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center" data-theme="premium">
      <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-accent" />
    </div>
  );

  if (!orgId) return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center" data-theme="premium">
      <p className="text-gray-500">No organization selected.</p>
    </div>
  );

  // Guard: this is the ASSOCIATION dashboard. If the org is a (goalie) service
  // provider, send the user to the right place instead of rendering it as an association.
  if (org && org.type && org.type !== "association") {
    const dest = org.type === "goalie_service_provider" ? `/goalie-provider/dashboard?org=${org.id}`
      : org.type === "service_provider" ? "/service-provider/dashboard" : null;
    const label = org.type === "goalie_service_provider" ? "Goalie Service Provider"
      : org.type === "service_provider" ? "Service Provider" : org.type;
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6" data-theme="premium">
        <div className="bg-white border border-gray-200 rounded-2xl p-8 max-w-md text-center">
          <h2 className="font-display font-bold text-ink text-xl mb-2">{org.name} isn't an association</h2>
          <p className="text-sm text-gray-500 mb-5">This is a <b className="text-ink">{label}</b>. The association dashboard only manages associations.</p>
          {dest && <a href={dest} className="inline-flex items-center gap-2 px-5 py-2.5 bg-accent text-white rounded-lg text-sm font-semibold hover:opacity-90">Open the {label} dashboard →</a>}
        </div>
      </div>
    );
  }

  const navItems = [
    { id: "categories", label: "Age Categories", icon: LayoutGrid },
    ...(!serviceProvider ? [{ id: "approvals", label: "Join & Approvals", icon: UserCheck, badge: allPending.length || null }] : []),
  ];

  return (
    <div className="min-h-screen bg-gray-50 flex" data-theme={theme}>

      {/* ── Sidebar (desktop) ── */}
      <aside className="hidden lg:flex flex-col w-64 shrink-0 sticky top-0 h-screen bg-white border-r border-gray-200">
        <div className="px-6 pt-7 pb-6 border-b border-gray-100">
          <div className="flex items-center gap-2.5">
            <img src="/mark-gold.svg" alt="Sideline Star" className="h-9 w-10 object-contain" />
            <div className="min-w-0">
              <div className="font-display italic font-black text-accent text-base uppercase tracking-[0.16em] leading-none">Sideline Star</div>
              <div className="font-mono text-[9px] text-gray-400 mt-1 tracking-[0.28em]">ASSOCIATION</div>
            </div>
          </div>
          {myOrgs.length > 1 && (
            <select
              value={orgId || ""}
              onChange={(e) => router.push(`/association/dashboard?org=${e.target.value}`)}
              className="mt-5 w-full px-3 py-2 rounded-lg border border-gray-300 bg-white text-sm font-medium text-ink focus:outline-none focus:ring-2 focus:ring-accent/30 cursor-pointer"
              aria-label="Switch club"
            >
              {myOrgs.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
            </select>
          )}
        </div>

        <nav className="flex-1 py-4">
          {navItems.map(item => {
            const Icon = item.icon;
            return (
              <button key={item.id} onClick={() => jumpTo(item.id)}
                className="w-full flex items-center gap-3 px-6 py-3 text-gray-500 hover:bg-gray-100 hover:text-ink transition-colors text-sm font-medium">
                <Icon size={18} /> <span className="flex-1 text-left">{item.label}</span>
                {item.badge ? <span className="text-[11px] px-2 py-0.5 bg-accent-soft text-accent rounded-full font-semibold">{item.badge}</span> : null}
              </button>
            );
          })}
        </nav>

        <div className="px-4 py-4 border-t border-gray-100 space-y-2">
          <a href={`/association/dashboard/add-category?org=${orgId}`}
            className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-accent text-white font-semibold text-sm hover:opacity-90 transition-opacity">
            <Plus size={16} /> Add Category
          </a>
          <button onClick={() => setGoalieEvalOpen(true)}
            className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50 transition-colors text-sm font-medium">
            <Shield size={15} /> Goalie Evaluation
          </button>
          <button onClick={() => { setShowInvite(true); setInviteResult(null); }}
            className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50 transition-colors text-sm font-medium">
            <Mail size={15} /> Invite Admin
          </button>
          <button onClick={signOut} className="w-full inline-flex items-center justify-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 py-1.5">
            <LogOut size={14} /> Sign out
          </button>
        </div>
      </aside>

      {/* ── Main ── */}
      <div className="flex-1 min-w-0">
        {/* Mobile top bar */}
        <div className="lg:hidden bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <img src="/mark-gold.svg" alt="Sideline Star" className="h-7 w-8 object-contain" />
            <span className="font-display italic font-black text-accent text-sm uppercase tracking-[0.14em]">Sideline Star</span>
          </div>
          <button onClick={signOut} className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700"><LogOut size={14} /> Sign out</button>
        </div>

        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6 lg:py-10">
          {/* Page header */}
          <div className="flex items-start justify-between flex-wrap gap-4 mb-8">
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
                    queryClient.invalidateQueries({ queryKey: ["org", orgId] });
                  }}
                  onRemove={async () => {
                    const res = await fetch(`/api/organizations/${orgId}/logo`, { method: "DELETE" });
                    if (res.ok) queryClient.invalidateQueries({ queryKey: ["org", orgId] });
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
            {/* Desktop: theme toggle top-right (consistent with other pages) */}
            <div className="hidden lg:flex items-center">
              <ThemeToggle theme={theme} onToggle={toggleTheme} />
            </div>
            {/* Mobile-only actions (sidebar holds these on desktop) */}
            <div className="flex lg:hidden items-center gap-2 flex-wrap">
              <ThemeToggle theme={theme} onToggle={toggleTheme} />
              {myOrgs.length > 1 && (
                <select value={orgId || ""} onChange={(e) => router.push(`/association/dashboard?org=${e.target.value}`)}
                  className="px-3 py-2 rounded-lg border border-gray-300 bg-white text-sm font-medium text-ink focus:outline-none focus:ring-2 focus:ring-accent/30 max-w-[12rem]" aria-label="Switch club">
                  {myOrgs.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
                </select>
              )}
              <button onClick={() => { setShowInvite(true); setInviteResult(null); }} className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-300 text-gray-700 text-sm font-medium"><Mail size={15} /> Invite</button>
              <a href={`/association/dashboard/add-category?org=${orgId}`} className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-accent text-white font-semibold text-sm"><Plus size={16} /> Add</a>
            </div>
          </div>

          {/* Two-column: content + right rail */}
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
            <div className="xl:col-span-2 space-y-8">

              {/* Org join code banner */}
              {org?.org_code && !serviceProvider && (
                <div className="bg-accent-soft border border-accent/20 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                  <div>
                    <p className="text-sm font-semibold text-gray-700">Organization Join Code</p>
                    <p className="text-xs text-gray-500 mt-0.5">Share with evaluators to join this association</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="bg-white px-5 py-2.5 rounded-lg border-2 border-accent/30 text-xl font-mono font-bold text-ink tracking-widest">{org.org_code}</div>
                    <button onClick={() => { navigator.clipboard.writeText(org.org_code); setCodeCopied(true); setTimeout(() => setCodeCopied(false), 2000); }}
                      className="px-4 py-2.5 rounded-lg bg-accent text-white hover:opacity-90 transition-opacity flex items-center gap-2 text-sm font-medium">
                      {codeCopied ? <><Check size={15} /> Copied!</> : <><Copy size={15} /> Copy</>}
                    </button>
                  </div>
                </div>
              )}

              {/* Categories */}
              <section id="categories" className="scroll-mt-6">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="font-display font-bold text-ink text-xl">Age Categories</h2>
                  {categories.length > 6 && (
                    <div className="relative max-w-[14rem]">
                      <input type="text" value={categorySearch} onChange={e => setCategorySearch(e.target.value)} placeholder="Search…"
                        className="w-full pl-8 pr-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-accent/30 bg-white text-ink placeholder:text-gray-400" />
                      <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" /></svg>
                    </div>
                  )}
                </div>

                {categories.length === 0 ? (
                  <div className="text-center py-16 bg-white rounded-2xl border border-dashed border-gray-300">
                    <Trophy size={48} className="mx-auto text-gray-300 mb-4" />
                    <h3 className="font-display font-black tracking-tight text-ink text-xl mb-2">No age categories yet</h3>
                    <p className="text-gray-500 mb-6 max-w-sm mx-auto text-sm">Create your first age category to start organizing athletes and evaluations.</p>
                    <a href={`/association/dashboard/add-category?org=${orgId}`} className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-accent text-white font-semibold hover:opacity-90 transition-opacity"><Plus size={18} /> Add Age Category</a>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {filteredCategories.length === 0 ? (
                      <div className="col-span-full text-center py-12 text-gray-400 text-sm">No categories match <span className="font-medium text-ink">&quot;{categorySearch}&quot;</span></div>
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
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M5 12h14M12 5l7 7-7 7" /></svg>
                              </span>
                            </div>
                          </a>
                          <button onClick={(e) => { e.preventDefault(); setDeleteConfirm(cat); }}
                            className="absolute top-4 right-4 p-1.5 rounded-lg transition-all text-xs bg-red-50 text-red-400 hover:text-red-600 hover:bg-red-100 opacity-0 group-hover:opacity-100" title="Delete category">
                            <Trash2 size={14} />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>

              {/* Goalie evaluation lives in the sidebar (Goalie Evaluation button) → modal below */}

              {/* Join Codes + Pending Approvals — hidden if association has an SP */}
              {joinCodeData && !serviceProvider && (
                <section id="approvals" className="scroll-mt-6 grid grid-cols-1 md:grid-cols-2 gap-5">
                  {/* Join Codes */}
                  <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                    <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
                      <div>
                        <h3 className="text-sm font-semibold text-gray-900">Evaluator Join Codes</h3>
                        <p className="text-xs text-gray-400 mt-0.5">Share with evaluators to let them sign up</p>
                      </div>
                      <button
                        onClick={async () => {
                          await fetch(`/api/organizations/${orgId}/join-codes`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "generate", max_uses: 100 }) });
                          refetchCodes();
                        }}
                        className="inline-flex items-center gap-1.5 px-3 py-2 bg-accent text-white rounded-lg text-xs font-semibold">+ Generate</button>
                    </div>
                    {(joinCodeData.codes || []).filter(c => c.uses < c.max_uses).length === 0 ? (
                      <div className="py-6 text-center text-sm text-gray-400">No active codes</div>
                    ) : (joinCodeData.codes || []).filter(c => c.uses < c.max_uses).map(code => (
                      <div key={code.id} className="flex items-center justify-between px-5 py-3 border-b border-gray-50 last:border-0">
                        <span className="font-mono font-bold text-gray-900 tracking-widest bg-gray-50 px-3 py-1 rounded-lg border border-gray-200 text-sm">{code.code}</span>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-gray-400">{code.uses}/{code.max_uses} uses</span>
                          <button onClick={() => { const url = `${window.location.origin}/evaluator/signup?code=${code.code}`; navigator.clipboard.writeText(url); }}
                            className="text-xs px-3 py-1.5 border border-gray-200 text-gray-600 rounded-lg hover:bg-gray-50 font-medium">Copy Link</button>
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
                      {allPending.length > 0 && <span className="text-xs px-2 py-0.5 bg-accent-soft text-accent rounded-full font-medium">{allPending.length} pending</span>}
                    </div>
                    {allPending.length > APPROVALS_CAP && (
                      <div className="px-5 pt-3 pb-1 relative">
                        <input type="text" value={approvalSearch} onChange={e => { setApprovalSearch(e.target.value); setShowAllApprovals(false); }} placeholder="Search by name or email…"
                          className="w-full pl-8 pr-7 py-1.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-accent/30 bg-white text-ink placeholder:text-gray-400" />
                        <svg className="absolute left-7.5 top-1/2 mt-0.5 -translate-y-1/2 text-gray-400 pointer-events-none" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" /></svg>
                        {approvalSearch && <button onClick={() => setApprovalSearch("")} className="absolute right-7 top-1/2 mt-0.5 -translate-y-1/2 text-gray-400 hover:text-gray-600" aria-label="Clear search"><X size={13} /></button>}
                      </div>
                    )}
                    {allPending.length === 0 ? (
                      <div className="py-6 text-center text-sm text-gray-400">No pending applications</div>
                    ) : filteredPending.length === 0 ? (
                      <div className="py-6 text-center text-sm text-gray-400">No results for &quot;{approvalSearch}&quot;</div>
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
                              <button onClick={async () => { await fetch(`/api/organizations/${orgId}/join-codes`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "approve", membership_id: p.membership_id, user_id: p.id }) }); refetchCodes(); }}
                                className="text-xs px-3 py-1.5 bg-green-100 text-green-700 rounded-lg hover:bg-green-200 font-medium">Approve</button>
                              <button onClick={async () => { if (confirm(`Deny ${p.name}?`)) { await fetch(`/api/organizations/${orgId}/join-codes`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "deny", membership_id: p.membership_id }) }); refetchCodes(); } }}
                                className="text-xs px-3 py-1.5 bg-red-50 text-red-600 rounded-lg hover:bg-red-100 font-medium">Deny</button>
                            </div>
                          </div>
                        ))}
                        {hasMorePending && <button onClick={() => setShowAllApprovals(true)} className="w-full py-2.5 text-xs font-semibold text-accent hover:bg-accent-soft transition-colors border-t border-gray-100">Show all {filteredPending.length} pending</button>}
                        {showAllApprovals && filteredPending.length > APPROVALS_CAP && <button onClick={() => setShowAllApprovals(false)} className="w-full py-2.5 text-xs font-semibold text-gray-400 hover:bg-gray-50 transition-colors border-t border-gray-100">Show less</button>}
                      </>
                    )}
                  </div>
                </section>
              )}
            </div>

            {/* ── Right rail ── */}
            <div className="space-y-6">
              {/* Upcoming schedule */}
              <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
                  <h3 className="font-display font-bold text-ink text-sm flex items-center gap-2"><Calendar size={15} className="text-accent" /> Upcoming Schedule</h3>
                </div>
                {upcoming.length === 0 ? (
                  <div className="py-8 px-5 text-center text-sm text-gray-400">No upcoming sessions scheduled.</div>
                ) : (
                  <div className="divide-y divide-gray-100">
                    {upcoming.slice(0, 3).map(s => {
                      const spotsOpen = (parseInt(s.evaluators_required) || 0) - (parseInt(s.signups) || 0);
                      const understaff = (parseInt(s.evaluators_required) || 0) > 0 && spotsOpen > 0;
                      return (
                        <div key={s.id} className="px-5 py-3">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-sm font-semibold text-ink truncate">{s.category_name}</span>
                            <span className="text-xs text-gray-400 font-mono whitespace-nowrap">S{s.session_number}{s.group_number ? `·G${s.group_number}` : ""}</span>
                          </div>
                          {(() => {
                            // A goalie-only slot (goalie evaluators, no player evaluators) is a Goalie Skills session,
                            // regardless of the skater session type that shares the session number.
                            const goalieOnly = (parseInt(s.goalie_evaluators_required) || 0) > 0 && (parseInt(s.evaluators_required) || 0) === 0;
                            const label = goalieOnly ? "Goalie Skills" : ({ testing: "Testing", scrimmage: "Scrimmage", skills: "Skills", goalie_skills: "Goalie Skills" }[s.session_type] || (s.session_type ? s.session_type.replace(/_/g, " ") : null));
                            return label ? (
                              <div className="mt-1">
                                <span className="inline-block text-[11px] font-semibold uppercase tracking-wide text-accent bg-accent-soft rounded px-1.5 py-0.5">{label}</span>
                              </div>
                            ) : null;
                          })()}
                          <div className="flex items-center gap-2 mt-1 text-xs text-gray-500 flex-wrap">
                            <span className="flex items-center gap-1"><Calendar size={11} />{fmtDate(s.scheduled_date)}</span>
                            {s.start_time && <span className="flex items-center gap-1"><Clock size={11} />{fmtTime(s.start_time)}</span>}
                            {s.location && <span className="flex items-center gap-1 truncate"><MapPin size={11} />{s.location}</span>}
                          </div>
                          {!serviceProvider && understaff && <div className="mt-1.5 inline-flex items-center gap-1 text-[11px] font-semibold text-amber-600"><AlertTriangle size={11} /> Needs {spotsOpen} evaluator{spotsOpen === 1 ? "" : "s"}</div>}
                        </div>
                      );
                    })}
                    {upcomingTotal > 3 && (
                      <div className="px-5 py-2.5 bg-gray-50 text-center text-xs font-medium text-gray-500">
                        +{upcomingTotal - 3} more upcoming session{upcomingTotal - 3 === 1 ? "" : "s"}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Needs attention */}
              <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                <div className="px-5 py-4 border-b border-gray-100">
                  <h3 className="font-display font-bold text-ink text-sm flex items-center gap-2"><AlertTriangle size={15} className="text-accent" /> Needs Attention</h3>
                </div>
                {attention.length === 0 ? (
                  <div className="py-8 px-5 text-center text-sm text-gray-400">All clear — nothing needs attention.</div>
                ) : (
                  <div className="divide-y divide-gray-100">
                    {attention.map((a, i) => {
                      const Icon = a.icon;
                      const tone = a.tone === "emerald" ? { box: "bg-emerald-50", icon: "text-emerald-600" } : { box: "bg-amber-50", icon: "text-amber-600" };
                      const inner = (
                        <>
                          <span className={`w-7 h-7 rounded-lg ${tone.box} flex items-center justify-center flex-shrink-0`}><Icon size={14} className={tone.icon} /></span>
                          <span className="flex-1 text-sm text-gray-700">{a.text}</span>
                          <ChevronRight size={15} className="text-gray-300" />
                        </>
                      );
                      const cls = "w-full flex items-center gap-3 px-5 py-3 text-left hover:bg-gray-50 transition-colors";
                      return a.href
                        ? <a key={i} href={a.href} className={cls}>{inner}</a>
                        : <button key={i} onClick={() => jumpTo(a.anchor)} className={cls}>{inner}</button>;
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
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

      {goalieEvalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-start justify-center z-50 p-4 overflow-y-auto" onClick={(e) => e.target === e.currentTarget && setGoalieEvalOpen(false)}>
          <div className="w-full max-w-2xl mt-10 mb-10">
            <div className="bg-white rounded-t-2xl flex items-center justify-between px-5 py-3 border-b border-gray-100">
              <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">Settings</h2>
              <button onClick={() => setGoalieEvalOpen(false)} className="p-1 text-gray-400 hover:text-gray-600"><X size={18} /></button>
            </div>
            <div className="bg-white rounded-b-2xl shadow-xl overflow-hidden">
              <GoalieEvalCard orgId={orgId} />
            </div>
          </div>
        </div>
      )}

      {showInvite && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={(e) => e.target === e.currentTarget && setShowInvite(false)}>
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-bold text-gray-900">Invite Association Admin</h2>
              <button onClick={() => setShowInvite(false)} className="p-1 text-gray-400 hover:text-gray-600"><X size={18} /></button>
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
                          <button onClick={() => navigator.clipboard.writeText(inviteResult.inviteUrl)} className="px-2 py-1.5 bg-gray-200 rounded text-xs hover:bg-gray-300">Copy</button>
                        </div>
                      </div>
                    )}
                    <button onClick={() => { setShowInvite(false); setInviteResult(null); setInviteEmail(""); setInviteName(""); }} className="mt-4 px-5 py-2 bg-accent text-white rounded-lg text-sm font-medium hover:opacity-90">Done</button>
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
                  <input type="text" value={inviteName} onChange={e => setInviteName(e.target.value)} className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-accent" placeholder="Their full name" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Email <span className="text-red-400">*</span></label>
                  <input type="email" value={inviteEmail} onChange={e => setInviteEmail(e.target.value)} required className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-accent" placeholder="admin@association.com" />
                </div>
                <div className="flex gap-3 pt-1">
                  <button type="button" onClick={() => setShowInvite(false)} className="flex-1 px-4 py-2.5 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 text-sm font-medium">Cancel</button>
                  <button type="submit" disabled={inviteLoading} className="flex-1 px-4 py-2.5 bg-accent text-white rounded-lg hover:opacity-90 text-sm font-medium disabled:opacity-50">{inviteLoading ? "Sending..." : "Send Invite"}</button>
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
      <Suspense fallback={<div className="min-h-screen bg-gray-50 flex items-center justify-center" data-theme="premium"><div className="animate-spin rounded-full h-10 w-10 border-b-2 border-accent" /></div>}>
        <Dashboard />
      </Suspense>
    </QueryClientProvider>
  );
}
