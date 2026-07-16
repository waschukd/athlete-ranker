import { useQuery } from "@tanstack/react-query";
import {
  Calendar, TrendingUp, Timer, Hourglass, ClipboardList, Zap,
} from "lucide-react";
import { StatTile, compact } from "./StatTile";
import { PulseChart } from "./PulseChart";
import { LoadingState } from "./LoadingState";

const avg = (rows, key) => (rows.length ? rows.reduce((a, r) => a + (r[key] || 0), 0) / rows.length : 0);
const money = cents => `$${(cents / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function relTime(ts) {
  const s = Math.floor((Date.now() - new Date(ts)) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  const d = Math.floor(s / 86400);
  return d === 1 ? "yesterday" : `${d}d ago`;
}

// "dashboard.association.viewed" -> "Association dashboard viewed"
function prettyEvent(e) {
  if (!e) return "";
  const s = e.replace(/[._]/g, " ");
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function OverviewTab() {
  const { data, isLoading } = useQuery({
    queryKey: ["god-mode-analytics"],
    queryFn: async () => {
      const res = await fetch("/api/admin/god-mode/analytics");
      if (!res.ok) throw new Error("Failed to fetch analytics");
      return res.json();
    },
    refetchInterval: 60_000,
  });

  if (isLoading) return <LoadingState text="Fetching system analytics..." />;

  const o = data?.overview || {};
  const t = data?.today || {};
  const series = data?.series || [];
  const pulse = data?.pulse || [];
  const topOrgs = data?.topOrgs || [];
  const topBuyers = data?.topBuyers || [];
  const feed = data?.feed || [];

  const col = k => series.map(r => r[k]);

  const tiles = [
    { label: "Sessions", value: t.sessions, icon: Calendar, key: "sessions" },
    { label: "Hours on ice", value: t.hours, unit: "h", icon: Timer, key: "hours" },
    { label: "Testing hours", value: t.testing_hours, unit: "h", icon: Hourglass, key: "testing_hours" },
    { label: "Scores", value: t.scores, icon: TrendingUp, key: "scores" },
    { label: "Testing scores", value: t.testing_scores, icon: ClipboardList, key: "testing_scores" },
    { label: "Active users", value: t.active_users, icon: Zap, key: "active_users" },
  ];

  const totals = [
    { label: "Organizations", value: compact(o.total_organizations), sub: `${o.total_associations} associations` },
    { label: "Users", value: compact(o.total_users) },
    { label: "Athletes", value: compact(o.total_athletes) },
    { label: "Sessions", value: compact(o.total_sessions), sub: `${compact(o.total_hours)}h scheduled` },
    { label: "Testing", value: `${compact(o.total_testing_hours)}h`, sub: `${o.total_testing_sessions} sessions` },
    { label: "Scores", value: compact(o.total_scores), sub: `${compact(o.total_testing_scores)} testing` },
    { label: "Reports sold", value: compact(o.total_reports), sub: money(o.total_revenue_cents) },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* ── Today ─────────────────────────────────────────────── */}
      <div>
        <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 12 }}>
          <div className="gm-section-title" style={{ marginBottom: 0 }}>Today</div>
          <div style={{ fontSize: 11, color: "var(--gm-dim)" }}>
            {new Date().toLocaleDateString("en", { weekday: "long", month: "long", day: "numeric" })}
            {" · trend = last 14 days"}
          </div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 12 }}>
          {tiles.map(tile => (
            <StatTile
              key={tile.key}
              label={tile.label}
              value={tile.value || 0}
              unit={tile.unit}
              icon={tile.icon}
              trend={col(tile.key)}
              baseline={avg(series, tile.key)}
            />
          ))}
        </div>
      </div>

      {/* ── Pulse ─────────────────────────────────────────────── */}
      <PulseChart data={pulse} />

      {/* ── Leaderboards + feed ───────────────────────────────── */}
      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.6fr) minmax(0, 1fr)", gap: 20, alignItems: "start" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 20, minWidth: 0 }}>
          {/* Top organizations */}
          <div className="gm-card" style={{ padding: 20 }}>
            <div className="gm-section-title">Top organizations by ice time</div>
            {topOrgs.length === 0 ? (
              <Empty>No organizations yet</Empty>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                {topOrgs.map((org, i) => (
                  <Row key={org.id} rank={i + 1} name={org.name} kind={org.type}>
                    <Stat val={`${compact(org.hours)}h`} label="Hours" />
                    <Stat val={`${compact(org.testing_hours)}h`} label="Testing" />
                    <Stat val={org.session_count} label="Sessions" />
                    <Stat val={org.athlete_count} label="Athletes" />
                  </Row>
                ))}
              </div>
            )}
          </div>

          {/* Reports purchased */}
          <div className="gm-card" style={{ padding: 20 }}>
            <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 14, gap: 10 }}>
              <div className="gm-section-title" style={{ marginBottom: 0 }}>Reports purchased</div>
              <div style={{ fontSize: 11, color: "var(--gm-dim)" }}>
                {o.total_reports || 0} all-time · {money(o.total_revenue_cents || 0)}
              </div>
            </div>
            {topBuyers.length === 0 ? (
              <Empty>
                No reports attributed to an organization yet
                {o.total_reports > 0 && (
                  <div style={{ marginTop: 6, fontSize: 11, color: "var(--gm-amber)" }}>
                    {o.total_reports} purchase{o.total_reports === 1 ? "" : "s"} exist but point at a
                    deleted athlete/category, so they can&apos;t be attributed.
                  </div>
                )}
              </Empty>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                {topBuyers.map((b, i) => (
                  <Row key={b.id} rank={i + 1} name={b.name} kind={b.type}>
                    <Stat val={b.reports} label="Reports" />
                    <Stat val={money(b.revenue_cents)} label="Revenue" />
                  </Row>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Live feed */}
        <div className="gm-card" style={{ padding: 20, minWidth: 0 }}>
          <div className="gm-section-title">Live activity</div>
          {feed.length === 0 ? (
            <Empty>Nothing recorded yet</Empty>
          ) : (
            <div style={{ display: "flex", flexDirection: "column" }}>
              {feed.map((f, i) => (
                <div key={f.id} style={{
                  display: "flex", gap: 10, padding: "9px 0",
                  borderTop: i === 0 ? "none" : "1px solid var(--gm-border)",
                }}>
                  <div style={{
                    width: 6, height: 6, borderRadius: "50%", marginTop: 6, flexShrink: 0,
                    background: i === 0 ? "var(--gm-accent)" : "var(--gm-border)",
                  }} />
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{
                      fontSize: 12, color: "var(--gm-text)", fontWeight: 500,
                      overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                    }}>
                      {prettyEvent(f.event)}
                    </div>
                    <div style={{
                      fontSize: 11, color: "var(--gm-dim)", marginTop: 1,
                      overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                    }}>
                      {f.user_name || "Unknown"}
                      {f.org_name ? ` · ${f.org_name}` : ""} · {relTime(f.ts)}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── All-time ──────────────────────────────────────────── */}
      <div className="gm-card" style={{ padding: 20 }}>
        <div className="gm-section-title">All-time</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: 8 }}>
          {totals.map(m => (
            <div key={m.label} style={{ padding: "10px 12px", background: "var(--gm-surface2)", borderRadius: 9 }}>
              <div style={{ fontSize: 20, fontWeight: 700, color: "var(--gm-text)", letterSpacing: "-0.5px" }}>{m.value}</div>
              <div style={{ fontSize: 11, color: "var(--gm-muted)", fontWeight: 500, marginTop: 2 }}>{m.label}</div>
              {m.sub && <div style={{ fontSize: 10, color: "var(--gm-dim)", marginTop: 1 }}>{m.sub}</div>}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function Empty({ children }) {
  return (
    <div style={{ padding: "28px 0", textAlign: "center", color: "var(--gm-dim)", fontSize: 12 }}>
      {children}
    </div>
  );
}

function Stat({ val, label }) {
  return (
    <div style={{ textAlign: "right", minWidth: 52 }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: "var(--gm-text)", fontVariantNumeric: "tabular-nums" }}>{val}</div>
      <div style={{ fontSize: 10, color: "var(--gm-dim)", fontWeight: 500 }}>{label}</div>
    </div>
  );
}

function Row({ rank, name, kind, children }) {
  return (
    <div
      style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "11px 12px", borderRadius: 8, gap: 12 }}
      onMouseEnter={e => (e.currentTarget.style.background = "var(--gm-surface2)")}
      onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 12, flex: 1, minWidth: 0 }}>
        <div style={{
          width: 24, height: 24, borderRadius: 7, flexShrink: 0,
          background: rank === 1 ? "var(--gm-accent-soft)" : "var(--gm-surface2)",
          border: `1px solid ${rank === 1 ? "var(--gm-accent)" : "var(--gm-border)"}`,
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 11, fontWeight: 700,
          color: rank === 1 ? "var(--gm-accent)" : "var(--gm-muted)",
        }}>
          {rank}
        </div>
        <div style={{ minWidth: 0 }}>
          <div style={{ color: "var(--gm-text)", fontSize: 13, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{name}</div>
          <div style={{ color: "var(--gm-dim)", fontSize: 11, marginTop: 1, textTransform: "capitalize" }}>{kind?.replace(/_/g, " ")}</div>
        </div>
      </div>
      <div style={{ display: "flex", gap: 20, flexShrink: 0 }}>{children}</div>
    </div>
  );
}
