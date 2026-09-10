"use client";

import { Suspense } from "react";
import { useParams } from "next/navigation";
import { useQuery, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ArrowLeft, Calendar, Clock, MapPin } from "lucide-react";
import { useTheme } from "@/lib/useTheme";
import ThemeToggle from "@/components/ThemeToggle";

const qc = new QueryClient();

function formatDate(d) {
  if (!d) return "";
  const [y, m, day] = d.toString().split("T")[0].split("-").map(Number);
  return new Date(y, m - 1, day).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" });
}
function formatTime(t) {
  if (!t) return "";
  const [h, m] = t.toString().split(":");
  const hr = parseInt(h);
  return `${hr > 12 ? hr - 12 : hr === 0 ? 12 : hr}:${m} ${hr >= 12 ? "PM" : "AM"}`;
}

function TesterDetailInner() {
  const params = useParams();
  const testerId = params.testerId;
  const [theme, toggleTheme] = useTheme();

  const { data, isLoading } = useQuery({
    queryKey: ["tester-detail", testerId],
    queryFn: async () => {
      const res = await fetch(`/api/service-provider/tester/${testerId}`);
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
  });

  const tester = data?.tester;
  const sessions = data?.sessions || [];
  const stats = data?.stats || {};

  if (isLoading) return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center" data-theme="premium">
      <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-accent" />
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-50" data-theme={theme}>
      <div className="bg-white border-b border-gray-200 shadow-sm">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-5">
          <a href="/service-provider/dashboard"
            className="inline-flex items-center gap-1.5 font-display text-xs font-bold tracking-[0.2em] uppercase text-accent hover:opacity-70 transition-opacity mb-2">
            <ArrowLeft size={13} /> Back to Testers
          </a>
          <div className="flex items-start justify-between flex-wrap gap-4">
            <div className="min-w-0 flex-1">
              <div className="flex items-end gap-4 flex-wrap">
                <h1 className="font-display font-black tracking-tight text-ink text-4xl sm:text-5xl leading-none">{tester?.name}</h1>
                <div className="w-11 h-11 rounded-full bg-accent flex items-center justify-center text-white text-base font-bold flex-shrink-0">
                  {tester?.name?.split(" ").map(n => n[0]).join("").substring(0, 2)}
                </div>
              </div>
              <div className="flex items-center gap-2 mt-3 flex-wrap text-sm text-gray-500 font-medium">
                <span>{tester?.email}</span>
              </div>
            </div>
            <ThemeToggle theme={theme} onToggle={toggleTheme} />
          </div>

          <div className="grid grid-cols-3 gap-3 mt-5 max-w-md">
            <div className="bg-gray-50 border border-gray-200 rounded-xl px-3 py-2.5 text-center">
              <div className="text-xl font-bold text-ink">{stats.total_sessions || 0}</div>
              <div className="text-[10px] text-gray-500">Sessions</div>
            </div>
            <div className="bg-gray-50 border border-gray-200 rounded-xl px-3 py-2.5 text-center">
              <div className="text-xl font-bold text-ink">{(stats.total_hours || 0).toFixed(1)}</div>
              <div className="text-[10px] text-gray-500">Total Hours</div>
            </div>
            <div className="bg-gray-50 border border-gray-200 rounded-xl px-3 py-2.5 text-center">
              <div className={`text-xl font-bold ${stats.pending_hours > 0 ? "text-amber-600" : "text-green-600"}`}>{(stats.pending_hours || 0).toFixed(1)}</div>
              <div className="text-[10px] text-gray-500">Pending Approval</div>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6 space-y-3">
        {sessions.length === 0 ? (
          <div className="py-12 text-center text-gray-400 bg-white border border-dashed border-gray-200 rounded-xl">
            <Calendar size={40} className="mx-auto mb-3 opacity-30" />
            <p className="text-sm">No sessions yet</p>
          </div>
        ) : sessions.map(s => (
          <div key={s.id} className={`bg-white border rounded-xl p-5 ${s.status === "cancelled" ? "border-gray-100 opacity-60" : "border-gray-200"}`}>
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div className="flex-1">
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  <span className="font-semibold text-gray-900">{s.org_name}</span>
                  <span className="text-gray-300">·</span>
                  <span className="text-gray-600">{s.category_name}</span>
                  {s.status === "cancelled" && <span className="text-xs px-2 py-0.5 bg-gray-100 text-gray-500 rounded-full">Cancelled</span>}
                </div>
                <div className="flex items-center gap-3 text-sm text-gray-500 flex-wrap">
                  <span className="flex items-center gap-1"><Calendar size={12} />{formatDate(s.scheduled_date)}</span>
                  {s.start_time && <span className="flex items-center gap-1"><Clock size={12} />{formatTime(s.start_time)}{s.end_time ? ` – ${formatTime(s.end_time)}` : ""}</span>}
                  {s.location && <span className="flex items-center gap-1"><MapPin size={12} />{s.location}</span>}
                  <span className="text-gray-400">S{s.session_number}{s.group_number ? ` G${s.group_number}` : ""}</span>
                </div>
              </div>
              {s.hours_worked && (
                <span className={`text-xs px-2.5 py-1 rounded-full font-medium flex-shrink-0 ${s.hours_status === "approved" ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700"}`}>
                  {parseFloat(s.hours_worked).toFixed(1)}h {s.hours_status === "approved" ? "✓ approved" : "pending"}
                </span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function TesterDetailPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-gray-50" />}>
      <QueryClientProvider client={qc}>
        <TesterDetailInner />
      </QueryClientProvider>
    </Suspense>
  );
}
