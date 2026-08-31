"use client";

import { useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { useQuery, useQueryClient, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { LogOut } from "lucide-react";
import { useTrackPageView } from "@/lib/useAnalytics";
import NotificationBell from "@/components/NotificationBell";
import InstallAppButton from "@/components/InstallAppButton";
import { useTheme } from "@/lib/useTheme";
import ThemeToggle from "@/components/ThemeToggle";
import { localToday, sessionStaffing } from "@/lib/spDashboardUtils";
import { isSessionPast } from "@/lib/sessionTiming";
import OverviewTab from "@/components/service-provider/OverviewTab";
import AssociationsTab from "@/components/service-provider/AssociationsTab";
import ScheduleTab from "@/components/service-provider/ScheduleTab";
import EvaluatorsTab from "@/components/service-provider/EvaluatorsTab";
import { EvaluatorEfficiencyReport, StaffingReports } from "@/components/service-provider/Reports";
import LeadsSection from "@/components/service-provider/LeadsSection";
import PayrollTab from "@/components/service-provider/PayrollTab";
import SpLogoControl from "@/components/service-provider/SpLogoControl";
import TestersTab from "@/components/service-provider/TestersTab";


const qc = new QueryClient();

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

  const sp = assocData?.sp;
  const associations = assocData?.associations || [];
  const evaluatorStats = assocData?.evaluatorStats || {};
  const evaluators = evalData?.evaluators || [];
  const flags = evalData?.flags || [];
  const pendingHours = evalData?.pendingHours || [];

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
  // "Upcoming" is 4 hours after a session's own end_time (isSessionPast), not a
  // midnight/date-only cutoff -- a date-only ">= today" check left a 9am session
  // cluttering every count and card all day after it had already finished,
  // same staleness bug the evaluator dashboard's Score Now card had.
  const needsEvaluators = schedule.filter(s => sessionStaffing(s).open > 0 && !isSessionPast(s)).length;
  // Total OPEN SPOTS across upcoming sessions — remaining EVALUATOR slots on eval
  // sessions plus remaining TESTER slots on testing sessions (what "how many more
  // people do I need" really means).
  const openSpots = schedule
    .filter(s => !isSessionPast(s))
    .reduce((sum, s) => sum + sessionStaffing(s).open, 0);
  const totalUpcoming = schedule.filter(s => !isSessionPast(s)).length;
  // Split by pool — what the Evaluator Pool / Tester Pool tabs each show up top.
  const upcomingSchedule = schedule.filter(s => !isSessionPast(s));
  const evaluatorOpenSpots = upcomingSchedule.filter(s => !sessionStaffing(s).isTesting).reduce((sum, s) => sum + sessionStaffing(s).open, 0);
  const evaluatorSessionsNeeding = upcomingSchedule.filter(s => !sessionStaffing(s).isTesting && sessionStaffing(s).open > 0).length;
  const testerOpenSpots = upcomingSchedule.filter(s => sessionStaffing(s).isTesting).reduce((sum, s) => sum + sessionStaffing(s).open, 0);
  const testerSessionsNeeding = upcomingSchedule.filter(s => sessionStaffing(s).isTesting && sessionStaffing(s).open > 0).length;

  // ── Overview (home) data ──
  const dateOf = (s) => s.scheduled_date?.toString().split("T")[0];
  const byDateTime = (a, b) => (dateOf(a) + (a.start_time || "")).localeCompare(dateOf(b) + (b.start_time || ""));
  // Past sessions dropped up front — nothing below needs to special-case them,
  // and a finished session never lingers under "Today" for the rest of the day.
  const liveSessions = schedule.filter(s => s.status !== "cancelled" && !isSessionPast(s));
  const todaySessions = liveSessions.filter(s => dateOf(s) === today).sort(byDateTime);
  const upcomingSessions = liveSessions.filter(s => dateOf(s) > today).sort(byDateTime).slice(0, 8);
  const needsAttention = liveSessions
    .filter(s => sessionStaffing(s).open > 0)
    .sort(byDateTime)
    .slice(0, 6);
  const topEvaluators = [...evaluators]
    .filter(ev => ev.membership_status !== "pending" && ev.membership_status !== "suspended")
    .map(ev => ({ ...ev, _sessions: parseInt(ev.total_sessions || 0) }))
    .filter(ev => ev._sessions > 0)
    .sort((a, b) => b._sessions - a._sessions || parseFloat(b.total_hours || 0) - parseFloat(a.total_hours || 0))
    .slice(0, 5);

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
          <OverviewTab
            associations={associations} todaySessions={todaySessions} upcomingSessions={upcomingSessions}
            schedLoading={schedLoading} today={today} totalUpcoming={totalUpcoming} openSpots={openSpots}
            needsEvaluators={needsEvaluators} needsAttention={needsAttention} topEvaluators={topEvaluators}
            onGoToTab={setActiveTab}
          />
        )}

        {activeTab === "associations" && (
          <AssociationsTab
            associations={associations} assocLoading={assocLoading} schedule={schedule} today={today}
            sp={sp} spUrl={spUrl} queryClient={queryClient}
          />
        )}

        {activeTab === "schedule" && (
          <ScheduleTab
            schedule={schedule} byDate={byDate} schedLoading={schedLoading} today={today}
            associations={associations} orgParam={orgParam} spUrl={spUrl} refetchSchedule={refetchSchedule}
          />
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
          <EvaluatorsTab
            evaluators={evaluators} flags={flags} pendingHours={pendingHours}
            evaluatorOpenSpots={evaluatorOpenSpots} evaluatorSessionsNeeding={evaluatorSessionsNeeding}
            spUrl={spUrl} orgParam={orgParam} sp={sp} queryClient={queryClient}
            joinCodeData={joinCodeData} refetchCodes={refetchCodes}
          />
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
