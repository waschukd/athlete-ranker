export function LoadingState({ text = "Loading..." }) {
  return (
    <div className="gm-card" style={{ padding: "60px 24px", textAlign: "center" }}>
      <div style={{
        width: 32, height: 32, margin: "0 auto 12px",
        border: "2px solid var(--gm-border)",
        borderTop: "2px solid var(--gm-accent)",
        borderRadius: "50%",
        animation: "spin 0.7s linear infinite"
      }} />
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      <p style={{ color: "var(--gm-muted)", fontSize: 13 }}>{text}</p>
    </div>
  );
}
