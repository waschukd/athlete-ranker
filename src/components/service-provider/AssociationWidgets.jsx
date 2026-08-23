"use client";

import { useState } from "react";

// Per-association colour picker for the SP master schedule. Presets match the
// built-in palette; a custom hex or "Auto" (clear) are also available.
export function AssocColorPicker({ assoc, spId, onSaved }) {
  const [open, setOpen] = useState(false);
  const PRESETS = ["#2563eb", "#dc2626", "#16a34a", "#ea580c", "#9333ea", "#ca8a04", "#0891b2", "#db2777", "#65a30d", "#7c3aed"];
  const current = assoc.schedule_color || null;
  const save = async (color) => {
    await fetch(`/api/service-provider/associations${spId ? `?org=${spId}` : ""}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "set_schedule_color", association_id: assoc.id, color }),
    });
    setOpen(false); onSaved?.();
  };
  return (
    <div className="relative flex-shrink-0">
      <button onClick={() => setOpen(o => !o)} title="Schedule colour" className="w-6 h-6 rounded-full border-2 border-white shadow ring-1 ring-gray-200" style={current ? { background: current } : { background: "conic-gradient(#ef4444,#eab308,#22c55e,#3b82f6,#a855f7,#ef4444)" }} />
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-20 mt-1 w-44 bg-white border border-gray-200 rounded-xl shadow-lg p-3">
            <div className="text-[11px] font-semibold text-gray-500 mb-2">Schedule colour</div>
            <div className="grid grid-cols-5 gap-1.5 mb-2">
              {PRESETS.map(c => (
                <button key={c} onClick={() => save(c)} title={c} className={`w-6 h-6 rounded-full ${current === c ? "ring-2 ring-offset-1 ring-gray-800" : ""}`} style={{ background: c }} />
              ))}
            </div>
            <div className="flex items-center justify-between gap-2 pt-1">
              <label className="inline-flex items-center gap-1.5 text-xs text-gray-600 cursor-pointer">
                <input type="color" value={current || "#2563eb"} onChange={e => save(e.target.value)} className="w-7 h-7 p-0 border border-gray-200 rounded cursor-pointer" /> Custom
              </label>
              <button onClick={() => save(null)} className="text-xs text-gray-500 hover:text-gray-700 underline">Auto</button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export function JoinCodesPanel({ orgId, data, refetch }) {
  const [generating, setGenerating] = useState(false);
  const [copied, setCopied] = useState(null);
  const codes = data?.codes || [];
  const activeCodes = codes.filter(c => c.uses < c.max_uses);
  const generateCode = async () => {
    setGenerating(true);
    await fetch(`/api/organizations/${orgId}/join-codes`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "generate", max_uses: 100 }) });
    await refetch();
    setGenerating(false);
  };
  const copySignupLink = (code) => {
    navigator.clipboard.writeText(`${window.location.origin}/evaluator/signup?code=${code}`);
    setCopied(code);
    setTimeout(() => setCopied(null), 2000);
  };
  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
      <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
        <div>
          <h3 className="text-sm font-semibold text-gray-900">Evaluator Join Codes</h3>
          <p className="text-xs text-gray-400 mt-0.5">Share with evaluators so they can join</p>
        </div>
        <button onClick={generateCode} disabled={generating} className="inline-flex items-center gap-1.5 px-4 py-2 bg-gradient-to-r from-[#0b5cd6] to-[#3b82f6] text-white rounded-lg text-sm font-semibold disabled:opacity-50">
          {generating ? "Generating..." : "+ Generate Code"}
        </button>
      </div>
      {activeCodes.length === 0 ? (
        <div className="py-8 text-center text-gray-400 text-sm">No active codes. Generate one to start recruiting evaluators.</div>
      ) : (
        <div className="divide-y divide-gray-100">
          {activeCodes.map(code => (
            <div key={code.id} className="flex items-center justify-between px-5 py-3">
              <div className="flex items-center gap-3">
                <span className="font-mono text-lg font-bold text-gray-900 tracking-widest bg-gray-50 px-3 py-1 rounded-lg border border-gray-200">{code.code}</span>
                <div className="text-xs text-gray-400">{code.uses} / {code.max_uses} uses</div>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => copySignupLink(code.code)} className={`text-xs px-3 py-1.5 rounded-lg border font-medium transition-all ${copied === code.code ? "bg-green-100 text-green-700 border-green-200" : "bg-white text-gray-600 border-gray-200"}`}>
                  {copied === code.code ? "Copied!" : "Copy Signup Link"}
                </button>
                <button onClick={async () => { if (confirm("Deactivate this code?")) { await fetch(`/api/organizations/${orgId}/join-codes`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "deactivate", code_id: code.id }) }); refetch(); } }} className="text-xs px-3 py-1.5 border border-red-100 text-red-400 rounded-lg hover:bg-red-50">Deactivate</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
