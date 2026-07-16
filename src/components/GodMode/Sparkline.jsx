// 14-day trend behind a stat tile. History in the de-emphasis hue, today in the
// accent. Deliberately axis-less and label-less — the tile's value is the number;
// this only carries shape.
export function Sparkline({ data = [], height = 28 }) {
  if (!data.length) return <div style={{ height }} />;

  const max = Math.max(...data, 0);
  const gap = 2; // surface gap — the spacer, never a stroke
  const lastIdx = data.length - 1;

  return (
    <div
      style={{ display: "flex", alignItems: "flex-end", gap, height, width: "100%" }}
      aria-hidden="true"
    >
      {data.map((v, i) => {
        // An all-zero window still draws a baseline row of stubs, so a quiet day
        // reads as "nothing happened" rather than a broken/empty chart.
        const pct = max > 0 ? (v / max) * 100 : 0;
        const isToday = i === lastIdx;
        return (
          <div
            key={i}
            style={{
              flex: 1,
              minWidth: 0,
              height: `${Math.max(pct, 0)}%`,
              minHeight: 2,
              borderRadius: "2px 2px 0 0", // rounded data-end, square at baseline
              background: v === 0
                ? "var(--gm-border)"
                : isToday
                  ? "var(--gm-accent)"
                  : "var(--gm-spark)",
              transition: "height 0.2s",
            }}
          />
        );
      })}
    </div>
  );
}
