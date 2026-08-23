"use client";

import { useState } from "react";

// The SP's own logo — shown top-right on every report for their athletes.
// Stored on the org (transparent PNG/SVG renders white on the dark report cover).
export default function SpLogoControl({ sp, onChange }) {
  const [busy, setBusy] = useState(false);
  if (!sp?.id) return null;
  const upload = async (e) => {
    const file = e.target.files?.[0]; if (!file) return;
    setBusy(true);
    const fd = new FormData(); fd.append("logo", file);
    await fetch(`/api/organizations/${sp.id}/logo`, { method: "POST", body: fd });
    setBusy(false); onChange?.();
  };
  const remove = async () => { setBusy(true); await fetch(`/api/organizations/${sp.id}/logo`, { method: "DELETE" }); setBusy(false); onChange?.(); };
  return (
    <div className="mt-4 flex items-center gap-3 flex-wrap">
      {sp.logo_url ? (
        <>
          <div className="h-11 w-28 rounded-lg border border-gray-200 flex items-center justify-center px-2" style={{ background: "#fff" }} title="Preview as it appears on reports">
            <img src={sp.logo_url} alt="Report logo" style={{ maxHeight: "34px", maxWidth: "100px", objectFit: "contain" }} />
          </div>
          <label className="text-xs text-accent hover:underline cursor-pointer font-medium">{busy ? "Saving…" : "Replace report logo"}<input type="file" accept="image/png,image/svg+xml,image/webp" className="hidden" onChange={upload} disabled={busy} /></label>
          <button onClick={remove} disabled={busy} className="text-xs text-gray-400 hover:text-red-500">Remove</button>
        </>
      ) : (
        <label className="inline-flex items-center gap-1.5 text-xs px-3 py-2 border border-dashed border-gray-300 text-gray-600 rounded-lg cursor-pointer hover:border-accent hover:text-accent font-medium">
          {busy ? "Saving…" : "+ Add report logo"}<span className="text-gray-400">(transparent PNG)</span>
          <input type="file" accept="image/png,image/svg+xml,image/webp" className="hidden" onChange={upload} disabled={busy} />
        </label>
      )}
    </div>
  );
}
