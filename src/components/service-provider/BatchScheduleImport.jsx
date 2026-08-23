"use client";

import { useState } from "react";
import { X, Upload } from "lucide-react";
import SmartScheduleImport from "@/components/SmartScheduleImport";

// Batch schedule import for the master schedule: pick an association/category,
// then drop the ice schedule file. Reuses SmartScheduleImport (same bulk endpoint
// the association setup uses) so re-uploading corrected rows updates in place.
export default function BatchScheduleImport({ categories, org, onSaved }) {
  const [open, setOpen] = useState(false);
  const [catId, setCatId] = useState("");
  const [cat, setCat] = useState(null);       // { category, sessions } from setup
  const [loading, setLoading] = useState(false);

  const picked = categories.find(c => String(c.age_category_id) === String(catId));

  const pick = async (id) => {
    setCatId(id);
    setCat(null);
    if (!id) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/categories/${id}/setup`);
      const d = await res.json();
      setCat({ sessions: d.sessions || [] });
    } catch { setCat({ sessions: [] }); }
    setLoading(false);
  };

  const close = () => { setOpen(false); setCatId(""); setCat(null); };

  return (
    <>
      <button onClick={() => setOpen(true)} className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-gray-300 text-ink bg-white rounded-lg text-xs font-semibold hover:bg-gray-50">
        <Upload size={13} /> Import schedule
      </button>
      {open && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-start justify-center p-4 overflow-y-auto" onClick={(e) => e.target === e.currentTarget && close()}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl p-6 mt-10 mb-10">
            <div className="flex items-start justify-between mb-1">
              <h3 className="font-display font-extrabold tracking-tight text-ink text-lg leading-tight">Import a schedule</h3>
              <button onClick={close} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
            </div>
            <p className="text-xs text-gray-400 mb-4">Pick the association &amp; category, then drop the ice-schedule file. Existing sessions with the same session/group update in place — re-upload a corrected file to redo the whole schedule.</p>

            <label className="text-xs font-medium text-gray-500 mb-1 block">Association · Category</label>
            <select value={catId} onChange={(e) => pick(e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-accent/30 mb-4">
              <option value="">Choose…</option>
              {categories.map(c => <option key={c.age_category_id} value={c.age_category_id}>{c.org_name} · {c.category_name}</option>)}
            </select>

            {loading && <div className="py-8 text-center text-sm text-gray-400">Loading category…</div>}
            {picked && cat && !loading && (
              <SmartScheduleImport
                catId={picked.age_category_id}
                categoryName={picked.category_name}
                sessions={cat.sessions}
                org={org || undefined}
                onImported={() => { onSaved(); }}
              />
            )}
          </div>
        </div>
      )}
    </>
  );
}
