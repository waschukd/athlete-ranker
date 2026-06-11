"use client";

import { useState, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { ArrowLeft, Plus, X, Users } from "lucide-react";
import { useTheme } from "@/lib/useTheme";
import ThemeToggle from "@/components/ThemeToggle";

const ACCENT = "#0b5cd6";

function CompareInner() {
  const searchParams = useSearchParams();
  const catId = searchParams.get("cat");
  const preset = (searchParams.get("athletes") || "").split(",").filter(Boolean);

  const [theme, toggleTheme] = useTheme();
  const [roster, setRoster] = useState([]);
  const [catName, setCatName] = useState("");
  const [scale, setScale] = useState(10);
  // up to 4 slots; null = empty slot
  const [slots, setSlots] = useState(() => {
    const s = preset.slice(0, 4);
    while (s.length < 2) s.push(null);
    return s;
  });
  const [reports, setReports] = useState({}); // athleteId -> data | "loading" | "error"

  // Load the category roster for the pickers.
  useEffect(() => {
    if (!catId) return;
    fetch(`/api/categories/${catId}/athletes`).then(r => r.json()).then(d => setRoster(d.athletes || []));
  }, [catId]);

  // Fetch report data for any filled slot we haven't loaded yet.
  useEffect(() => {
    for (const id of slots) {
      if (id && !reports[id]) {
        setReports(prev => ({ ...prev, [id]: "loading" }));
        fetch(`/api/athletes/${id}/report?cat=${catId}`)
          .then(r => r.json())
          .then(d => {
            if (d?.category?.name) setCatName(d.category.name);
            if (d?.category?.scoring_scale) setScale(d.category.scoring_scale);
            setReports(prev => ({ ...prev, [id]: d?.error ? "error" : d }));
          })
          .catch(() => setReports(prev => ({ ...prev, [id]: "error" })));
      }
    }
  }, [slots, catId]);

  const setSlot = (i, id) => setSlots(prev => prev.map((s, j) => (j === i ? (id || null) : s)));
  const addSlot = () => setSlots(prev => (prev.length < 4 ? [...prev, null] : prev));
  const removeSlot = (i) => setSlots(prev => prev.filter((_, j) => j !== i));

  const filled = slots.map(id => (id && reports[id] && reports[id] !== "loading" && reports[id] !== "error" ? reports[id] : null));

  // Canonical row order from the first loaded player (skills + tests are shared within a category).
  const firstData = filled.find(Boolean);
  const skillNames = firstData?.skillProfile?.map(s => s.name) || [];
  const testNames = firstData?.testingProfile?.map(t => t.test_name) || [];

  const rows = [
    { section: "Standing" },
    { label: "Overall rank", get: d => d.ranking?.rank, fmt: v => (v != null ? `#${v}` : "—"), better: "min", num: v => v },
    { label: "Percentile", get: d => d.standing?.percentile, fmt: v => (v != null ? `${v}th` : "—"), better: "max", num: v => v },
    { label: "Tier", get: d => d.standing?.tier, fmt: v => v || "—", better: null },
    ...(skillNames.length ? [{ section: "Skill profile" }] : []),
    ...skillNames.map(name => ({
      label: name, get: d => d.skillProfile?.find(s => s.name === name)?.player,
      fmt: v => (v != null ? v.toFixed(1) : "—"), better: "max", num: v => v,
    })),
    ...(testNames.length ? [{ section: "Objective testing (seconds, lower is better)" }] : []),
    ...testNames.map(name => ({
      label: name, get: d => d.testingProfile?.find(t => t.test_name === name)?.player_best,
      fmt: v => (v != null ? v.toFixed(2) : "—"), better: "min", num: v => v,
    })),
  ];

  const bestIndex = (row) => {
    if (!row.better) return -1;
    let best = -1, bestVal = null;
    filled.forEach((d, i) => {
      if (!d) return;
      const v = row.num ? row.num(row.get(d)) : null;
      if (v == null || isNaN(v)) return;
      if (bestVal == null || (row.better === "min" ? v < bestVal : v > bestVal)) { bestVal = v; best = i; }
    });
    return best;
  };

  const cols = slots.length;

  return (
    <div className="min-h-screen bg-gray-50" data-theme={theme}>
      <div className="bg-white border-b border-gray-200 shadow-sm">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-5 flex items-center justify-between flex-wrap gap-3">
          <div>
            <button onClick={() => window.history.back()} className="inline-flex items-center gap-1.5 font-display text-xs font-bold tracking-[0.2em] uppercase text-accent hover:opacity-70 mb-1">
              <ArrowLeft size={13} /> {catName || "Category"} · Compare
            </button>
            <h1 className="font-display font-black tracking-tight text-ink text-3xl sm:text-4xl leading-none flex items-center gap-3">
              <Users size={28} className="text-accent" /> Compare Players
            </h1>
          </div>
          <ThemeToggle theme={theme} onToggle={toggleTheme} />
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
        <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="text-left p-3 w-44 text-xs font-semibold text-gray-400 uppercase tracking-wide align-bottom">Metric</th>
                {slots.map((id, i) => (
                  <th key={i} className="p-3 align-bottom border-l border-gray-100" style={{ minWidth: 150 }}>
                    <div className="flex items-center gap-1">
                      <select
                        value={id || ""}
                        onChange={(e) => setSlot(i, e.target.value)}
                        className="flex-1 min-w-0 text-sm font-semibold text-gray-900 bg-gray-50 border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:border-accent"
                      >
                        <option value="">Select player…</option>
                        {roster.map(a => (
                          <option key={a.id} value={a.id}>{a.last_name}, {a.first_name}</option>
                        ))}
                      </select>
                      {cols > 1 && (
                        <button onClick={() => removeSlot(i)} className="text-gray-300 hover:text-red-500 p-1" title="Remove">
                          <X size={14} />
                        </button>
                      )}
                    </div>
                    {id && reports[id] === "loading" && <div className="text-xs text-gray-400 mt-1">Loading…</div>}
                    {id && reports[id] === "error" && <div className="text-xs text-red-500 mt-1">Failed to load</div>}
                  </th>
                ))}
                {cols < 4 && (
                  <th className="p-3 align-bottom border-l border-gray-100">
                    <button onClick={addSlot} className="inline-flex items-center gap-1 text-sm font-semibold text-accent hover:opacity-70">
                      <Plus size={15} /> Add
                    </button>
                  </th>
                )}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, ri) => {
                if (row.section) {
                  return (
                    <tr key={ri} className="bg-gray-50">
                      <td colSpan={cols + 1 + (cols < 4 ? 1 : 0)} className="px-3 py-2 text-xs font-bold text-gray-500 uppercase tracking-wide">{row.section}</td>
                    </tr>
                  );
                }
                const bi = bestIndex(row);
                return (
                  <tr key={ri} className="border-t border-gray-50">
                    <td className="px-3 py-2.5 text-gray-600 font-medium">{row.label}</td>
                    {slots.map((id, i) => {
                      const d = filled[i];
                      const raw = d ? row.get(d) : null;
                      const isBest = bi === i && filled.filter(Boolean).length > 1;
                      return (
                        <td key={i} className={`px-3 py-2.5 text-center border-l border-gray-50 ${isBest ? "bg-green-50" : ""}`}>
                          <span className={`font-semibold ${isBest ? "text-green-700" : d ? "text-gray-900" : "text-gray-300"}`}>
                            {d ? row.fmt(raw) : "—"}
                          </span>
                        </td>
                      );
                    })}
                    {cols < 4 && <td className="border-l border-gray-50" />}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-gray-400 mt-3">Green = best of the selected players for that metric. Add up to 4. Higher is better for skills; lower (faster) is better for testing times and rank.</p>
      </div>
    </div>
  );
}

export default function ComparePage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-gray-50 flex items-center justify-center" data-theme="premium-light"><div className="animate-spin rounded-full h-10 w-10 border-b-2 border-[#0b5cd6]" /></div>}>
      <CompareInner />
    </Suspense>
  );
}
