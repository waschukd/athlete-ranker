"use client";

import { useState, useMemo, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { useQuery, useQueryClient, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Building2, Calendar, LogOut, Clock, MapPin, CheckCircle, ExternalLink, X, Plus, CalendarDays, List, MessageSquare, AlertTriangle, Star, ArrowRight, Upload, BookOpen } from "lucide-react";
import SessionRosterModal from "@/components/SessionRosterModal";
import { colorForOrg, buildOrgColorMap, paletteFromHex, OrgChip, OrgAvatar } from "@/lib/orgVisuals";
import { DateStripBar, MonthCalendar, WeekGrid } from "@/components/SessionDateNav";
import { useTrackPageView } from "@/lib/useAnalytics";
import ConfirmDialog from "@/components/ConfirmDialog";
import NotificationBell from "@/components/NotificationBell";
import InstallAppButton from "@/components/InstallAppButton";
import { useTheme } from "@/lib/useTheme";
import ThemeToggle from "@/components/ThemeToggle";
import { downloadContactsCsv, formatTime, localToday, formatDate, sessionStaffing } from "@/lib/spDashboardUtils";
import { SessionRow, OpenSpotsTracker } from "@/components/service-provider/OverviewWidgets";
import { AssocColorPicker, JoinCodesPanel } from "@/components/service-provider/AssociationWidgets";
import { ScheduleFormModal, ScheduleRowControls, AddSessionButton } from "@/components/service-provider/ScheduleControls";
import BatchScheduleImport from "@/components/service-provider/BatchScheduleImport";
import TestingSessionsControls from "@/components/service-provider/TestingSessionsControls";
import { EvaluatorEfficiencyReport, StaffingReports } from "@/components/service-provider/Reports";
import LeadsSection from "@/components/service-provider/LeadsSection";
import SetRatesModal from "@/components/service-provider/SetRatesModal";
import { ComposeMessageModal, MessagesSection } from "@/components/service-provider/Messaging";
import PayrollTab from "@/components/service-provider/PayrollTab";
import BlastButton from "@/components/service-provider/BlastButton";
import SpLogoControl from "@/components/service-provider/SpLogoControl";
import TestersTab, { TesterStaffingControl } from "@/components/service-provider/TestersTab";


const qc = new QueryClient();

const SESSION_TYPE_COLORS = {
  testing: "bg-blue-100 text-blue-700",
  skills: "bg-purple-100 text-purple-700",
  scrimmage: "bg-green-100 text-green-700",
};

function SPDashboard() {
  useTrackPageView("dashboard.service-provider.viewed");
  const searchParams = useSearchParams();
  const orgParam = searchParams.get("org");
  const spUrl = (path) => {
    if (!orgParam) return path;
    const sep = path.includes("?") ? "&" : "?";
    return `${path}${sep}org=${orgParam}`;
  };

  const [activeTab, setActiveTab] = useState("overview");
  const [theme, toggleTheme] = useTheme();
  const queryClient = useQueryClient();
  const [showPastSessions, setShowPastSessions] = useState(false);
  const [scheduleTypeFilter, setScheduleTypeFilter] = useState("all"); // "all" | "testing" | "eval"
  const [scheduleAssocFilter, setScheduleAssocFilter] = useState("all"); // "all" | <org_id>
  const [rosterScheduleId, setRosterScheduleId] = useState(null); // open the per-session roster modal
  const [scheduleView, setScheduleViewRaw] = useState("week"); // "week" | "month" | "list"
  useEffect(() => {
    const saved = typeof window !== "undefined" && window.localStorage.getItem("sp-schedule-view");
    if (saved === "week" || saved === "month" || saved === "list") setScheduleViewRaw(saved);
  }, []);
  const setScheduleView = (v) => { setScheduleViewRaw(v); try { window.localStorage.setItem("sp-schedule-view", v); } catch {} };
  const [showSubscribe, setShowSubscribe] = useState(false);
  const [calLinks, setCalLinks] = useState(null);
  // Persisted so the date selection is retained across tab navigation (and reloads).
  const [scheduleSelectedDate, setScheduleSelectedDateState] = useState(() => {
    if (typeof window === "undefined") return null;
    return window.localStorage.getItem("sp-schedule-selected-date") || null;
  }); // YYYY-MM-DD or null
  const setScheduleSelectedDate = (val) => {
    setScheduleSelectedDateState(val);
    if (typeof window !== "undefined") {
      if (val) window.localStorage.setItem("sp-schedule-selected-date", val);
      else window.localStorage.removeItem("sp-schedule-selected-date");
    }
  };
  const [evalInviteEmail, setEvalInviteEmail] = useState("");
  const [evalInviteSending, setEvalInviteSending] = useState(false);
  const [evalInviteMsg, setEvalInviteMsg] = useState(null);
  const [adminInviteEmail, setAdminInviteEmail] = useState("");
  const [adminInviteName, setAdminInviteName] = useState("");
  const [adminInviteSending, setAdminInviteSending] = useState(false);
  const [adminInviteMsg, setAdminInviteMsg] = useState(null);
  const [showNewClient, setShowNewClient] = useState(false);
  const [newClient, setNewClient] = useState({ name: "", contact_name: "", contact_email: "", contact_phone: "", address: "" });
  const [newClientSaving, setNewClientSaving] = useState(false);
  const [newClientMsg, setNewClientMsg] = useState(null);
  const [selHours, setSelHours] = useState([]);
  const [selFlags, setSelFlags] = useState([]);
  const [selEvals, setSelEvals] = useState([]);
  const [showBulkDelete, setShowBulkDelete] = useState(false);
  const [evalSearch, setEvalSearch] = useState("");
  const [evalStatusFilter, setEvalStatusFilter] = useState("all");
  const [evalPage, setEvalPage] = useState(1);
  const EVAL_PAGE_SIZE = 25;
  const [deleteConfirm, setDeleteConfirm] = useState("");
  const [bulkDeleteMsg, setBulkDeleteMsg] = useState(null);
  const [composeRecipient, setComposeRecipient] = useState(null); // { to_all_pool } | { to_user_ids, label }
  const [showSetRates, setShowSetRates] = useState(false);
  const [ratesSavedMsg, setRatesSavedMsg] = useState(false);

  const bulkAction = async (payload) => {
    const res = await fetch(spUrl("/api/service-provider/evaluators"), {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) { setBulkDeleteMsg(`⚠️ ${data.error || "Action failed"}`); return null; }
    return data;
  };

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

  const { data: schedData, isLoading: schedLoading, refetch: refetchSchedule } = useQuery({
    queryKey: ["sp-schedule", orgParam],
    queryFn: async () => {
      const res = await fetch(spUrl("/api/service-provider/schedule"));
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
  });

  // Master Schedule editing: brief confirmation line + add-session category context.
  const [scheduleSavedMsg, setScheduleSavedMsg] = useState(false);
  const [addSessionCatId, setAddSessionCatId] = useState("");
  const onScheduleSaved = () => {
    refetchSchedule();
    setScheduleSavedMsg(true);
    setTimeout(() => setScheduleSavedMsg(false), 4000);
  };

  const sp = assocData?.sp;
  const associations = assocData?.associations || [];
  const evaluatorStats = assocData?.evaluatorStats || {};
  const evaluators = evalData?.evaluators || [];
  const flags = evalData?.flags || [];
  const pendingHours = evalData?.pendingHours || [];

  const filteredEvaluators = useMemo(() => {
    const q = evalSearch.trim().toLowerCase();
    return evaluators.filter(ev => {
      if (q && !(ev.name?.toLowerCase().includes(q) || ev.email?.toLowerCase().includes(q))) return false;
      if (evalStatusFilter === "pending" && ev.membership_status !== "pending") return false;
      if (evalStatusFilter === "active" && (ev.membership_status === "pending" || ev.membership_status === "suspended")) return false;
      if (evalStatusFilter === "suspended" && ev.membership_status !== "suspended") return false;
      return true;
    });
  }, [evaluators, evalSearch, evalStatusFilter]);

  const evalTotalPages = Math.max(1, Math.ceil(filteredEvaluators.length / EVAL_PAGE_SIZE));
  const evalPageSafe = Math.min(evalPage, evalTotalPages);
  const pagedEvaluators = useMemo(() => {
    const start = (evalPageSafe - 1) * EVAL_PAGE_SIZE;
    return filteredEvaluators.slice(start, start + EVAL_PAGE_SIZE);
  }, [filteredEvaluators, evalPageSafe, EVAL_PAGE_SIZE]);
  const rawSchedule = schedData?.schedule || [];
  const isGoalieSp = sp?.type === "goalie_service_provider";
  const byDate = rawSchedule.reduce((acc, entry) => {
    const date = entry.scheduled_date?.toString().split("T")[0];
    if (!date) return acc;
    if (!acc[date]) acc[date] = [];
    // A goalie SP staffs GOALIE evaluators (its rows carry is_goalie_sp so the row
    // shows "Evaluate", not "Check-in"). Spots track the goalie count, not the
    // skater one (which defaults to 4 and made no sense here).
    const req = isGoalieSp ? parseInt(entry.goalie_evaluators_required || 0) : parseInt(entry.evaluators_required || 0);
    acc[date].push({ ...entry, is_goalie_sp: isGoalieSp, spots_open: Math.max(0, req - parseInt(entry.evaluators_signed_up || 0)) });
    return acc;
  }, {});
  const schedule = Object.values(byDate).flat();
  const today = localToday();
  const allDates = Object.keys(byDate).sort();
  const upcomingDates = showPastSessions ? allDates : allDates.filter(d => d >= today);
  const pastCount = allDates.filter(d => d < today).length;
  const needsEvaluators = schedule.filter(s => sessionStaffing(s).open > 0 && s.scheduled_date?.toString().split("T")[0] >= today).length;
  // Total OPEN SPOTS across upcoming sessions — remaining EVALUATOR slots on eval
  // sessions plus remaining TESTER slots on testing sessions (what "how many more
  // people do I need" really means).
  const openSpots = schedule
    .filter(s => s.scheduled_date?.toString().split("T")[0] >= today)
    .reduce((sum, s) => sum + sessionStaffing(s).open, 0);
  const totalUpcoming = schedule.filter(s => s.scheduled_date?.toString().split("T")[0] >= today).length;
  // Split by pool — what the Evaluator Pool / Tester Pool tabs each show up top.
  const upcomingSchedule = schedule.filter(s => s.scheduled_date?.toString().split("T")[0] >= today);
  const evaluatorOpenSpots = upcomingSchedule.filter(s => !sessionStaffing(s).isTesting).reduce((sum, s) => sum + sessionStaffing(s).open, 0);
  const evaluatorSessionsNeeding = upcomingSchedule.filter(s => !sessionStaffing(s).isTesting && sessionStaffing(s).open > 0).length;
  const testerOpenSpots = upcomingSchedule.filter(s => sessionStaffing(s).isTesting).reduce((sum, s) => sum + sessionStaffing(s).open, 0);
  const testerSessionsNeeding = upcomingSchedule.filter(s => sessionStaffing(s).isTesting && sessionStaffing(s).open > 0).length;

  // ── Overview (home) data ──
  const dateOf = (s) => s.scheduled_date?.toString().split("T")[0];
  const byDateTime = (a, b) => (dateOf(a) + (a.start_time || "")).localeCompare(dateOf(b) + (b.start_time || ""));
  const liveSessions = schedule.filter(s => s.status !== "cancelled");
  const todaySessions = liveSessions.filter(s => dateOf(s) === today).sort(byDateTime);
  const upcomingSessions = liveSessions.filter(s => dateOf(s) > today).sort(byDateTime).slice(0, 8);
  const needsAttention = liveSessions
    .filter(s => sessionStaffing(s).open > 0 && dateOf(s) >= today)
    .sort(byDateTime)
    .slice(0, 6);
  const topEvaluators = [...evaluators]
    .filter(ev => ev.membership_status !== "pending" && ev.membership_status !== "suspended")
    .map(ev => ({ ...ev, _sessions: parseInt(ev.total_sessions || 0) }))
    .filter(ev => ev._sessions > 0)
    .sort((a, b) => b._sessions - a._sessions || parseFloat(b.total_hours || 0) - parseFloat(a.total_hours || 0))
    .slice(0, 5);

  // Org -> palette map for the master schedule (deterministic, distinct).
  // Built from the orgs actually present in the current schedule view.
  const scheduleOrgColorMap = useMemo(() => {
    const orgs = Array.from(new Set(schedule.map(s => s.org_name).filter(Boolean)));
    return buildOrgColorMap(orgs);
  }, [schedule]);
  // SP-picked colours override the auto palette (fixes collisions).
  const customColorByName = useMemo(() => {
    const m = new Map();
    associations.forEach(a => { if (a.schedule_color) m.set(a.name, a.schedule_color); });
    return m;
  }, [associations]);
  const scheduleOrgPalette = (name) => {
    const custom = customColorByName.get(name);
    if (custom) { const p = paletteFromHex(custom); if (p) return p; }
    return scheduleOrgColorMap.get(name) || colorForOrg(name);
  };

  // Distinct association/category contexts present in the schedule — drives the
  // "Add session" picker (the POST endpoint is keyed by age_category_id).
  const scheduleCategories = useMemo(() => {
    const map = new Map();
    for (const s of schedule) {
      if (s.age_category_id && !map.has(s.age_category_id)) {
        map.set(s.age_category_id, { age_category_id: s.age_category_id, org_name: s.org_name, category_name: s.category_name });
      }
    }
    return Array.from(map.values()).sort((a, b) => (a.org_name + a.category_name).localeCompare(b.org_name + b.category_name));
  }, [schedule]);
  const addSessionCategory = scheduleCategories.find(c => String(c.age_category_id) === String(addSessionCatId));

  // Date filter: when a specific date is picked from strip / calendar, show
  // only that day's sessions in the list.
  const visibleDatesRaw = scheduleSelectedDate
    ? upcomingDates.filter(d => d === scheduleSelectedDate)
    : upcomingDates;
  // Session-type filter for the Master Schedule: all / testing only / evaluation
  // (anything scored — scrimmage, skills, goalie). Testing rows carry
  // session_type === "testing".
  const matchesType = (s) => scheduleTypeFilter === "all"
    ? true
    : scheduleTypeFilter === "testing"
      ? s.session_type === "testing"
      : s.session_type !== "testing";
  const matchesAssoc = (s) => scheduleAssocFilter === "all" || String(s.org_id) === String(scheduleAssocFilter);
  const matchesFilters = (s) => matchesType(s) && matchesAssoc(s);
  const visibleDates = visibleDatesRaw.filter(d => (byDate[d] || []).some(matchesFilters));

  return (
    <div className="min-h-screen bg-gray-50" data-theme={theme}>
      <div className="bg-white border-b border-gray-200 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-2 flex justify-end items-center gap-3">
          <InstallAppButton />
          <NotificationBell />
          <ThemeToggle theme={theme} onToggle={toggleTheme} />
          <button onClick={async () => { await fetch("/api/auth/logout", { method: "POST" }); window.location.href = "/account/signin"; }} className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 py-1">
            <LogOut size={14} /> Sign out
          </button>
        </div>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-8 pt-1">
          <div className="flex items-start justify-between flex-wrap gap-4">
            <div className="min-w-0">
              <div className="font-display text-xs font-bold tracking-[0.2em] uppercase text-accent mb-2">Service Provider</div>
              <div className="flex items-end gap-4 flex-wrap">
                <h1 className="font-display font-black tracking-tight text-ink text-4xl sm:text-5xl leading-none">{sp?.name || "Service Provider"}</h1>
                <img src="/mark-gold.svg" style={{width:"48px",height:"44px",objectFit:"contain"}} alt="Sideline Star" />
              </div>
              <div className="flex items-center gap-2 mt-3 flex-wrap text-sm text-gray-500 font-medium">
                <span><b className="text-ink">{associations.length}</b> client association{associations.length === 1 ? "" : "s"}</span>
                <span className="text-gray-300">·</span>
                <span><b className="text-ink">{totalUpcoming}</b> upcoming session{totalUpcoming === 1 ? "" : "s"}</span>
                <span className="text-gray-300">·</span>
                <span><b className="text-ink">{openSpots}</b> open spot{openSpots === 1 ? "" : "s"}</span>
                <span className="text-gray-300">·</span>
                <span><b className="text-ink">{evaluatorStats.total_evaluators || 0}</b> evaluators in pool</span>
              </div>
              <SpLogoControl sp={sp} onChange={() => queryClient.invalidateQueries({ queryKey: ["sp-associations"] })} />
            </div>
          </div>
        </div>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex gap-1 overflow-x-auto">
            {[{ id: "overview", label: "Overview" }, { id: "schedule", label: "Master Schedule" }, { id: "associations", label: "Associations" }, { id: "evaluators", label: "Evaluator Pool" }, { id: "testers", label: "Tester Pool" }, { id: "payroll", label: "Payroll" }, { id: "leads", label: "Leads" }, { id: "reports", label: "Reports" }].map(tab => (
              <button key={tab.id} onClick={() => setActiveTab(tab.id)} className={`px-4 py-3 text-sm font-medium border-b-2 whitespace-nowrap transition-colors ${activeTab === tab.id ? "border-[#0b5cd6] text-[#0b5cd6]" : "border-transparent text-gray-500 hover:text-gray-700"}`}>
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">

        {activeTab === "testers" && <TestersTab spUrl={spUrl} spName={sp?.name} openSpots={testerOpenSpots} sessionsNeeding={testerSessionsNeeding} />}
        {activeTab === "payroll" && <PayrollTab spUrl={spUrl} />}

        {activeTab === "overview" && (
          <div className="space-y-6">
            {/* Stat cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              {[
                { label: "Client Associations", value: associations.length, Icon: Building2 },
                { label: "Sessions Today", value: todaySessions.length, Icon: CalendarDays, gold: true },
                { label: "Upcoming Sessions", value: totalUpcoming, Icon: Calendar },
                { label: "Open Spots", value: openSpots, Icon: AlertTriangle, amber: openSpots > 0 },
              ].map((c, i) => (
                <div key={i} className="bg-white border border-gray-200 rounded-2xl p-5">
                  <div className="flex items-center justify-between">
                    <div className="text-xs font-semibold uppercase tracking-wide text-gray-400">{c.label}</div>
                    <c.Icon size={16} className={c.amber ? "text-amber-500" : "text-accent"} />
                  </div>
                  <div className={`mt-2 font-display font-black text-3xl ${c.gold ? "text-accent" : c.amber ? "text-amber-600" : "text-ink"}`}>{c.value}</div>
                </div>
              ))}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
              {/* LEFT: sessions */}
              <div className="lg:col-span-2 space-y-6">
                <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
                  <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between gap-3 flex-wrap">
                    <div>
                      <h3 className="font-display font-bold text-ink text-lg leading-tight flex items-center gap-2"><CalendarDays size={17} className="text-accent" /> Today's scheduled sessions</h3>
                      <p className="text-xs text-gray-400 mt-0.5">{formatDate(today)}</p>
                    </div>
                    <span className="text-sm text-gray-400">{todaySessions.length} session{todaySessions.length === 1 ? "" : "s"}</span>
                  </div>
                  {schedLoading ? (
                    <div className="py-10 text-center text-gray-400 text-sm">Loading…</div>
                  ) : todaySessions.length === 0 ? (
                    <div className="py-10 text-center text-gray-400 text-sm">Nothing on the ice today.</div>
                  ) : (
                    <div className="divide-y divide-gray-100">
                      {todaySessions.map(s => <SessionRow key={s.schedule_id} s={s} />)}
                    </div>
                  )}
                </div>

                <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
                  <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
                    <h3 className="font-display font-bold text-ink text-lg leading-tight flex items-center gap-2"><Calendar size={17} className="text-accent" /> Upcoming sessions</h3>
                    <button onClick={() => setActiveTab("schedule")} className="text-xs font-semibold text-accent hover:opacity-70 inline-flex items-center gap-1">View all <ArrowRight size={12} /></button>
                  </div>
                  {schedLoading ? (
                    <div className="py-10 text-center text-gray-400 text-sm">Loading…</div>
                  ) : upcomingSessions.length === 0 ? (
                    <div className="py-10 text-center text-gray-400 text-sm">No upcoming sessions scheduled.</div>
                  ) : (
                    <div className="divide-y divide-gray-100">
                      {upcomingSessions.map(s => <SessionRow key={s.schedule_id} s={s} showDate />)}
                    </div>
                  )}
                </div>
              </div>

              {/* RIGHT: attention + top evaluators */}
              <div className="space-y-6">
                <div className="bg-white border border-gray-200 rounded-2xl p-5">
                  <h3 className="font-display font-bold text-ink text-lg leading-tight flex items-center gap-2"><AlertTriangle size={16} className="text-amber-500" /> Needs attention</h3>
                  <p className="text-xs text-gray-400 mt-0.5 mb-3">{needsEvaluators} session{needsEvaluators === 1 ? "" : "s"} short on staff</p>
                  {needsAttention.length === 0 ? (
                    <p className="text-sm text-gray-400 py-3">All upcoming sessions are fully staffed.</p>
                  ) : (
                    <div>
                      {needsAttention.map(s => (
                        <div key={s.schedule_id} className="flex items-start gap-3 py-2.5 border-t border-gray-100 first:border-t-0">
                          <span className="mt-1.5 w-2 h-2 rounded-full bg-amber-500 flex-shrink-0" />
                          <div className="min-w-0 flex-1">
                            <div className="text-sm text-ink truncate">{s.org_name} · {s.category_name}</div>
                            <div className="text-xs text-gray-400">{formatDate(s.scheduled_date)} · needs {sessionStaffing(s).open} more {sessionStaffing(s).noun}{sessionStaffing(s).open === 1 ? "" : "s"}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="bg-white border border-gray-200 rounded-2xl p-5">
                  <h3 className="font-display font-bold text-ink text-lg leading-tight flex items-center gap-2"><Star size={16} className="text-accent" /> Top evaluators</h3>
                  <p className="text-xs text-gray-400 mt-0.5 mb-3">By sessions worked</p>
                  {topEvaluators.length === 0 ? (
                    <p className="text-sm text-gray-400 py-3">No session history yet.</p>
                  ) : (
                    <div>
                      {topEvaluators.map(ev => (
                        <div key={ev.id} className="flex items-center gap-3 py-2.5 border-t border-gray-100 first:border-t-0">
                          <div className="w-9 h-9 rounded-full bg-accent-soft text-accent flex items-center justify-center text-xs font-bold flex-shrink-0">{(ev.name || "?").split(" ").map(w => w[0]).slice(0, 2).join("").toUpperCase()}</div>
                          <div className="min-w-0 flex-1">
                            <div className="text-sm font-semibold text-ink truncate">{ev.name}</div>
                            <div className="text-xs text-gray-400 truncate">{ev._sessions} session{ev._sessions === 1 ? "" : "s"}{parseFloat(ev.total_hours || 0) > 0 ? ` · ${parseFloat(ev.total_hours).toFixed(0)}h` : ""}</div>
                          </div>
                          {parseFloat(ev.avg_rating || 0) > 0 && <span className="text-xs font-mono text-accent flex-shrink-0">{parseFloat(ev.avg_rating).toFixed(1)}★</span>}
                        </div>
                      ))}
                    </div>
                  )}
                  <button onClick={() => setActiveTab("evaluators")} className="mt-3 text-xs font-semibold text-accent hover:opacity-70 inline-flex items-center gap-1">Full pool <ArrowRight size={12} /></button>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === "associations" && (
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
        )}

        {activeTab === "schedule" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <h2 className="text-lg font-semibold text-gray-900">Master Schedule</h2>
              <div className="flex items-center gap-2 flex-wrap">
                {/* Week / Month / List toggle — Google-style views */}
                <div className="inline-flex rounded-lg border border-gray-200 p-0.5 bg-white">
                  {[
                    { id: "week", label: "Week", Icon: CalendarDays },
                    { id: "month", label: "Month", Icon: Calendar },
                    { id: "list", label: "List", Icon: List },
                  ].map(({ id, label, Icon }) => (
                    <button key={id} onClick={() => setScheduleView(id)}
                      className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                        scheduleView === id ? "bg-[#0b5cd6] text-white" : "text-gray-600 hover:bg-gray-50"
                      }`}>
                      <Icon size={12} /> {label}
                    </button>
                  ))}
                </div>
                {/* Session-type filter — all / testing only / evaluation */}
                <div className="inline-flex rounded-lg border border-gray-200 p-0.5 bg-white">
                  {[
                    { id: "all", label: "All" },
                    { id: "testing", label: "Testing" },
                    { id: "eval", label: "Evaluation" },
                  ].map(({ id, label }) => (
                    <button key={id} onClick={() => setScheduleTypeFilter(id)}
                      className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                        scheduleTypeFilter === id ? "bg-[#0b5cd6] text-white" : "text-gray-600 hover:bg-gray-50"
                      }`}>
                      {label}
                    </button>
                  ))}
                </div>
                {/* Association filter — narrow the schedule to one client association */}
                {associations.length > 1 && (
                  <select
                    value={scheduleAssocFilter}
                    onChange={e => setScheduleAssocFilter(e.target.value)}
                    className={`text-xs font-medium px-2.5 py-1.5 rounded-lg border cursor-pointer focus:outline-none focus:ring-2 focus:ring-[#0b5cd6]/30 ${scheduleAssocFilter !== "all" ? "border-[#0b5cd6] bg-[#0b5cd6]/5 text-[#0b5cd6]" : "border-gray-200 bg-white text-gray-600"}`}
                  >
                    <option value="all">All associations</option>
                    {associations.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                  </select>
                )}
                {/* Subscribe — add the master schedule to Google/Apple Calendar */}
                <button
                  onClick={async () => {
                    setShowSubscribe(true);
                    if (!calLinks) {
                      try { const r = await fetch(spUrl("/api/service-provider/calendar-link")); if (r.ok) setCalLinks(await r.json()); } catch {}
                    }
                  }}
                  className="text-xs px-3 py-1.5 rounded-lg border font-medium bg-white text-gray-600 border-gray-200 inline-flex items-center gap-1"
                >
                  <Calendar size={12} /> Subscribe
                </button>
                <button onClick={() => setShowPastSessions(!showPastSessions)} className="text-xs px-3 py-1.5 rounded-lg border font-medium bg-white text-gray-600 border-gray-200">
                  {showPastSessions ? "Hide Past" : `Show Past (${pastCount})`}
                </button>
                {/* Batch import — drop a schedule file for a chosen category */}
                {scheduleCategories.length > 0 && (
                  <BatchScheduleImport categories={scheduleCategories} org={orgParam} onSaved={onScheduleSaved} />
                )}
                {/* SP-owned testing sessions — add / bulk upload (belongs here, not in Testers) */}
                <TestingSessionsControls spUrl={spUrl} onSaved={onScheduleSaved} />
                {/* Add session — pick an association/category context first */}
                {scheduleCategories.length > 0 && (
                  <div className="inline-flex items-center gap-2">
                    <select
                      value={addSessionCatId}
                      onChange={(e) => setAddSessionCatId(e.target.value)}
                      className="text-xs border border-gray-300 rounded-lg px-2 py-1.5 bg-white text-gray-600 focus:outline-none focus:ring-2 focus:ring-accent/30 max-w-[14rem]"
                    >
                      <option value="">Add to…</option>
                      {scheduleCategories.map(c => (
                        <option key={c.age_category_id} value={c.age_category_id}>{c.org_name} · {c.category_name}</option>
                      ))}
                    </select>
                    {addSessionCategory && <AddSessionButton category={addSessionCategory} onSaved={onScheduleSaved} />}
                  </div>
                )}
              </div>
            </div>

            {scheduleSavedMsg && (
              <div className="bg-green-50 border border-green-200 rounded-xl px-4 py-2.5 text-sm text-green-700">
                Saved — association, directors and evaluators notified.
              </div>
            )}

            {showSubscribe && (
              <div className="fixed inset-0 bg-black/40 z-50 flex items-start justify-center p-4 overflow-y-auto" onClick={(e) => e.target === e.currentTarget && setShowSubscribe(false)}>
                <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg p-6 mt-16">
                  <div className="flex items-start justify-between mb-1">
                    <h3 className="font-display font-extrabold tracking-tight text-ink text-lg leading-tight">Add to your calendar</h3>
                    <button onClick={() => setShowSubscribe(false)} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
                  </div>
                  <p className="text-xs text-gray-400 mb-4">Subscribe once and every session across your client associations shows up in Google, Apple, or Outlook Calendar — and stays in sync as the schedule changes.</p>
                  {!calLinks ? (
                    <div className="py-6 text-center text-sm text-gray-400">Generating your calendar link…</div>
                  ) : (
                    <div className="space-y-3">
                      <a href={calLinks.googleUrl} target="_blank" rel="noopener noreferrer" className="w-full inline-flex items-center justify-center gap-2 py-2.5 bg-gradient-to-r from-[#0b5cd6] to-[#3b82f6] text-white rounded-lg text-sm font-semibold hover:shadow-md">
                        <Calendar size={15} /> Add to Google Calendar
                      </a>
                      <a href={calLinks.webcalUrl} className="w-full inline-flex items-center justify-center gap-2 py-2.5 border border-gray-300 text-ink rounded-lg text-sm font-semibold hover:bg-gray-50">
                        Add to Apple Calendar
                      </a>
                      <div>
                        <label className="text-xs font-medium text-gray-500 mb-1 block">Or paste this URL into any calendar app (“From URL” / “Subscribe”)</label>
                        <div className="flex items-center gap-2">
                          <input readOnly value={calLinks.httpsUrl} className="flex-1 text-[11px] bg-gray-50 border border-gray-200 rounded px-2 py-1.5 text-gray-700 font-mono" />
                          <button onClick={() => navigator.clipboard.writeText(calLinks.httpsUrl)} className="px-2.5 py-1.5 bg-accent text-white rounded text-xs font-semibold hover:opacity-90">Copy</button>
                        </div>
                      </div>
                      <p className="text-[11px] text-gray-400">Keep this link private — anyone with it can see your master schedule. Google refreshes subscribed calendars roughly every few hours.</p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Selected-date chip when a specific date is picked */}
            {scheduleSelectedDate && (
              <div className="flex items-center gap-2 px-3 py-2 bg-blue-50 border border-blue-200 rounded-lg">
                <Calendar size={14} className="text-blue-600" />
                <span className="text-sm text-blue-900">
                  Showing only <strong>{(() => {
                    const [y, m, d] = scheduleSelectedDate.split("-").map(Number);
                    return new Date(y, m - 1, d).toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" });
                  })()}</strong>
                </span>
                <button
                  onClick={() => setScheduleSelectedDate(null)}
                  className="ml-auto text-blue-600 hover:text-blue-900"
                  aria-label="Clear date filter"
                >
                  <X size={14} />
                </button>
              </div>
            )}

            {schedLoading ? <div className="py-12 text-center text-gray-400">Loading schedule...</div> : upcomingDates.length === 0 ? (
              <div className="py-16 text-center bg-white border border-dashed border-gray-200 rounded-2xl">
                <Calendar size={48} className="mx-auto text-gray-200 mb-4" />
                <h3 className="font-semibold text-gray-600">No upcoming sessions</h3>
              </div>
            ) : scheduleView === "week" ? (
              <WeekGrid
                sessions={schedule.filter(s => (showPastSessions || s.scheduled_date?.toString().split("T")[0] >= today) && matchesType(s))}
                paletteFor={scheduleOrgPalette}
                onSelect={(dateKey) => { setScheduleSelectedDate(dateKey); setScheduleView("list"); }}
                onOpen={(s) => { const k = s.scheduled_date?.toString().split("T")[0]; if (k) { setScheduleSelectedDate(k); setScheduleView("list"); } }}
              />
            ) : scheduleView === "month" ? (
              <MonthCalendar
                sessions={schedule.filter(s => (showPastSessions || s.scheduled_date?.toString().split("T")[0] >= today) && matchesType(s))}
                paletteFor={scheduleOrgPalette}
                onSelect={(dateKey) => { setScheduleSelectedDate(dateKey); setScheduleView("list"); }}
              />
            ) : (
              <>
                <DateStripBar
                  sessions={schedule.filter(s => (showPastSessions || s.scheduled_date?.toString().split("T")[0] >= today) && matchesType(s))}
                  selectedDate={scheduleSelectedDate}
                  onSelect={setScheduleSelectedDate}
                  paletteFor={scheduleOrgPalette}
                />
                <div className="space-y-6">
                  {visibleDates.map(date => (
                    <div key={date}>
                      <div className="flex items-center gap-3 mb-3">
                        <div className="h-px flex-1 bg-gray-200" />
                        <span className="text-sm font-semibold text-gray-600 whitespace-nowrap">{formatDate(date)}</span>
                        <div className="h-px flex-1 bg-gray-200" />
                      </div>
                      <div className="space-y-2">
                        {byDate[date].filter(matchesFilters).map(entry => {
                          const palette = scheduleOrgPalette(entry.org_name);
                          return (
                            <div
                              key={entry.schedule_id}
                              className={`bg-white border rounded-xl p-4 flex items-center gap-4 flex-wrap ${entry.status === "cancelled" ? "border-gray-200 opacity-60" : entry.spots_open > 0 ? "border-amber-200" : "border-gray-200"}`}
                              style={{ borderLeft: `4px solid ${palette.hex}` }}
                            >
                              <div className="flex-1 min-w-[9rem]">
                                <div className="flex items-center gap-2 flex-wrap mb-1">
                                  <OrgChip name={entry.org_name} palette={palette} />
                                  <span className="text-gray-700 text-sm font-medium">{entry.category_name}</span>
                                  {entry.session_type && <span className={`text-xs px-2 py-0.5 rounded-full font-medium capitalize ${SESSION_TYPE_COLORS[entry.session_type] || "bg-gray-100 text-gray-600"}`}>{entry.session_type}</span>}
                                  {entry.status === "cancelled" && <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-red-100 text-red-700">Cancelled</span>}
                                </div>
                                <div className="flex items-center gap-3 text-xs text-gray-500 flex-wrap">
                                  <span className="flex items-center gap-1"><Clock size={11} />{formatTime(entry.start_time)}{entry.end_time ? ` - ${formatTime(entry.end_time)}` : ""}</span>
                                  {entry.location && <span className="flex items-center gap-1"><MapPin size={11} />{entry.location}</span>}
                                  <span className="font-mono">S{entry.session_number}{entry.group_number ? ` G${entry.group_number}` : ""}</span>
                                </div>
                              </div>
                              <div className="flex items-center gap-2 flex-shrink-0 flex-wrap justify-end">
                                {entry.status !== "cancelled" && (
                                  <>
                                    {entry.is_goalie_sp ? (
                                      <button onClick={() => setRosterScheduleId(entry.schedule_id)} title="See who's evaluating this session" className="text-center hover:opacity-70">
                                        <div className={`text-sm font-bold ${entry.spots_open > 0 ? "text-amber-600" : "text-green-600"}`}>{entry.evaluators_signed_up}/{entry.goalie_evaluators_required}</div>
                                        <div className="text-xs text-gray-400 underline decoration-dotted underline-offset-2">goalie eval</div>
                                      </button>
                                    ) : entry.session_type === 'testing' ? (
                                      entry.is_goalie_sp
                                        ? <div className="text-center"><div className="text-sm font-bold text-gray-400">—</div><div className="text-xs text-gray-400">no evaluators needed</div></div>
                                        : <TesterStaffingControl entry={entry} spUrl={spUrl} onSaved={refetchSchedule} onOpenRoster={() => setRosterScheduleId(entry.schedule_id)} />
                                    ) : (
                                      <>
                                        <button onClick={() => setRosterScheduleId(entry.schedule_id)} title="See who's evaluating this session" className="text-center hover:opacity-70">
                                          <div className={`text-sm font-bold ${entry.spots_open > 0 ? "text-amber-600" : "text-green-600"}`}>{entry.evaluators_signed_up}/{entry.evaluators_required}</div>
                                          <div className="text-xs text-gray-400 underline decoration-dotted underline-offset-2">player eval</div>
                                        </button>
                                        {parseInt(entry.goalie_evaluators_required) > 0 && (
                                          <div className="text-center">
                                            <div className="text-sm font-bold text-gray-600">{entry.goalie_evaluators_required}</div>
                                            <div className="text-xs text-gray-400">goalie eval</div>
                                          </div>
                                        )}
                                      </>
                                    )}
                                    {entry.session_type === 'testing' && !entry.is_goalie_sp
                                      ? (entry.tester_spots_open > 0 ? <span className="text-xs px-2 py-1 bg-amber-100 text-amber-700 rounded-full">{entry.tester_spots_open} tester{entry.tester_spots_open === 1 ? "" : "s"} needed</span> : parseInt(entry.testers_required || 0) > 0 ? <span className="text-xs px-2 py-1 bg-green-100 text-green-700 rounded-full flex items-center gap-1"><CheckCircle size={11} /> Testers set</span> : null)
                                      : entry.session_type === 'testing' ? null
                                      : entry.spots_open > 0 ? <span className="text-xs px-2 py-1 bg-amber-100 text-amber-700 rounded-full">{entry.spots_open} open</span> : <span className="text-xs px-2 py-1 bg-green-100 text-green-700 rounded-full flex items-center gap-1"><CheckCircle size={11} /> Full</span>}
                                    {!entry.is_goalie_sp && <a href={`/checkin/${entry.schedule_id}`} className="text-xs px-3 py-1.5 border border-gray-200 text-gray-600 rounded-lg hover:bg-gray-50">Check-in</a>}
                                    {/* Goalie SP evaluates its own goalies — jump straight into scoring. */}
                                    {entry.is_goalie_sp && entry.status !== "cancelled" && (
                                      <a href={`/evaluator/score/${entry.schedule_id}`} className="text-xs px-3 py-1.5 bg-gradient-to-r from-[#0b5cd6] to-[#3b82f6] text-white rounded-lg font-semibold hover:shadow-md inline-flex items-center gap-1.5">
                                        <Star size={12} /> Evaluate
                                      </a>
                                    )}
                                    {entry.spots_open > 0 && <BlastButton scheduleId={entry.schedule_id} spotsOpen={entry.spots_open} />}
                                  </>
                                )}
                                <ScheduleRowControls entry={entry} onSaved={onScheduleSaved} orgParam={orgParam} />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        )}

        {activeTab === "leads" && (
          <LeadsSection spUrl={spUrl} orgParam={orgParam} associations={associations} />
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
                <a href="/service-provider/dashboard/scoring-guide" className="inline-flex items-center gap-1.5 px-4 py-2 border border-gray-300 text-ink bg-white rounded-lg text-sm font-semibold hover:bg-gray-50">
                  <BookOpen size={14} /> Scoring guide
                </a>
                <button onClick={() => setShowSetRates(true)} className="inline-flex items-center gap-1.5 px-4 py-2 border border-gray-300 text-ink bg-white rounded-lg text-sm font-semibold hover:bg-gray-50">
                  $ Set rates
                </button>
                <button
                  onClick={() => downloadContactsCsv(filteredEvaluators.length ? filteredEvaluators : evaluators, "evaluator-contacts.csv")}
                  title="Download name, email, phone and status for the evaluators currently shown"
                  className="inline-flex items-center gap-1.5 px-4 py-2 border border-gray-300 text-ink bg-white rounded-lg text-sm font-semibold hover:bg-gray-50">
                  <Upload size={14} className="rotate-180" /> Export contacts
                </button>
                <button onClick={() => setComposeRecipient({ to_all_pool: true, label: "To everyone in your evaluator pool" })} className="inline-flex items-center gap-1.5 px-4 py-2 bg-accent text-white rounded-lg text-sm font-semibold hover:opacity-90">
                  <MessageSquare size={14} /> Message all pool
                </button>
              </div>
            </div>

            <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
              <div className="px-5 py-4 border-b border-gray-100">
                <h3 className="text-sm font-semibold text-gray-900">Invite Evaluators by Email</h3>
                <p className="text-xs text-gray-400 mt-0.5">Paste one or many — separated by commas, spaces, or new lines. Each gets their own invite.</p>
              </div>
              <div className="p-5">
                <textarea rows={3} placeholder={"evaluator1@example.com, evaluator2@example.com\nevaluator3@example.com"} value={evalInviteEmail} onChange={e => setEvalInviteEmail(e.target.value)} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0b5cd6]/30 resize-y" />
                <div className="flex items-center justify-between gap-3 mt-3 flex-wrap">
                  <span className="text-xs text-gray-400">{evalInviteEmail.split(/[\s,;]+/).map(e => e.trim()).filter(Boolean).length} email{evalInviteEmail.split(/[\s,;]+/).map(e => e.trim()).filter(Boolean).length === 1 ? "" : "s"}</span>
                  <button disabled={!evalInviteEmail.trim() || evalInviteSending}
                    onClick={async () => {
                      const activeCode = joinCodeData?.codes?.find(c => c.uses < c.max_uses);
                      if (!activeCode) { setEvalInviteMsg({ type: "error", text: "Generate a join code first" }); return; }
                      const emails = evalInviteEmail.split(/[\s,;]+/).map(e => e.trim()).filter(Boolean);
                      if (!emails.length) { setEvalInviteMsg({ type: "error", text: "Add at least one email" }); return; }
                      setEvalInviteSending(true); setEvalInviteMsg(null);
                      const signupUrl = `${window.location.origin}/evaluator/signup?code=${activeCode.code}`;
                      const res = await fetch("/api/service-provider/notify", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "invite_evaluators", emails, signup_url: signupUrl, sp_name: sp?.name }) });
                      const data = await res.json();
                      setEvalInviteSending(false);
                      if (data.success) { setEvalInviteMsg({ type: "success", text: data.message || `Sent ${data.sent} invites` }); setEvalInviteEmail(""); }
                      else { setEvalInviteMsg({ type: "error", text: data.error || "Failed" }); }
                    }}
                    className="px-5 py-2 bg-gradient-to-r from-[#0b5cd6] to-[#3b82f6] text-white rounded-lg text-sm font-semibold disabled:opacity-40 whitespace-nowrap">
                    {evalInviteSending ? "Sending..." : "Send Invites"}
                  </button>
                </div>
                {evalInviteMsg && <p className={`text-xs font-medium mt-2 ${evalInviteMsg.type === "success" ? "text-green-600" : "text-red-500"}`}>{evalInviteMsg.text}</p>}
              </div>
            </div>

            <OpenSpotsTracker open={evaluatorOpenSpots} sessions={evaluatorSessionsNeeding} noun="evaluator" />

            {bulkDeleteMsg && (() => {
              const isErr = bulkDeleteMsg.startsWith("⚠️");
              return (
                <div className={`rounded-xl px-4 py-3 flex items-center justify-between text-sm ${isErr ? "bg-red-50 border border-red-200 text-red-700" : "bg-green-50 border border-green-200 text-green-700"}`}>
                  <span>{bulkDeleteMsg}</span>
                  <button onClick={() => setBulkDeleteMsg(null)} className={isErr ? "text-red-600 hover:text-red-800" : "text-green-600 hover:text-green-800"}><X size={14} /></button>
                </div>
              );
            })()}

            {ratesSavedMsg && (
              <div className="rounded-xl px-4 py-3 flex items-center justify-between text-sm bg-green-50 border border-green-200 text-green-700">
                <span>Rates saved.</span>
                <button onClick={() => setRatesSavedMsg(false)} className="text-green-600 hover:text-green-800"><X size={14} /></button>
              </div>
            )}

            {flags.length > 0 && (
              <div className="bg-red-50 border border-red-200 rounded-xl p-4">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-semibold text-red-800">Performance Flags</h3>
                  {selFlags.length > 0 && (
                    <button onClick={async () => { const data = await bulkAction({ action: "dismiss_flag", flag_ids: selFlags }); if (!data) return; setSelFlags([]); queryClient.invalidateQueries({ queryKey: ["sp-evaluators"] }); }} className="text-xs px-3 py-1.5 bg-white text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 font-medium">Dismiss selected ({selFlags.length})</button>
                  )}
                </div>
                <div className="space-y-2">
                  {flags.map(flag => (
                    <div key={flag.id} className="flex items-center justify-between bg-white rounded-lg p-3 border border-red-100">
                      <div className="flex items-center gap-3">
                        <input type="checkbox" checked={selFlags.includes(flag.id)} onChange={e => setSelFlags(e.target.checked ? [...selFlags, flag.id] : selFlags.filter(id => id !== flag.id))} className="rounded border-gray-300" />
                        <div>
                        <span className="font-medium text-gray-900 text-sm">{flag.evaluator_name}</span>
                        <span className="mx-2 text-gray-300">-</span>
                        <span className="text-xs text-gray-500">{flag.org_name} S{flag.session_number}</span>
                        <span className="mx-2 text-gray-300">-</span>
                        <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">{flag.flag_type.replace(/_/g, " ")}</span>
                        </div>
                      </div>
                      <button onClick={async () => { await fetch("/api/service-provider/evaluators", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "dismiss_flag", flag_id: flag.id }) }); queryClient.invalidateQueries({ queryKey: ["sp-evaluators"] }); }} className="text-xs text-gray-400 hover:text-gray-600 px-2 py-1 hover:bg-gray-100 rounded">Dismiss</button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {pendingHours.length > 0 && (
              <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                <div className="px-5 py-3 bg-amber-50 border-b border-amber-200 flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-amber-800">Pending Hours Approval</h3>
                  {selHours.length > 0 && (
                    <button onClick={async () => { const data = await bulkAction({ action: "approve_hours", hours_ids: selHours }); if (!data) return; setSelHours([]); queryClient.invalidateQueries({ queryKey: ["sp-evaluators"] }); }} className="text-xs px-3 py-1.5 bg-green-100 text-green-700 border border-green-200 rounded-lg hover:bg-green-200 font-medium">Approve selected ({selHours.length})</button>
                  )}
                </div>
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b border-gray-100"><tr><th className="px-4 py-2 text-center w-10"><input type="checkbox" checked={pendingHours.length > 0 && selHours.length === pendingHours.length} onChange={e => setSelHours(e.target.checked ? pendingHours.map(h => h.id) : [])} className="rounded border-gray-300" /></th><th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Evaluator</th><th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Session</th><th className="px-4 py-2 text-center text-xs font-medium text-gray-500 uppercase">Hours</th><th className="px-4 py-2 text-center text-xs font-medium text-gray-500 uppercase">Action</th></tr></thead>
                  <tbody className="divide-y divide-gray-100">
                    {pendingHours.map(h => (
                      <tr key={h.id} className="hover:bg-gray-50">
                        <td className="px-4 py-2.5 text-center"><input type="checkbox" checked={selHours.includes(h.id)} onChange={e => setSelHours(e.target.checked ? [...selHours, h.id] : selHours.filter(id => id !== h.id))} className="rounded border-gray-300" /></td>
                        <td className="px-4 py-2.5 font-medium text-gray-900">{h.evaluator_name}</td>
                        <td className="px-4 py-2.5 text-gray-500">{h.org_name} - {h.category_name} S{h.session_number}</td>
                        <td className="px-4 py-2.5 text-center font-bold text-gray-900">{parseFloat(h.hours_worked).toFixed(1)}h</td>
                        <td className="px-4 py-2.5 text-center"><button onClick={async () => { await fetch("/api/service-provider/evaluators", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "approve_hours", hours_id: h.id }) }); queryClient.invalidateQueries({ queryKey: ["sp-evaluators"] }); }} className="text-xs px-3 py-1 bg-green-100 text-green-700 rounded-full hover:bg-green-200 font-medium">Approve</button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <MessagesSection />

            {selEvals.length > 0 && (
              <div className="bg-white border border-gray-200 rounded-xl px-4 py-3 flex items-center gap-2 flex-wrap">
                <span className="text-sm font-medium text-gray-700 mr-1">{selEvals.length} selected</span>
                <button onClick={async () => { const data = await bulkAction({ action: "approve", evaluator_ids: selEvals }); if (!data) return; setSelEvals([]); queryClient.invalidateQueries({ queryKey: ["sp-evaluators"] }); }} className="text-xs px-3 py-1.5 bg-green-100 text-green-700 border border-green-200 rounded-lg hover:bg-green-200 font-medium">Approve ({selEvals.length})</button>
                <button onClick={async () => { if (confirm('Suspend ' + selEvals.length + ' evaluators?')) { const data = await bulkAction({ action: "suspend", evaluator_ids: selEvals }); if (!data) return; setSelEvals([]); queryClient.invalidateQueries({ queryKey: ["sp-evaluators"] }); } }} className="text-xs px-3 py-1.5 bg-amber-50 text-amber-600 border border-amber-200 rounded-lg hover:bg-amber-100 font-medium">Suspend ({selEvals.length})</button>
                <button onClick={() => setComposeRecipient({ to_user_ids: [...selEvals], label: `To ${selEvals.length} selected evaluator${selEvals.length === 1 ? "" : "s"}` })} className="text-xs px-3 py-1.5 bg-accent-soft text-accent border border-accent/20 rounded-lg hover:opacity-90 font-medium inline-flex items-center gap-1.5"><MessageSquare size={12} /> Message selected ({selEvals.length})</button>
                <button onClick={() => { setBulkDeleteMsg(null); setShowBulkDelete(true); }} className="text-xs px-3 py-1.5 bg-red-50 text-red-500 border border-red-200 rounded-lg hover:bg-red-100 font-medium">Delete ({selEvals.length})</button>
              </div>
            )}

            {/* Search + status filter toolbar */}
            <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
              <div className="relative flex-1 max-w-sm">
                <input
                  type="text"
                  placeholder="Search by name or email…"
                  value={evalSearch}
                  onChange={e => { setEvalSearch(e.target.value); setEvalPage(1); }}
                  className="w-full border border-gray-300 rounded-lg pl-3 pr-8 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent/30"
                />
                {evalSearch && (
                  <button onClick={() => { setEvalSearch(""); setEvalPage(1); }} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                    <X size={14} />
                  </button>
                )}
              </div>
              <div className="inline-flex rounded-lg border border-gray-200 bg-white p-0.5 gap-0.5">
                {[{ id: "all", label: "All" }, { id: "pending", label: "Pending" }, { id: "active", label: "Active" }, { id: "suspended", label: "Suspended" }].map(s => (
                  <button
                    key={s.id}
                    onClick={() => { setEvalStatusFilter(s.id); setEvalPage(1); }}
                    className={`px-3 py-1 rounded-md text-xs font-medium transition-colors whitespace-nowrap ${evalStatusFilter === s.id ? "bg-accent text-white" : "text-gray-600 hover:bg-gray-50"}`}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
              {(evalSearch || evalStatusFilter !== "all") && (
                <span className="text-xs text-gray-400 whitespace-nowrap">{filteredEvaluators.length} of {evaluators.length}</span>
              )}
            </div>

            <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-4 py-3 text-center w-10"><input type="checkbox" checked={filteredEvaluators.length > 0 && filteredEvaluators.every(ev => selEvals.includes(ev.id))} onChange={e => setSelEvals(e.target.checked ? filteredEvaluators.map(ev => ev.id) : selEvals.filter(id => !filteredEvaluators.find(ev => ev.id === id)))} className="rounded border-gray-300" /></th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Evaluator</th>
                    <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Sessions</th>
                    <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Hours</th>
                    <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Pending</th>
                    <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Rating</th>
                    <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filteredEvaluators.length === 0 ? (
                    <tr><td colSpan={7} className="py-10 text-center text-gray-400 text-sm">{evaluators.length === 0 ? "No evaluators in pool yet" : "No evaluators match your search"}</td></tr>
                  ) : pagedEvaluators.map(ev => (
                    <tr key={ev.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 text-center"><input type="checkbox" checked={selEvals.includes(ev.id)} onClick={e => e.stopPropagation()} onChange={e => setSelEvals(e.target.checked ? [...selEvals, ev.id] : selEvals.filter(id => id !== ev.id))} className="rounded border-gray-300" /></td>
                      <td className="px-4 py-3 cursor-pointer" onClick={() => window.location.href = `/service-provider/evaluator/${ev.id}`}>
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-gray-900 hover:text-[#0b5cd6]">{ev.name}</span>
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
                          {ev.membership_status === "pending" && <button onClick={async (e) => { e.stopPropagation(); await fetch("/api/service-provider/evaluators", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "approve", evaluator_id: ev.id }) }); queryClient.invalidateQueries({ queryKey: ["sp-evaluators"] }); }} className="text-xs px-2 py-1 bg-green-100 text-green-700 border border-green-200 rounded-lg hover:bg-green-200">Approve</button>}
                          {ev.membership_status !== "suspended" ? <button onClick={async (e) => { e.stopPropagation(); if (confirm(`Suspend ${ev.name}?`)) { await fetch("/api/service-provider/evaluators", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "suspend", evaluator_id: ev.id }) }); queryClient.invalidateQueries({ queryKey: ["sp-evaluators"] }); } }} className="text-xs px-2 py-1 bg-amber-50 text-amber-600 border border-amber-200 rounded-lg hover:bg-amber-100">Suspend</button> : <button onClick={async (e) => { e.stopPropagation(); await fetch("/api/service-provider/evaluators", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "reinstate", evaluator_id: ev.id }) }); queryClient.invalidateQueries({ queryKey: ["sp-evaluators"] }); }} className="text-xs px-2 py-1 bg-green-50 text-green-600 border border-green-200 rounded-lg hover:bg-green-100">Reinstate</button>}
                          <button onClick={async (e) => { e.stopPropagation(); if (confirm(`Delete ${ev.name}?`)) { const res = await fetch("/api/service-provider/evaluators", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "delete_account", evaluator_id: ev.id }) }); const data = await res.json(); if (data.error) alert(data.error); queryClient.invalidateQueries({ queryKey: ["sp-evaluators"] }); } }} className="text-xs px-2 py-1 bg-red-50 text-red-500 border border-red-200 rounded-lg hover:bg-red-100">Delete</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {/* Pagination */}
              {filteredEvaluators.length > EVAL_PAGE_SIZE && (
                <div className="px-4 py-3 border-t border-gray-100 flex items-center justify-between gap-4">
                  <span className="text-xs text-gray-500">
                    {(evalPageSafe - 1) * EVAL_PAGE_SIZE + 1}–{Math.min(evalPageSafe * EVAL_PAGE_SIZE, filteredEvaluators.length)} of {filteredEvaluators.length}
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      disabled={evalPageSafe <= 1}
                      onClick={() => setEvalPage(p => Math.max(1, p - 1))}
                      className="text-xs px-3 py-1.5 border border-gray-200 text-gray-600 rounded-lg hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      Prev
                    </button>
                    <span className="text-xs text-gray-500 font-medium">{evalPageSafe} / {evalTotalPages}</span>
                    <button
                      disabled={evalPageSafe >= evalTotalPages}
                      onClick={() => setEvalPage(p => Math.min(evalTotalPages, p + 1))}
                      className="text-xs px-3 py-1.5 border border-gray-200 text-gray-600 rounded-lg hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      Next
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Join codes only — the email-invite panel now lives at the top of the tab */}
            <details className="group bg-white border border-gray-200 rounded-xl overflow-hidden">
              <summary className="px-5 py-4 cursor-pointer list-none flex items-center justify-between hover:bg-gray-50">
                <span className="text-sm font-semibold text-gray-900">Add evaluators — join codes</span>
                <span className="text-gray-400 text-xs group-open:hidden">Show</span>
                <span className="text-gray-400 text-xs hidden group-open:inline">Hide</span>
              </summary>
              <div className="border-t border-gray-100 p-5 space-y-6">
                <JoinCodesPanel orgId={assocData?.sp?.id} data={joinCodeData} refetch={refetchCodes} />
              </div>
            </details>

            {showBulkDelete && (
              <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
                <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-base font-bold text-gray-900">Delete {selEvals.length} evaluators?</h3>
                    <button onClick={() => { setShowBulkDelete(false); setDeleteConfirm(""); }} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
                  </div>
                  <p className="text-sm text-gray-500 mb-4">This permanently deletes the selected accounts. Any evaluator with session history will be skipped automatically.</p>
                  <input type="text" value={deleteConfirm} onChange={e => setDeleteConfirm(e.target.value)} placeholder="type DELETE to confirm" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-300 mb-4" />
                  {bulkDeleteMsg && <p className="text-xs font-medium text-gray-600 mb-3">{bulkDeleteMsg}</p>}
                  <div className="flex gap-3">
                    <button onClick={() => { setShowBulkDelete(false); setDeleteConfirm(""); }} className="flex-1 px-4 py-2 border border-gray-200 text-gray-600 rounded-lg text-sm">Cancel</button>
                    <button
                      disabled={deleteConfirm !== "DELETE"}
                      onClick={async () => {
                        const data = await bulkAction({ action: "delete_account", evaluator_ids: selEvals });
                        if (!data) return;
                        setSelEvals([]); setShowBulkDelete(false); setDeleteConfirm("");
                        setBulkDeleteMsg(`${data.deleted} deleted, ${data.skipped} skipped`);
                        queryClient.invalidateQueries({ queryKey: ["sp-evaluators"] });
                      }}
                      className="flex-1 px-4 py-2 bg-red-500 text-white rounded-lg text-sm font-semibold disabled:opacity-40">
                      Delete
                    </button>
                  </div>
                </div>
              </div>
            )}

            {showSetRates && (
              <SetRatesModal
                evaluators={evaluators.filter(ev => ev.membership_status !== "deleted" && ev.membership_status !== "suspended")}
                onClose={() => setShowSetRates(false)}
                onSaved={() => {
                  queryClient.invalidateQueries({ queryKey: ["sp-evaluators", orgParam] });
                  setRatesSavedMsg(true);
                  setTimeout(() => setRatesSavedMsg(false), 4000);
                }}
              />
            )}

            {composeRecipient && (
              <ComposeMessageModal
                recipient={composeRecipient}
                onClose={() => setComposeRecipient(null)}
                onSent={() => { setSelEvals([]); queryClient.invalidateQueries({ queryKey: ["sp-messages"] }); }}
              />
            )}
          </div>
        )}

        {/* Per-session roster — opened by clicking a session's evaluator count in the
            Master Schedule. Shows who's signed up and lets the SP add/remove. */}
        {rosterScheduleId && (
          <SessionRosterModal scheduleId={rosterScheduleId} onClose={() => { setRosterScheduleId(null); refetchSchedule(); }} />
        )}
      </div>
    </div>
  );
}

export default function ServiceProviderDashboardPage() {
  return (
    <QueryClientProvider client={qc}>
      <Suspense fallback={<div className="min-h-screen bg-gray-50 flex items-center justify-center" data-theme="premium"><div className="animate-spin rounded-full h-10 w-10 border-b-2 border-accent" /></div>}>
        <SPDashboard />
      </Suspense>
    </QueryClientProvider>
  );
}
