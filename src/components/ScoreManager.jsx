"use client";
import { useState } from "react";

export default function ScoreManager({ catId, sessionNumber }) {
  const [open, setOpen] = useState(false);
  const [scores, setScores] = useState([]);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState("");

  const load = async () => {
    setLoading(true);
    const res = await fetch(`/api/categories/${catId}/scores?session=${sessionNumber}`);
    const data = await res.json();
    setScores(data.scores || []);
    setLoading(false);
  };

  const clearEvaluator = async (evaluatorId, name) => {
    if (!confirm(`Delete all scores by ${name} for Session ${sessionNumber}?`)) return;
    const res = await fetch(`/api/categories/${catId}/scores?session=${sessionNumber}&evaluator=${evaluatorId}`, { method: "DELETE" });
    const data = await res.json();
    setMsg(`Deleted ${data.deleted} scores`);
    load();
  };

  const clearAll = async () => {
    if (!confirm(`Delete ALL scores for Session ${sessionNumber}?`)) return;
    const res = await fetch(`/api/categories/${catId}/scores?session=${sessionNumber}`, { method: "DELETE" });
    const data = await res.json();
    setMsg(`Cleared ${data.deleted} scores`);
    setScores([]);
  };

  return (
    <div className="mt-3 pt-3 border-t border-gray-100" onClick={e => e.stopPropagation()}>
      <div className="flex items-center justify-between">
        <span className="text-xs text-gray-400">{scores.length > 0 ? `${scores.length} evaluator(s) scored` : "No scores yet"}</span>
        <button onClick={async (e) => { e.stopPropagation(); if (!open) await load(); setOpen(!open); setMsg(""); }}
          className="text-xs px-2 py-1 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg">Manage Scores</button>
      </div>
      {open && (
        <div className="mt-2 bg-gray-50 rounded-xl p-3 space-y-2">
          {msg && <div className="text-xs text-green-600 font-medium">{msg}</div>}
          {loading ? <div className="text-xs text-gray-400">Loading...</div> : scores.length === 0 ? <div className="text-xs text-gray-400">No scores</div> : (
            <>
              {scores.map(s => (
                <div key={s.evaluator_id} className="flex items-center justify-between bg-white rounded-lg px-3 py-2">
                  <div><div className="text-xs font-medium text-gray-900">{s.evaluator_name}</div><div className="text-xs text-gray-400">{s.athletes_scored} players</div></div>
                  <button onClick={() => clearEvaluator(s.evaluator_id, s.evaluator_name)} className="text-xs px-2 py-1 bg-red-50 text-red-500 rounded-lg hover:bg-red-100">Delete</button>
                </div>
              ))}
              <button onClick={clearAll} className="w-full text-xs py-1.5 bg-red-100 text-red-600 rounded-lg hover:bg-red-200 font-medium">Clear All Scores for Session {sessionNumber}</button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
