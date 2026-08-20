"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Star, Building2, Users, LogOut, Plus, Link2, X, ArrowRight, Clock, MapPin, CalendarDays, UserCheck, Copy, Check } from "lucide-react";
import { useTheme } from "@/lib/useTheme";
import ThemeToggle from "@/components/ThemeToggle";
import InstallAppButton from "@/components/InstallAppButton";
import NotificationBell from "@/components/NotificationBell";
import ScheduleBoard from "@/components/ScheduleBoard";

// The Goalie Service Provider's own dashboard — its own home, separate from the
// (skater) Service Provider dashboard. It manages its own association connections
// and views goalie rankings. Goalie data lives entirely here, never on the skater
// SP dashboard or the association's player dashboard.
function Inner() {
  const params = useSearchParams();
  const org = params.get("org");
  const [theme, toggleTheme] = useTheme();
  const [tab, setTab] = useState(params.get("tab") || "overview");

  const withOrg = useCallback((path) => (org ? `${path}${path.includes("?") ? "&" : "?"}org=${org}` : path), [org]);

  const [overview, setOverview] = useState(null);
  const [managed, setManaged] = useState(null);
  const loadOverview = useCallback(() => {
    fetch(withOrg("/api/goalie-provider/overview")).then(r => r.json()).then(setOverview).catch(() => setOverview({ error: "Failed to load" }));
  }, [withOrg]);
  const loadManaged = useCallback(() => {
    fetch(withOrg("/api/goalie-provider/associations")).then(r => r.json()).then(d => setManaged(d.associations || [])).catch(() => setManaged([]));
  }, [withOrg]);
  useEffect(() => { loadOverview(); loadManaged(); }, [loadOverview, loadManaged]);

  const spName = overview?.sp?.name || "Goalie Service Provider";
  const totalAssoc = overview?.total_associations ?? 0;
  const totalGoalies = overview?.total_goalies ?? 0;
  const associations = overview?.associations || [];

  return (
    <div className="min-h-screen bg-gray-50" data-theme={theme}>
      <div className="bg-white border-b border-gray-200 shadow-sm">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-2 flex justify-end items-center gap-3">
          <ThemeToggle theme={theme} onToggle={toggleTheme} />
          <InstallAppButton />
          <NotificationBell />
          <button onClick={async () => { await fetch("/api/auth/logout", { method: "POST" }); window.location.href = "/account/signin"; }}
            className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 py-1">
            <LogOut size={14} /> Sign out
          </button>
        </div>
        <div className="max-w-5xl mx-auto px-4 sm:px-6 pt-1 pb-4">
          <div className="font-display text-xs font-bold tracking-[0.2em] uppercase text-accent mb-2">Goalie Service Provider</div>
          <div className="flex items-end gap-3 flex-wrap">
            <h1 className="font-display font-black tracking-tight text-ink text-4xl sm:text-5xl leading-none flex items-center gap-3">
              <Star size={30} className="text-accent" /> {spName}
            </h1>
          </div>
          <div className="flex items-center gap-2 mt-3 text-sm text-gray-500 font-medium">
            <span><b className="text-ink">{totalAssoc}</b> association{totalAssoc !== 1 ? "s" : ""}</span>
            <span className="text-gray-300">·</span>
            <span><b className="text-ink">{totalGoalies}</b> goalie{totalGoalies !== 1 ? "s" : ""}</span>
          </div>
          <div className="flex gap-1 mt-4 overflow-x-auto">
            {[{ id: "overview", label: "Overview" }, { id: "categories", label: "Categories" }, { id: "schedule", label: "Schedule" }, { id: "evaluators", label: "Evaluators" }, { id: "associations", label: "Associations" }].map(t => (
              <button key={t.id} onClick={() => setTab(t.id)}
                className={`px-4 py-3 text-sm font-medium border-b-2 whitespace-nowrap transition-colors ${tab === t.id ? "border-accent text-accent" : "border-transparent text-gray-500 hover:text-gray-700"}`}>
                {t.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
        {overview?.error ? (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-700">{overview.error}</div>
        ) : tab === "overview" ? (
          <OverviewTab associations={associations} withOrg={withOrg} onGoAssociations={() => setTab("associations")} />
        ) : tab === "categories" ? (
          <CategoriesTab managed={managed} withOrg={withOrg} orgParam={org} onGoAssociations={() => setTab("associations")} />
        ) : tab === "schedule" ? (
          <ScheduleTab withOrg={withOrg} />
        ) : tab === "evaluators" ? (
          <EvaluatorsTab withOrg={withOrg} spId={overview?.sp?.id} />
        ) : (
          <AssociationsTab managed={managed} onChanged={() => { loadManaged(); loadOverview(); }} withOrg={withOrg} />
        )}
      </div>
    </div>
  );
}

function OverviewTab({ associations, withOrg, onGoAssociations }) {
  if (associations.length === 0) {
    return (
      <div className="bg-white border border-dashed border-gray-200 rounded-2xl py-16 text-center">
        <Building2 size={40} className="mx-auto text-gray-200 mb-3" />
        <h3 className="font-semibold text-gray-600">No associations connected yet</h3>
        <p className="text-sm text-gray-400 mt-1 mb-4">Connect to an association by its code to start evaluating their goalies.</p>
        <button onClick={onGoAssociations} className="inline-flex items-center gap-1.5 px-5 py-2.5 bg-accent text-white rounded-lg text-sm font-semibold hover:opacity-90">
          <Plus size={15} /> Connect an association
        </button>
      </div>
    );
  }
  return (
    <div className="space-y-4">
      {associations.map(a => (
        <div key={a.id} className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-2">
            <Building2 size={16} className="text-accent" />
            <h3 className="font-semibold text-ink">{a.name}</h3>
          </div>
          {a.categories.length === 0 ? (
            <div className="px-5 py-6 text-sm text-gray-400">No categories yet.</div>
          ) : (
            <div className="divide-y divide-gray-50">
              {a.categories.map(c => (
                <a key={c.id} href={withOrg(`/goalie-provider/rankings?org=${a.id}`)}
                  className="flex items-center justify-between px-5 py-3 hover:bg-gray-50 transition-colors group">
                  <span className="text-sm font-medium text-gray-700">{c.name}</span>
                  <span className="inline-flex items-center gap-3 text-xs text-gray-500">
                    <span className="inline-flex items-center gap-1"><Users size={12} /> {c.goalie_count} goalie{c.goalie_count !== 1 ? "s" : ""}</span>
                    <span className="inline-flex items-center gap-1 text-accent font-semibold group-hover:gap-2 transition-all">Rankings <ArrowRight size={13} /></span>
                  </span>
                </a>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function ScheduleTab({ withOrg }) {
  const [sessions, setSessions] = useState(null);
  useEffect(() => {
    // The shared SP schedule API is goalie-scoped by resolveSpContext, so it
    // already returns only goalie-relevant slots (goalie skills + scrimmages) with
    // is_goalie_sp + goalie-evaluator staffing counts.
    fetch(withOrg("/api/service-provider/schedule")).then(r => r.json()).then(d => setSessions(d.schedule || [])).catch(() => setSessions([]));
  }, [withOrg]);

  if (sessions === null) return <div className="py-12 text-center text-gray-400 text-sm">Loading schedule…</div>;

  const fmt = (t) => { if (!t) return ""; const [h, m] = t.toString().split(":").map(Number); const ap = h >= 12 ? "PM" : "AM"; const h12 = h % 12 === 0 ? 12 : h % 12; return `${h12}:${String(m || 0).padStart(2, "0")} ${ap}`; };

  return (
    <ScheduleBoard
      sessions={sessions}
      storageKey="goalie-sp-schedule-view"
      emptyText="No goalie sessions yet. Connect an association and they'll appear here once its schedule is set."
      renderRow={(s) => {
        const need = parseInt(s.goalie_evaluators_required || 0);
        const open = parseInt(s.spots_open || 0);
        return (
          <div className="bg-white border border-gray-200 rounded-xl p-4 flex items-center gap-4 flex-wrap">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap mb-1">
                <span className="text-sm font-semibold text-ink truncate">{s.org_name}</span>
                {s.category_name && <span className="text-xs text-gray-500">· {s.category_name}</span>}
                <span className="text-[11px] px-2 py-0.5 rounded-full font-medium bg-accent-soft text-accent">goalie</span>
              </div>
              <div className="flex items-center gap-3 text-xs text-gray-500 flex-wrap">
                {s.start_time && <span className="flex items-center gap-1"><Clock size={11} />{fmt(s.start_time)}{s.end_time ? ` – ${fmt(s.end_time)}` : ""}</span>}
                {s.location && <span className="flex items-center gap-1"><MapPin size={11} />{s.location}</span>}
                {need > 0 && <span className="flex items-center gap-1"><Users size={11} />{need - open}/{need} goalie evaluators</span>}
              </div>
            </div>
            {open > 0 && need > 0 && (
              <span className="text-xs px-3 py-1.5 bg-amber-50 text-amber-700 border border-amber-200 rounded-lg font-semibold whitespace-nowrap">{open} spot{open !== 1 ? "s" : ""} open</span>
            )}
          </div>
        );
      }}
    />
  );
}

function EvaluatorsTab({ withOrg, spId }) {
  const [data, setData] = useState(null);
  const [codes, setCodes] = useState(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  const load = useCallback(() => {
    fetch(withOrg("/api/service-provider/evaluators")).then(r => r.json()).then(setData).catch(() => setData({ evaluators: [] }));
    if (spId) fetch(`/api/organizations/${spId}/join-codes`).then(r => r.json()).then(setCodes).catch(() => setCodes({ codes: [] }));
  }, [withOrg, spId]);
  useEffect(() => { load(); }, [load]);

  const act = async (action, evaluator_id) => {
    setBusy(true);
    try { await fetch(withOrg("/api/service-provider/evaluators"), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, evaluator_id }) }); } catch {}
    setBusy(false); load();
  };
  const genCode = async () => {
    if (!spId) return;
    setBusy(true);
    try { await fetch(`/api/organizations/${spId}/join-codes`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "generate", max_uses: 100 }) }); } catch {}
    setBusy(false); load();
  };

  const evaluators = data?.evaluators || [];
  const activeCode = (codes?.codes || []).find(c => c.uses < c.max_uses);
  const signupUrl = activeCode ? `${typeof window !== "undefined" ? window.location.origin : ""}/evaluator/signup?code=${activeCode.code}` : "";

  return (
    <div className="space-y-6">
      <div className="bg-white border border-gray-200 rounded-2xl p-5">
        <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-1.5"><UserCheck size={15} className="text-accent" /> Invite goalie evaluators</h3>
        <p className="text-xs text-gray-400 mt-0.5 mb-3">Share a join code — evaluators sign up and appear below for approval.</p>
        {activeCode ? (
          <div className="flex items-center gap-2 flex-wrap">
            <code className="px-3 py-1.5 bg-gray-50 border border-gray-300 rounded-lg text-sm font-mono font-bold tracking-wide">{activeCode.code}</code>
            <button onClick={() => { navigator.clipboard?.writeText(signupUrl); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
              className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 border border-gray-300 text-gray-600 rounded-lg font-medium hover:bg-gray-50">{copied ? <><Check size={12} /> Copied link</> : <><Copy size={12} /> Copy signup link</>}</button>
            <span className="text-xs text-gray-400">{activeCode.uses}/{activeCode.max_uses} used</span>
          </div>
        ) : (
          <button onClick={genCode} disabled={busy} className="inline-flex items-center gap-1.5 px-4 py-2 bg-accent text-white rounded-lg text-sm font-semibold disabled:opacity-50 hover:opacity-90"><Plus size={14} /> Generate join code</button>
        )}
      </div>

      <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100"><h3 className="text-sm font-semibold text-gray-900">Your evaluator pool</h3></div>
        {data === null ? (
          <div className="px-5 py-10 text-center text-sm text-gray-400">Loading…</div>
        ) : evaluators.length === 0 ? (
          <div className="px-5 py-10 text-center text-sm text-gray-400">No evaluators yet — share your join code above.</div>
        ) : (
          <div className="divide-y divide-gray-50">
            {evaluators.map(ev => (
              <div key={ev.id} className="px-5 py-3 flex items-center justify-between gap-3 flex-wrap">
                <div className="min-w-0">
                  <div className="text-sm font-medium text-ink flex items-center gap-2">{ev.name || ev.email}
                    {ev.membership_status === "pending" && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 font-bold uppercase">Pending</span>}
                    {ev.membership_status === "suspended" && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-red-100 text-red-600 font-bold uppercase">Suspended</span>}
                  </div>
                  <div className="text-xs text-gray-400">{ev.email} · {ev.total_sessions || 0} sessions</div>
                </div>
                <div className="flex items-center gap-1.5">
                  {ev.membership_status === "pending" && <button onClick={() => act("approve", ev.id)} disabled={busy} className="text-xs px-3 py-1.5 bg-green-100 text-green-700 rounded-lg font-semibold hover:bg-green-200 disabled:opacity-50">Approve</button>}
                  {ev.membership_status === "suspended"
                    ? <button onClick={() => act("reinstate", ev.id)} disabled={busy} className="text-xs px-3 py-1.5 border border-green-200 text-green-600 rounded-lg font-medium hover:bg-green-50 disabled:opacity-50">Reinstate</button>
                    : <button onClick={() => act("suspend", ev.id)} disabled={busy} className="text-xs px-3 py-1.5 border border-amber-200 text-amber-600 rounded-lg font-medium hover:bg-amber-50 disabled:opacity-50">Suspend</button>}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// Per-association goalie categories: list + create. Categories created here are
// goalie-only (age_categories.goalie_only = true) and get the org's goalie
// template (sessions/scale/scoring) applied automatically on creation — see
// src/app/api/organizations/[orgId]/goalie-categories/route.js. Nothing here
// ever touches a skater category or a skater-facing page.
function AssociationCategories({ assoc, withOrg, orgParam }) {
  const [data, setData] = useState(null);
  const [showNew, setShowNew] = useState(false);
  const [form, setForm] = useState({ name: "", min_age: "", max_age: "" });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);

  const load = useCallback(() => {
    fetch(`/api/organizations/${assoc.id}/goalie-categories`).then(r => r.json()).then(setData).catch(() => setData({ categories: [] }));
  }, [assoc.id]);
  useEffect(() => { load(); }, [load]);

  const create = async () => {
    if (!form.name.trim()) return;
    setBusy(true); setErr(null);
    try {
      const res = await fetch(`/api/organizations/${assoc.id}/goalie-categories`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: form.name.trim(), min_age: form.min_age || null, max_age: form.max_age || null }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok || d.error) { setErr(d.error || "Couldn't create category."); }
      else { setForm({ name: "", min_age: "", max_age: "" }); setShowNew(false); load(); }
    } catch { setErr("Network error — please try again."); }
    setBusy(false);
  };

  const categories = data?.categories || [];
  return (
    <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
      <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
        <h3 className="font-semibold text-ink flex items-center gap-2"><Building2 size={16} className="text-accent" /> {assoc.name}</h3>
        <button onClick={() => setShowNew(s => !s)} className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 bg-accent text-white rounded-lg font-semibold hover:opacity-90">
          <Plus size={13} /> New category
        </button>
      </div>
      {showNew && (
        <div className="px-5 py-4 border-b border-gray-100 bg-gray-50 flex items-end gap-2 flex-wrap">
          <div>
            <label className="block text-[11px] font-semibold text-gray-500 mb-1">Name</label>
            <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. U13 Goalies"
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-48 focus:outline-none focus:ring-2 focus:ring-accent/40" />
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-gray-500 mb-1">Min age</label>
            <input value={form.min_age} onChange={e => setForm(f => ({ ...f, min_age: e.target.value }))} type="number" placeholder="9"
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-20 focus:outline-none focus:ring-2 focus:ring-accent/40" />
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-gray-500 mb-1">Max age</label>
            <input value={form.max_age} onChange={e => setForm(f => ({ ...f, max_age: e.target.value }))} type="number" placeholder="13"
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-20 focus:outline-none focus:ring-2 focus:ring-accent/40" />
          </div>
          <button onClick={create} disabled={busy || !form.name.trim()} className="inline-flex items-center gap-1.5 px-4 py-2 bg-accent text-white rounded-lg text-sm font-semibold disabled:opacity-40 hover:opacity-90">
            <Plus size={14} /> Create
          </button>
          <button onClick={() => setShowNew(false)} className="text-xs px-3 py-2 text-gray-500 hover:text-gray-700">Cancel</button>
          {err && <p className="text-xs font-medium text-red-500 basis-full">{err}</p>}
        </div>
      )}
      {data === null ? (
        <div className="px-5 py-8 text-center text-sm text-gray-400">Loading…</div>
      ) : categories.length === 0 ? (
        <div className="px-5 py-8 text-center text-sm text-gray-400">No goalie categories yet — create one above.</div>
      ) : (
        <div className="divide-y divide-gray-50">
          {categories.map(c => (
            <a key={c.id} href={withOrg(`/goalie-provider/dashboard/category/${c.id}`)} className="flex items-center justify-between px-5 py-3 hover:bg-gray-50 transition-colors group">
              <span className="text-sm font-medium text-gray-700">{c.name}</span>
              <span className="inline-flex items-center gap-3 text-xs text-gray-500">
                <span className="inline-flex items-center gap-1"><Users size={12} /> {c.goalie_count} goalie{c.goalie_count !== 1 ? "s" : ""}</span>
                <span className="inline-flex items-center gap-1 text-accent font-semibold group-hover:gap-2 transition-all">Manage <ArrowRight size={13} /></span>
              </span>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}

function CategoriesTab({ managed, withOrg, orgParam, onGoAssociations }) {
  const list = managed || [];
  if (list.length === 0) {
    return (
      <div className="bg-white border border-dashed border-gray-200 rounded-2xl py-16 text-center">
        <Building2 size={40} className="mx-auto text-gray-200 mb-3" />
        <h3 className="font-semibold text-gray-600">No associations connected yet</h3>
        <p className="text-sm text-gray-400 mt-1 mb-4">Connect to an association first, then create goalie categories for them here.</p>
        <button onClick={onGoAssociations} className="inline-flex items-center gap-1.5 px-5 py-2.5 bg-accent text-white rounded-lg text-sm font-semibold hover:opacity-90">
          <Plus size={15} /> Connect an association
        </button>
      </div>
    );
  }
  return (
    <div className="space-y-4">
      {list.map(a => <AssociationCategories key={a.id} assoc={a} withOrg={withOrg} orgParam={orgParam} />)}
    </div>
  );
}

// Proactively reach out to an association by email instead of waiting for them
// to share a code. Handles both cases (existing account -> pending approval
// request; no account yet -> new client + invite) via one endpoint; see
// src/app/api/goalie-provider/invite-association/route.js.
function InviteAssociationBox({ withOrg, onChanged }) {
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [orgName, setOrgName] = useState("");
  const [needsOrgName, setNeedsOrgName] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);

  const submit = async () => {
    if (!email.trim()) return;
    setBusy(true); setMsg(null);
    try {
      const res = await fetch(withOrg("/api/goalie-provider/invite-association"), {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), name: name.trim() || null, org_name: orgName.trim() || null }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok || d.error) { setMsg({ type: "error", text: d.error || "Couldn't send invite." }); setNeedsOrgName(false); }
      else if (d.outcome === "needs_org_name") { setNeedsOrgName(true); setMsg({ type: "info", text: "No existing account found for that email — this will create a new association. What's their name?" }); }
      else if (d.outcome === "already_linked") { setMsg({ type: "success", text: `Already connected to ${d.association?.name}.` }); onChanged(); }
      else if (d.outcome === "request_sent") { setMsg({ type: "success", text: d.message || `Connection request sent to ${email}.` }); setEmail(""); setName(""); setOrgName(""); setNeedsOrgName(false); }
      else if (d.outcome === "created") { setMsg({ type: "success", text: d.message || `${d.association?.name} created and invited.` }); setEmail(""); setName(""); setOrgName(""); setNeedsOrgName(false); onChanged(); }
    } catch { setMsg({ type: "error", text: "Network error — please try again." }); }
    setBusy(false);
  };

  return (
    <div className="bg-white border border-gray-200 rounded-2xl p-5">
      <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-1.5"><Plus size={15} className="text-accent" /> Invite an association</h3>
      <p className="text-xs text-gray-400 mt-0.5 mb-3">Enter their contact email — if they already have an account, they'll get a request to approve. If not, a new association is created and they're invited to set it up.</p>
      <div className="flex items-center gap-2 flex-wrap">
        <input value={email} onChange={e => setEmail(e.target.value)} type="email" placeholder="contact@association.org"
          className="flex-1 min-w-[14rem] border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent/40" />
        <input value={name} onChange={e => setName(e.target.value)} placeholder="Contact name (optional)"
          className="flex-1 min-w-[10rem] border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent/40" />
        {needsOrgName && (
          <input value={orgName} onChange={e => setOrgName(e.target.value)} placeholder="Association name" autoFocus
            className="flex-1 min-w-[10rem] border border-amber-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent/40" />
        )}
        <button onClick={submit} disabled={busy || !email.trim() || (needsOrgName && !orgName.trim())} className="inline-flex items-center gap-1.5 px-5 py-2 bg-accent text-white rounded-lg text-sm font-semibold disabled:opacity-40 hover:opacity-90">
          <Plus size={15} /> {needsOrgName ? "Create & invite" : "Invite"}
        </button>
      </div>
      {msg && <p className={`text-xs font-medium mt-2 ${msg.type === "success" ? "text-green-600" : msg.type === "info" ? "text-amber-600" : "text-red-500"}`}>{msg.text}</p>}
    </div>
  );
}

function AssociationsTab({ managed, onChanged, withOrg }) {
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);

  const connect = async () => {
    if (!code.trim()) return;
    setBusy(true); setMsg(null);
    try {
      const res = await fetch(withOrg("/api/goalie-provider/associations"), {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "connect", org_code: code.trim() }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok || d.error) { setMsg({ type: "error", text: d.error || "Couldn't connect." }); }
      else { setMsg({ type: "success", text: d.alreadyLinked ? `Already connected to ${d.association?.name}.` : `Connected to ${d.association?.name}.` }); setCode(""); onChanged(); }
    } catch { setMsg({ type: "error", text: "Network error — please try again." }); }
    setBusy(false);
  };
  const disconnect = async (association_id, name) => {
    setBusy(true); setMsg(null);
    try {
      await fetch(withOrg("/api/goalie-provider/associations"), {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "disconnect", association_id }),
      });
      setMsg({ type: "success", text: `Disconnected from ${name}.` });
      onChanged();
    } catch { setMsg({ type: "error", text: "Couldn't disconnect." }); }
    setBusy(false);
  };

  const list = managed || [];
  return (
    <div className="space-y-6">
      <InviteAssociationBox withOrg={withOrg} onChanged={onChanged} />

      <div className="bg-white border border-gray-200 rounded-2xl p-5">
        <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-1.5"><Link2 size={15} className="text-accent" /> Connect to an association</h3>
        <p className="text-xs text-gray-400 mt-0.5 mb-3">Ask the association for their association code, then enter it here. This connects you to their existing association — no new setup on their end. They&apos;ll see goalie results in their <b>Manage Goalies</b> view.</p>
        <div className="flex items-center gap-2 flex-wrap">
          <input value={code} onChange={e => setCode(e.target.value.toUpperCase())} onKeyDown={e => { if (e.key === "Enter") connect(); }}
            placeholder="ASSOCIATION CODE" autoComplete="off"
            className="flex-1 min-w-[12rem] border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono tracking-wide uppercase focus:outline-none focus:ring-2 focus:ring-accent/40" />
          <button onClick={connect} disabled={busy || !code.trim()} className="inline-flex items-center gap-1.5 px-5 py-2 bg-accent text-white rounded-lg text-sm font-semibold disabled:opacity-40 hover:opacity-90">
            <Plus size={15} /> Connect
          </button>
        </div>
        {msg && <p className={`text-xs font-medium mt-2 ${msg.type === "success" ? "text-green-600" : "text-red-500"}`}>{msg.text}</p>}
      </div>

      <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100">
          <h3 className="text-sm font-semibold text-gray-900">Connected associations</h3>
        </div>
        {list.length === 0 ? (
          <div className="px-5 py-10 text-center text-sm text-gray-400">No associations connected yet. Enter a code above to connect.</div>
        ) : (
          <div className="divide-y divide-gray-50">
            {list.map(a => (
              <div key={a.id} className="px-5 py-4 flex items-center justify-between gap-4 flex-wrap">
                <div>
                  <div className="font-medium text-ink">{a.name}</div>
                  <div className="text-xs text-gray-400 mt-0.5 flex items-center gap-2">
                    <span className="font-mono">{a.org_code}</span>
                    <span className="text-gray-300">·</span>
                    <span className="inline-flex items-center gap-1"><Users size={11} /> {a.goalie_count} goalie{a.goalie_count !== 1 ? "s" : ""}</span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <a href={withOrg(`/goalie-provider/rankings?org=${a.id}`)} className="text-xs px-3 py-1.5 border border-accent/30 text-accent rounded-lg font-semibold hover:bg-accent-soft">Rankings</a>
                  <button onClick={() => disconnect(a.id, a.name)} disabled={busy} className="text-xs px-3 py-1.5 border border-red-200 text-red-500 rounded-lg font-medium hover:bg-red-50 disabled:opacity-50 inline-flex items-center gap-1"><X size={12} /> Disconnect</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default function GoalieProviderDashboardPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-gray-50" data-theme="premium" />}>
      <Inner />
    </Suspense>
  );
}
