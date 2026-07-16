import { Sparkline } from "./Sparkline";

// 1,284 / 12.9K / 4.2M — big numbers stay readable without wrapping.
export function compact(n) {
  if (n == null) return "0";
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  if (abs >= 10_000) return `${(n / 1_000).toFixed(1).replace(/\.0$/, "")}K`;
  return n.toLocaleString(undefined, { maximumFractionDigits: 1 });
}

// label · value · delta (vs a named period) · trend.
// Delta is suppressed when the baseline is zero — "+0% vs nothing" is noise.
export function StatTile({ label, value, unit, icon: Icon, trend = [], baseline, tone = "accent" }) {
  const showDelta = baseline > 0 && value !== baseline;
  const deltaPct = showDelta ? Math.round(((value - baseline) / baseline) * 100) : 0;
  const up = deltaPct > 0;

  const toneColor = {
    accent: "var(--gm-accent)",
    green: "var(--gm-green)",
    amber: "var(--gm-amber)",
    red: "var(--gm-red)",
  }[tone] || "var(--gm-accent)";

  return (
    <div className="gm-card" style={{ padding: 18, position: "relative", overflow: "hidden" }}>
      {/* Corner glow — decoration only, sits under the content and never
          overlaps a number. */}
      <div
        aria-hidden="true"
        style={{
          position: "absolute", top: -34, right: -34, width: 96, height: 96,
          borderRadius: "50%", background: toneColor, opacity: 0.06, pointerEvents: "none",
        }}
      />

      <div style={{ position: "relative", zIndex: 1 }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8, marginBottom: 14 }}>
          <div style={{
            width: 32, height: 32, borderRadius: 9, flexShrink: 0,
            background: "var(--gm-accent-soft)",
            border: "1px solid var(--gm-accent-bd)",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            {Icon && <Icon size={15} style={{ color: toneColor }} />}
          </div>

          {showDelta && (
            <span
              className="gm-mono"
              style={{
                fontSize: 10, padding: "3px 7px", borderRadius: 6,
                color: up ? "var(--gm-green)" : "var(--gm-red)",
                background: up ? "var(--gm-green-soft)" : "var(--gm-red-soft)",
                whiteSpace: "nowrap",
              }}
            >
              {up ? "▲" : "▼"} {Math.abs(deltaPct)}%
            </span>
          )}
        </div>

        <div style={{ display: "flex", alignItems: "baseline", gap: 3 }}>
          <div className="gm-stat-value" style={{ color: "var(--gm-text)" }}>{compact(value)}</div>
          {unit && (
            <span style={{ fontSize: 15, fontWeight: 600, color: "var(--gm-accent)", opacity: 0.7 }}>{unit}</span>
          )}
        </div>

        <div className="gm-mono" style={{ fontSize: 9, color: "var(--gm-dim)", marginTop: 5 }}>{label}</div>

        <div style={{ height: 14, marginTop: 6, marginBottom: 8 }}>
          <span style={{ fontSize: 10, color: "var(--gm-dim)" }}>
            {showDelta ? "vs 14-day avg" : value === 0 ? "Nothing today" : " "}
          </span>
        </div>

        <Sparkline data={trend} />
      </div>
    </div>
  );
}
