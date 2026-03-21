export function StatBadge({ label, value, color = "default" }) {
  const textColor = color === "emerald" ? "var(--gm-green)"
    : color === "accent" ? "var(--gm-accent)"
    : "var(--gm-text)";
  return (
    <div style={{ textAlign: "center" }}>
      <div style={{ fontSize: 16, fontWeight: 700, color: textColor, fontFamily: "'DM Mono', monospace" }}>{value}</div>
      <div style={{ fontSize: 10, color: "var(--gm-dim)", marginTop: 2, fontWeight: 500 }}>{label}</div>
    </div>
  );
}
