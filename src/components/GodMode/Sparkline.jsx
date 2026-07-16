// 14-day trend behind a stat tile. History in the de-emphasis step, today in the
// accent. Deliberately axis-less and label-less — the tile's value is the number;
// this only carries shape.
export function Sparkline({ data = [], height = 26 }) {
  if (!data.length) return <div style={{ height }} />;

  const max = Math.max(...data, 0);
  const lastIdx = data.length - 1;

  return (
    <div
      style={{ display: "flex", alignItems: "flex-end", gap: 2, height, width: "100%" }}
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
              height: `${pct}%`,
              minHeight: 2,
              borderRadius: "2px 2px 0 0", // rounded data-end, square at the baseline
              background: v === 0
                ? "var(--gm-border)"
                : isToday
                  ? "var(--gm-accent)"
                  : "var(--gm-spark)",
              boxShadow: isToday && v > 0 ? "0 0 8px var(--gm-accent-soft)" : "none",
              transition: "height .2s",
            }}
          />
        );
      })}
    </div>
  );
}
