import { useQuery } from "@tanstack/react-query";
import { Building2, Users, Activity, Calendar, TrendingUp, Shield } from "lucide-react";
import { MetricCard } from "./MetricCard";
import { LoadingState } from "./LoadingState";

export function OverviewTab() {
  const { data: analytics, isLoading } = useQuery({
    queryKey: ["god-mode-analytics"],
    queryFn: async () => {
      const res = await fetch("/api/admin/god-mode/analytics");
      if (!res.ok) throw new Error("Failed to fetch analytics");
      return res.json();
    },
  });

  if (isLoading) return <LoadingState text="Fetching system analytics..." />;

  const overview = analytics?.overview || {};
  const recent = analytics?.recentActivity || {};
  const topOrgs = analytics?.topOrgs || [];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      {/* Key Metrics */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 12 }}>
        <MetricCard title="Organizations" value={overview.total_organizations || 0} icon={Building2} color="blue" />
        <MetricCard title="Total Users" value={overview.total_users || 0} icon={Users} color="purple" subtitle={`+${recent.new_users || 0} this week`} />
        <MetricCard title="Active Athletes" value={overview.total_athletes || 0} icon={Activity} color="emerald" subtitle={`+${recent.new_athletes || 0} this week`} />
        <MetricCard title="Sessions" value={overview.total_sessions || 0} icon={Calendar} color="amber" subtitle={`+${recent.new_sessions || 0} this week`} />
        <MetricCard title="Total Scores" value={overview.total_scores || 0} icon={TrendingUp} color="rose" subtitle={`+${recent.new_scores || 0} this week`} />
        <MetricCard title="Assignments" value={overview.total_assignments || 0} icon={Shield} color="indigo" />
      </div>

      {/* Top Organizations */}
      <div className="gm-card" style={{ padding: "20px" }}>
        <div className="gm-section-title">Top Organizations by Activity</div>
        {topOrgs.length === 0 ? (
          <div style={{ padding: "32px 0", textAlign: "center", color: "var(--gm-dim)", fontSize: 13 }}>No organizations yet</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            {topOrgs.map((org, idx) => (
              <div key={org.id} style={{
                display: "flex", alignItems: "center", justifyContent: "space-between",
                padding: "12px 14px", borderRadius: 8, gap: 12,
                transition: "background 0.1s",
              }}
              onMouseEnter={e => e.currentTarget.style.background = "rgba(255,255,255,0.03)"}
              onMouseLeave={e => e.currentTarget.style.background = "transparent"}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 12, flex: 1, minWidth: 0 }}>
                  <div style={{
                    width: 28, height: 28, borderRadius: 8, flexShrink: 0,
                    background: idx === 0 ? "rgba(255,107,53,0.15)" : "var(--gm-surface2)",
                    border: `1px solid ${idx === 0 ? "rgba(255,107,53,0.3)" : "var(--gm-border)"}`,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 12, fontWeight: 700, color: idx === 0 ? "var(--gm-accent)" : "var(--gm-muted)",
                    fontFamily: "'DM Mono', monospace"
                  }}>
                    {idx + 1}
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ color: "var(--gm-text)", fontSize: 13, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{org.name}</div>
                    <div style={{ color: "var(--gm-dim)", fontSize: 11, marginTop: 1, textTransform: "capitalize" }}>{org.type?.replace("_", " ")}</div>
                  </div>
                </div>
                <div style={{ display: "flex", gap: 24, flexShrink: 0 }}>
                  {[
                    { val: org.session_count, label: "Sessions" },
                    { val: org.athlete_count, label: "Athletes" },
                    { val: org.score_count, label: "Scores" },
                  ].map(({ val, label }) => (
                    <div key={label} style={{ textAlign: "center" }}>
                      <div style={{ fontSize: 14, fontWeight: 700, color: "var(--gm-text)", fontFamily: "'DM Mono', monospace" }}>{val}</div>
                      <div style={{ fontSize: 10, color: "var(--gm-dim)", fontWeight: 500 }}>{label}</div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
