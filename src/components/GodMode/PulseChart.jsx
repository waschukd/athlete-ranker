import { useState } from "react";

const DAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const fmtDay = d => `${DAY[d.getUTCDay()]} ${d.getUTCDate()} ${d.toLocaleString("en", { month: "short", timeZone: "UTC" })}`;

// Round a max up to a clean axis tick (10 / 20 / 50 / 100 ...).
function niceMax(v) {
  if (v <= 5) return 5;
  const mag = 10 ** Math.floor(Math.log10(v));
  for (const step of [1, 2, 2.5, 5, 10]) {
    const t = step * mag;
    if (t >= v) return t;
  }
  return 10 * mag;
}

// 30-day platform activity. One series, so no legend — the title says what's plotted.
export function PulseChart({ data = [], height = 132 }) {
  const [hover, setHover] = useState(null);

  if (!data.length) return null;

  const peak = Math.max(...data.map(d => d.events), 0);
  const max = niceMax(peak);
  const total = data.reduce((a, d) => a + d.events, 0);

  return (
    <div className="gm-card" style={{ padding: 20 }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 4, gap: 12, flexWrap: "wrap" }}>
        <div className="gm-section-title" style={{ marginBottom: 0 }}>Platform pulse</div>
        <div style={{ fontSize: 11, color: "var(--gm-dim)" }}>
          {total.toLocaleString()} events · last 30 days
        </div>
      </div>
      <div style={{ fontSize: 11, color: "var(--gm-dim)", marginBottom: 16 }}>
        Recorded actions per day across every role
      </div>

      <div style={{ position: "relative", paddingLeft: 30 }}>
        {/* Recessive hairline gridlines, carrying the values we don't directly label */}
        {[max, max / 2, 0].map(t => (
          <div
            key={t}
            style={{
              position: "absolute", left: 0, right: 0,
              bottom: `${(t / max) * height}px`,
              borderTop: "1px solid var(--gm-border)",
              pointerEvents: "none",
            }}
          >
            <span style={{
              position: "absolute", left: 0, top: -7, fontSize: 9,
              color: "var(--gm-dim)", fontVariantNumeric: "tabular-nums",
            }}>
              {t.toLocaleString()}
            </span>
          </div>
        ))}

        <div style={{ display: "flex", alignItems: "flex-end", gap: 2, height, position: "relative" }}>
          {data.map((d, i) => {
            const day = new Date(d.day);
            const pct = max > 0 ? (d.events / max) * 100 : 0;
            const isHover = hover === i;
            return (
              <div
                key={i}
                onMouseEnter={() => setHover(i)}
                onMouseLeave={() => setHover(null)}
                style={{
                  flex: 1, minWidth: 0, height: "100%",
                  display: "flex", alignItems: "flex-end",
                  cursor: "default", position: "relative",
                }}
              >
                <div style={{
                  width: "100%",
                  maxWidth: 24, // cap the mark — let the band's leftover be air
                  margin: "0 auto",
                  height: `${pct}%`,
                  minHeight: 2,
                  borderRadius: "3px 3px 0 0",
                  background: d.events === 0
                    ? "var(--gm-border)"
                    : isHover ? "var(--gm-accent)" : "var(--gm-spark)",
                  transition: "background 0.12s",
                }} />

                {isHover && (
                  <div style={{
                    position: "absolute", bottom: "calc(100% + 8px)", left: "50%",
                    transform: "translateX(-50%)",
                    background: "var(--gm-text)", color: "var(--gm-surface)",
                    padding: "7px 10px", borderRadius: 7, fontSize: 11,
                    whiteSpace: "nowrap", zIndex: 5, pointerEvents: "none",
                    boxShadow: "0 4px 14px rgba(0,0,0,0.18)",
                  }}>
                    <div style={{ fontWeight: 600, marginBottom: 2 }}>{fmtDay(day)}</div>
                    <div style={{ opacity: 0.85 }}>
                      {d.events} event{d.events === 1 ? "" : "s"} · {d.users} user{d.users === 1 ? "" : "s"}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
