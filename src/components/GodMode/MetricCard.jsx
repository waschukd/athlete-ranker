export function MetricCard({ title, value, icon: Icon, color, subtitle }) {
  const colorMap = {
    blue: { icon: "var(--gm-blue)", soft: "var(--gm-blue-soft)" },
    purple: { icon: "var(--gm-purple)", soft: "var(--gm-purple-soft)" },
    emerald: { icon: "var(--gm-green)", soft: "var(--gm-green-soft)" },
    amber: { icon: "var(--gm-amber)", soft: "var(--gm-amber-soft)" },
    rose: { icon: "var(--gm-red)", soft: "var(--gm-red-soft)" },
    indigo: { icon: "var(--gm-purple)", soft: "var(--gm-purple-soft)" },
  };
  const c = colorMap[color] || colorMap.blue;

  return (
    <div className="gm-card" style={{ padding: "20px" }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 16 }}>
        <div style={{
          width: 38, height: 38, borderRadius: 9,
          background: c.soft, display: "flex", alignItems: "center", justifyContent: "center"
        }}>
          <Icon size={18} style={{ color: c.icon }} />
        </div>
      </div>
      <div className="gm-stat-value" style={{ color: "var(--gm-text)" }}>
        {typeof value === "number" ? value.toLocaleString() : value}
      </div>
      <div style={{ color: "var(--gm-muted)", fontSize: 12, marginTop: 4, fontWeight: 500 }}>{title}</div>
      {subtitle && <div style={{ color: "var(--gm-dim)", fontSize: 11, marginTop: 3 }}>{subtitle}</div>}
    </div>
  );
}
