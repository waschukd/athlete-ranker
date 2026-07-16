import { Sparkline } from "./Sparkline";

// 1,284 / 12.9K / 4.2M — big numbers stay readable without wrapping.
export function compact(n) {
  if (n == null) return "0";
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  if (abs >= 10_000) return `${(n / 1_000).toFixed(1).replace(/\.0$/, "")}K`;
  return n.toLocaleString(undefined, { maximumFractionDigits: 1 });
}

// label · value · delta (vs a named period) · trend. Delta is suppressed when the
// baseline is zero — "+0% vs nothing" is noise, not signal.
export function StatTile({ label, value, unit, icon: Icon, trend = [], baseline, invertDelta = false }) {
  const showDelta = baseline > 0 && value !== baseline;
  const deltaPct = showDelta ? Math.round(((value - baseline) / baseline) * 100) : 0;
  const up = deltaPct > 0;
  const good = invertDelta ? !up : up;

  return (
    <div className="gm-card" style={{ padding: "16px 16px 14px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 10 }}>
        {Icon && <Icon size={14} style={{ color: "var(--gm-dim)", flexShrink: 0 }} />}
        <div style={{ color: "var(--gm-muted)", fontSize: 12, fontWeight: 500 }}>{label}</div>
      </div>

      <div style={{ display: "flex", alignItems: "baseline", gap: 4, marginBottom: 2 }}>
        {/* Proportional figures — tabular-nums is for columns, not display numbers. */}
        <div style={{ fontSize: 28, fontWeight: 700, letterSpacing: "-0.9px", color: "var(--gm-text)", lineHeight: 1.05 }}>
          {compact(value)}
        </div>
        {unit && <div style={{ fontSize: 13, fontWeight: 500, color: "var(--gm-dim)" }}>{unit}</div>}
      </div>

      <div style={{ height: 16, marginBottom: 8 }}>
        {showDelta ? (
          <span style={{ fontSize: 11, fontWeight: 500, color: good ? "var(--gm-green)" : "var(--gm-red)" }}>
            {up ? "▲" : "▼"} {Math.abs(deltaPct)}%
            <span style={{ color: "var(--gm-dim)", fontWeight: 400 }}> vs 14-day avg</span>
          </span>
        ) : (
          <span style={{ fontSize: 11, color: "var(--gm-dim)" }}>
            {value === 0 ? "Nothing today" : " "}
          </span>
        )}
      </div>

      <Sparkline data={trend} />
    </div>
  );
}
