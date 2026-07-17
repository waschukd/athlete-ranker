import { useQuery } from "@tanstack/react-query";
import {
  Calendar, TrendingUp, Timer, Hourglass, ClipboardList, Zap,
  Building2, LayoutDashboard, FileText, Users,
} from "lucide-react";
import { StatTile, compact } from "./StatTile";
import { PulseChart } from "./PulseChart";
import { LoadingState } from "./LoadingState";

const avg = (rows, key) => (rows.length ? rows.reduce((a, r) => a + (r[key] || 0), 0) / rows.length : 0);
const money = cents => `$${(cents / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// View -> purchase. "—" rather than 0% when nobody has looked yet: a 0% that
// means "no data" reads as "nobody buys", which is a different and alarming claim.
const conv = (views, sold) => (views > 0 ? `${Math.round((sold / views) * 100)}%` : "—");

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

function eventIcon(e = "") {
  if (e.startsWith("dashboard")) return LayoutDashboard;
  if (e.startsWith("category")) return Building2;
  if (e.startsWith("score") || e.startsWith("session")) return TrendingUp;
  if (e.startsWith("report")) return FileText;
  return Zap;
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
  const providerLedger = data?.providerLedger || [];
  const feeBps = data?.feeBps ?? 2500;
  const totalTax = providerLedger.reduce((a, b) => a + (b.tax_cents || 0), 0);
  const feed = data?.feed || [];

  const col = k => series.map(r => r[k]);
  const maxHours = Math.max(...topOrgs.map(x => x.hours), 1);

  const tiles = [
    { label: "Sessions", value: t.sessions, icon: Calendar, key: "sessions" },
    { label: "Ice time", value: t.hours, unit: "h", icon: Timer, key: "hours" },
    { label: "Testing hours", value: t.testing_hours, unit: "h", icon: Hourglass, key: "testing_hours", tone: "amber" },
    { label: "Scores", value: t.scores, icon: TrendingUp, key: "scores" },
    { label: "Testing scores", value: t.testing_scores, icon: ClipboardList, key: "testing_scores", tone: "amber" },
    { label: "Active users", value: t.active_users, icon: Zap, key: "active_users", tone: "green" },
  ];

  const totals = [
    { label: "Orgs", value: compact(o.total_organizations), sub: `${o.total_associations} associations` },
    { label: "Users", value: compact(o.total_users) },
    { label: "Athletes", value: compact(o.total_athletes) },
    { label: "Sessions", value: compact(o.total_sessions), sub: `${compact(o.total_hours)}h booked` },
    { label: "Testing", value: `${compact(o.total_testing_hours)}h`, sub: `${o.total_testing_sessions} sessions` },
    { label: "Scores", value: compact(o.total_scores), sub: `${compact(o.total_testing_scores)} testing` },
    { label: "Revenue", value: money(o.total_revenue_cents), sub: `${o.total_reports} reports` },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
      {/* ── Today ─────────────────────────────────────────────── */}
      <section>
        <SectionHead
          kicker="Engine status"
          title="Today"
          right={new Date().toLocaleDateString("en", { weekday: "long", month: "long", day: "numeric" })}
        />
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(168px, 1fr))", gap: 12 }}>
          {tiles.map(tile => (
            <StatTile
              key={tile.key}
              label={tile.label}
              value={tile.value || 0}
              unit={tile.unit}
              icon={tile.icon}
              tone={tile.tone}
              trend={col(tile.key)}
              baseline={avg(series, tile.key)}
            />
          ))}
        </div>
      </section>

      {/* ── Pulse ─────────────────────────────────────────────── */}
      <PulseChart data={pulse} />

      {/* ── Leaderboards + feed ───────────────────────────────── */}
      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.55fr) minmax(0, 1fr)", gap: 22, alignItems: "start" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 22, minWidth: 0 }}>
          <div className="gm-card" style={{ padding: 22 }}>
            <SectionHead kicker="Ranked by ice time" title="Top organizations" inline />
            {topOrgs.length === 0 ? (
              <Empty>No organizations yet</Empty>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                {topOrgs.map((org, i) => (
                  <Row key={org.id} rank={i + 1} name={org.name} kind={org.type} meter={org.hours / maxHours}>
                    <Stat val={`${compact(org.hours)}h`} label="Hours" strong />
                    <Stat val={`${compact(org.testing_hours)}h`} label="Testing" />
                    <Stat val={org.session_count} label="Sessions" />
                    <Stat val={org.athlete_count} label="Athletes" />
                  </Row>
                ))}
              </div>
            )}
          </div>

          <div className="gm-card" style={{ padding: 22 }}>
            <SectionHead
              kicker="Owed to providers · remitted off-platform"
              title="Provider payouts"
              right={`${o.total_reports || 0} sold · ${money(o.total_revenue_cents || 0)} gross`}
              inline
            />
            {providerLedger.length === 0 ? (
              <Empty>
                No reports sold yet
                {o.total_reports > 0 && (
                  <div style={{ marginTop: 8, fontSize: 11, color: "var(--gm-amber)", maxWidth: 420, marginInline: "auto", lineHeight: 1.5 }}>
                    {o.total_reports} purchase{o.total_reports === 1 ? "" : "s"} exist but point at a deleted
                    athlete/category and carry no provider, so they can&apos;t be attributed.
                  </div>
                )}
              </Empty>
            ) : (
              <>
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  {providerLedger.map((b, i) => (
                    <Row key={b.id} rank={i + 1} name={b.name} kind={b.type}>
                      <Stat val={conv(b.views, b.reports)} label="Conv." />
                      <Stat val={b.reports} label="Sold" />
                      <Stat val={money(b.gross_cents)} label="Net sales" />
                      <Stat val={money(b.platform_cents)} label="Our cut" />
                      <Stat val={money(b.owed_cents)} label="Owed" strong />
                    </Row>
                  ))}
                </div>
                <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid var(--gm-border)", display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", fontSize: 11, color: "var(--gm-dim)" }}>
                  <span>
                    Sideline Star keeps {(feeBps / 100).toFixed(0)}% · providers paid outside the platform
                    {totalTax > 0 && <> · <span style={{ color: "var(--gm-amber)" }}>{money(totalTax)} GST held for CRA</span></>}
                  </span>
                  <span style={{ color: "var(--gm-accent)", fontWeight: 700 }}>
                    {money(providerLedger.reduce((a, b) => a + b.owed_cents, 0))} owed
                  </span>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Live feed */}
        <div className="gm-card" style={{ padding: 22, minWidth: 0 }}>
          <SectionHead kicker="Most recent first" title="Live activity" inline />
          {feed.length === 0 ? (
            <Empty>Nothing recorded yet</Empty>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
              {feed.map((f, i) => {
                const Icon = eventIcon(f.event);
                const fresh = i === 0;
                return (
                  <div
                    key={f.id}
                    style={{
                      display: "flex", gap: 11, padding: "9px 10px", borderRadius: 9,
                      background: fresh ? "var(--gm-accent-soft)" : "transparent",
                      border: `1px solid ${fresh ? "var(--gm-accent-bd)" : "transparent"}`,
                    }}
                  >
                    <div style={{
                      width: 28, height: 28, borderRadius: 8, flexShrink: 0,
                      display: "flex", alignItems: "center", justifyContent: "center",
                      background: fresh
                        ? "linear-gradient(135deg, var(--gm-accent-hi), var(--gm-accent))"
                        : "var(--gm-surface2)",
                      border: fresh ? "none" : "1px solid var(--gm-border)",
                    }}>
                      <Icon size={13} style={{ color: fresh ? "var(--gm-on-accent)" : "var(--gm-dim)" }} />
                    </div>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{
                        fontSize: 12.5, color: "var(--gm-text)", fontWeight: 500,
                        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                      }}>
                        {prettyEvent(f.event)}
                      </div>
                      <div className="gm-mono" style={{
                        fontSize: 8.5, color: "var(--gm-dim)", marginTop: 3,
                        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                      }}>
                        {f.user_name || "Unknown"}{f.org_name ? ` · ${f.org_name}` : ""} · {relTime(f.ts)}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* ── All-time ──────────────────────────────────────────── */}
      <section>
        <SectionHead kicker="Since launch" title="All-time" />
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(126px, 1fr))", gap: 10 }}>
          {totals.map(m => (
            <div key={m.label} className="gm-card" style={{ padding: "13px 14px" }}>
              <div style={{ fontSize: 19, fontWeight: 800, color: "var(--gm-text)", letterSpacing: "-.02em" }}>{m.value}</div>
              <div className="gm-mono" style={{ fontSize: 8.5, color: "var(--gm-dim)", marginTop: 5 }}>{m.label}</div>
              {m.sub && <div style={{ fontSize: 10.5, color: "var(--gm-muted)", marginTop: 3 }}>{m.sub}</div>}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function SectionHead({ kicker, title, right, inline }) {
  return (
    <div style={{
      display: "flex", alignItems: "flex-end", justifyContent: "space-between",
      gap: 12, flexWrap: "wrap", marginBottom: inline ? 16 : 13,
    }}>
      <div>
        {kicker && <div className="gm-mono" style={{ fontSize: 9, color: "var(--gm-accent)", marginBottom: 4 }}>{kicker}</div>}
        <div style={{ fontSize: inline ? 15 : 17, fontWeight: 700, color: "var(--gm-text)", letterSpacing: "-.01em" }}>{title}</div>
      </div>
      {right && <div style={{ fontSize: 11, color: "var(--gm-dim)" }}>{right}</div>}
    </div>
  );
}

function Empty({ children }) {
  return (
    <div style={{ padding: "30px 0", textAlign: "center", color: "var(--gm-dim)", fontSize: 12 }}>
      {children}
    </div>
  );
}

function Stat({ val, label, strong }) {
  return (
    <div style={{ textAlign: "right", minWidth: 54 }}>
      <div style={{
        fontSize: 13, fontWeight: 700, fontVariantNumeric: "tabular-nums",
        color: strong ? "var(--gm-accent)" : "var(--gm-text)",
      }}>
        {val}
      </div>
      <div className="gm-mono" style={{ fontSize: 8, color: "var(--gm-dim)", marginTop: 2 }}>{label}</div>
    </div>
  );
}

function Row({ rank, name, kind, meter, children }) {
  const first = rank === 1;
  return (
    <div
      style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "11px 12px", borderRadius: 10, gap: 12, position: "relative",
        border: `1px solid ${first ? "var(--gm-accent-bd)" : "transparent"}`,
        background: first ? "var(--gm-accent-soft)" : "transparent",
        overflow: "hidden",
      }}
      onMouseEnter={e => { if (!first) e.currentTarget.style.background = "var(--gm-surface2)"; }}
      onMouseLeave={e => { if (!first) e.currentTarget.style.background = "transparent"; }}
    >
      {/* Share-of-leader meter: a quiet track behind the row, not a second chart. */}
      {meter != null && (
        <div
          aria-hidden="true"
          style={{
            position: "absolute", left: 0, top: 0, bottom: 0,
            width: `${Math.max(meter * 100, 0)}%`,
            background: "var(--gm-accent)", opacity: 0.05, pointerEvents: "none",
          }}
        />
      )}
      <div style={{ display: "flex", alignItems: "center", gap: 12, flex: 1, minWidth: 0, position: "relative" }}>
        <div style={{
          width: 28, height: 28, borderRadius: 8, flexShrink: 0,
          background: first ? "linear-gradient(135deg, var(--gm-accent-hi), var(--gm-accent))" : "var(--gm-surface2)",
          border: first ? "none" : "1px solid var(--gm-border)",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 12, fontWeight: 800,
          color: first ? "var(--gm-on-accent)" : "var(--gm-muted)",
        }}>
          {rank}
        </div>
        <div style={{ minWidth: 0 }}>
          <div style={{ color: "var(--gm-text)", fontSize: 13, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{name}</div>
          <div className="gm-mono" style={{ color: "var(--gm-dim)", fontSize: 8.5, marginTop: 3 }}>{kind?.replace(/_/g, " ")}</div>
        </div>
      </div>
      <div style={{ display: "flex", gap: 18, flexShrink: 0, position: "relative" }}>{children}</div>
    </div>
  );
}
