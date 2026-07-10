"use client";

import { useState } from "react";
import { Calendar, X } from "lucide-react";

// Reusable "Subscribe" button + modal for any schedule. Given a link endpoint
// that returns { httpsUrl, webcalUrl, googleUrl }, it offers one-tap Add to
// Google / Apple and a copy-paste URL. Used across the SP, association,
// director, evaluator, and tester schedules for a uniform calendar experience.
//
// Props: linkEndpoint (string), label? (button text), title?, blurb?
export default function SubscribeCalendar({ linkEndpoint, label = "Subscribe", title = "Add to your calendar", blurb = "Subscribe once and these sessions show up in Google, Apple, or Outlook — and stay in sync as the schedule changes." }) {
  const [open, setOpen] = useState(false);
  const [links, setLinks] = useState(null);
  const [copied, setCopied] = useState(false);

  const openIt = async () => {
    setOpen(true);
    if (!links) {
      try { const r = await fetch(linkEndpoint); if (r.ok) setLinks(await r.json()); else setLinks({ error: true }); }
      catch { setLinks({ error: true }); }
    }
  };

  return (
    <>
      <button onClick={openIt} className="text-xs px-3 py-1.5 rounded-lg border font-medium bg-white text-gray-600 border-gray-200 inline-flex items-center gap-1 hover:bg-gray-50">
        <Calendar size={12} /> {label}
      </button>
      {open && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-start justify-center p-4 overflow-y-auto" onClick={(e) => e.target === e.currentTarget && setOpen(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg p-6 mt-16" data-theme="">
            <div className="flex items-start justify-between mb-1">
              <h3 className="font-display font-extrabold tracking-tight text-ink text-lg leading-tight">{title}</h3>
              <button onClick={() => setOpen(false)} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
            </div>
            <p className="text-xs text-gray-400 mb-4">{blurb}</p>
            {!links ? (
              <div className="py-6 text-center text-sm text-gray-400">Generating your calendar link…</div>
            ) : links.error ? (
              <div className="py-6 text-center text-sm text-red-500">Couldn't generate a calendar link. Try again in a moment.</div>
            ) : (
              <div className="space-y-3">
                <a href={links.googleUrl} target="_blank" rel="noopener noreferrer" className="w-full inline-flex items-center justify-center gap-2 py-2.5 bg-gradient-to-r from-[#0b5cd6] to-[#3b82f6] text-white rounded-lg text-sm font-semibold hover:shadow-md">
                  <Calendar size={15} /> Add to Google Calendar
                </a>
                <a href={links.webcalUrl} className="w-full inline-flex items-center justify-center gap-2 py-2.5 border border-gray-300 text-ink rounded-lg text-sm font-semibold hover:bg-gray-50">
                  Add to Apple Calendar
                </a>
                <div>
                  <label className="text-xs font-medium text-gray-500 mb-1 block">Or paste this URL into any calendar app (“From URL” / “Subscribe”)</label>
                  <div className="flex items-center gap-2">
                    <input readOnly value={links.httpsUrl} className="flex-1 text-[11px] bg-gray-50 border border-gray-200 rounded px-2 py-1.5 text-gray-700 font-mono" />
                    <button onClick={() => { navigator.clipboard.writeText(links.httpsUrl); setCopied(true); setTimeout(() => setCopied(false), 1500); }} className="px-2.5 py-1.5 bg-accent text-white rounded text-xs font-semibold hover:opacity-90">{copied ? "Copied" : "Copy"}</button>
                  </div>
                </div>
                <p className="text-[11px] text-gray-400">Keep this link private — anyone with it can see the schedule. Google refreshes subscribed calendars roughly every few hours.</p>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
