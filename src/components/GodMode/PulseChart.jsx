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

// 30-day platform activity. One series, so no legend — the title says what's
// plotted. Bars carry a single hue with today emphasised; colour never encodes
// rank or height, so the shape is the only thing making a claim.
export function PulseChart({ data = [], height = 150 }) {
  const [hover, setHover] = useState(null);

  if (!data.length) return null;

  const peak = Math.max(...data.map(d => d.events), 0);
  const max = niceMax(peak);
  const total = data.reduce((a, d) => a + d.events, 0);
  const lastIdx = data.length - 1;

  return (
    <div className="gm-card" style={{ padding: 22, position: "relative", overflow: "hidden" }}>
      {/* Gold rail — the one piece of pure decoration, and it sits on the card
          edge where it can't be mistaken for data. */}
      <div
        aria-hidden="true"
        style={{
          position: "absolute", top: 0, left: 0, right: 0, height: 2,
          background: "linear-gradient(90deg, var(--gm-accent-hi), var(--gm-accent), transparent)",
        }}
      />

      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 20, gap: 12, flexWrap: "wrap" }}>
        <div>
          <div className="gm-section-title" style={{ marginBottom: 3 }}>Platform pulse</div>
          <div className="gm-mono" style={{ fontSize: 9, color: "var(--gm-dim)" }}>
            Recorded actions per day · all roles
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ fontSize: 11, color: "var(--gm-dim)" }}>
            {total.toLocaleString()} events · 30 days
          </span>
          <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
            <span className="gm-live-dot" style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--gm-green)" }} />
            <span className="gm-mono" style={{ fontSize: 9, color: "var(--gm-green)" }}>Live</span>
          </span>
        </div>
      </div>

      <div style={{ position: "relative", paddingLeft: 32 }}>
        {/* Recessive hairline gridlines, carrying the values we don't label */}
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
            <span
              className="gm-mono"
              style={{
                position: "absolute", left: 0, top: -6, fontSize: 8,
                color: "var(--gm-dim)", fontVariantNumeric: "tabular-nums", letterSpacing: ".05em",
              }}
            >
              {t.toLocaleString()}
            </span>
          </div>
        ))}

        <div style={{ display: "flex", alignItems: "flex-end", gap: 2, height, position: "relative" }}>
          {data.map((d, i) => {
            const day = new Date(d.day);
            const pct = max > 0 ? (d.events / max) * 100 : 0;
            const isHover = hover === i;
            const isToday = i === lastIdx;
            const fill = d.events === 0
              ? "var(--gm-border)"
              : isHover || isToday ? "var(--gm-accent)" : "var(--gm-spark)";
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
                  maxWidth: 24, // cap the mark — the band's leftover is air
                  margin: "0 auto",
                  height: `${pct}%`,
                  minHeight: 2,
                  borderRadius: "3px 3px 0 0",
                  background: fill,
                  boxShadow: (isToday || isHover) && d.events > 0 ? "0 -4px 14px var(--gm-accent-soft)" : "none",
                  transition: "background .12s",
                }} />

                {isHover && (
                  <div style={{
                    position: "absolute", bottom: "calc(100% + 8px)", left: "50%",
                    transform: "translateX(-50%)",
                    background: "var(--gm-surface3)",
                    border: "1px solid var(--gm-accent-bd)",
                    color: "var(--gm-text)",
                    padding: "7px 10px", borderRadius: 8, fontSize: 11,
                    whiteSpace: "nowrap", zIndex: 5, pointerEvents: "none",
                    boxShadow: "0 8px 22px rgba(0,0,0,.4)",
                  }}>
                    <div style={{ fontWeight: 700, marginBottom: 2 }}>{fmtDay(day)}</div>
                    <div style={{ color: "var(--gm-muted)" }}>
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
