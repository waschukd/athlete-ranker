"use client";

// Plain rank numbers — no medals/circles. Leader (#1) gets the ice-blue accent to
// match the highlighted row; everyone else is a quiet grey numeral. Tied ranks get a
// subtle asterisk.
export default function RankBadge({ rank, tied }) {
  return (
    <span
      className={`font-display font-extrabold tabular-nums text-lg leading-none ${rank === 1 ? "text-accent" : "text-gray-400"}`}
      title={tied ? "Tied" : undefined}
    >
      {rank}
      {tied && <span className="text-gray-300 font-semibold">*</span>}
    </span>
  );
}
