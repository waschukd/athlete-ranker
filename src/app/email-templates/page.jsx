"use client";

import { useState, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { ArrowLeft, Mail, Save } from "lucide-react";
import { useTheme } from "@/lib/useTheme";
import ThemeToggle from "@/components/ThemeToggle";

const FIELDS = ["player_name", "org_name", "category_name", "sp_name"];
const DEFAULT_BODY =
`Hi! Welcome to {{org_name}} evaluations for {{category_name}}.

Here's how the process works: your skater will be evaluated over several sessions. {{player_name}}'s first ice time is below, and all following times are emailed after each session once every group has finished.

We're excited to have {{player_name}} take part. See you at the rink!`;

function TemplatesInner() {
  const searchParams = useSearchParams();
  const orgId = searchParams.get("org");
  const [theme, toggleTheme] = useTheme();
  const [subject, setSubject] = useState("Welcome to {{org_name}} Evaluations");
  const [body, setBody] = useState(DEFAULT_BODY);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    if (!orgId) return;
    fetch(`/api/email-templates?org=${orgId}&key=welcome`).then(r => r.json()).then(d => {
      if (d.error) setErr(d.error);
      else if (d.template) { if (d.template.subject) setSubject(d.template.subject); if (d.template.body_html) setBody(d.template.body_html); }
      setLoaded(true);
    });
  }, [orgId]);

  const save = async () => {
    setSaving(true); setSaved(false); setErr("");
    const res = await fetch("/api/email-templates", {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ organization_id: Number(orgId), key: "welcome", subject, body_html: body }),
    });
    const d = await res.json();
    if (d.error) setErr(d.error); else setSaved(true);
    setSaving(false);
  };

  const sample = { player_name: "Timmy", org_name: "Riverside Minor Hockey", category_name: "U13 AA", sp_name: "Competitive Thread" };
  const preview = (str) => (str || "").replace(/\{\{\s*(\w+)\s*\}\}/g, (_, k) => sample[k] ?? `{{${k}}}`);

  return (
    <div className="min-h-screen bg-gray-50" data-theme={theme}>
      <div className="bg-white border-b border-gray-200 shadow-sm">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-5 flex items-center justify-between flex-wrap gap-3">
          <div>
            <button onClick={() => window.history.back()} className="inline-flex items-center gap-1.5 font-display text-xs font-bold tracking-[0.2em] uppercase text-accent hover:opacity-70 mb-1">
              <ArrowLeft size={13} /> Association · Email templates
            </button>
            <h1 className="font-display font-black tracking-tight text-ink text-3xl sm:text-4xl leading-none flex items-center gap-3">
              <Mail size={24} className="text-accent" /> Welcome Email
            </h1>
          </div>
          <ThemeToggle theme={theme} onToggle={toggleTheme} />
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8 space-y-5">
        {!orgId && <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-700">Add <code>?org=&lt;association id&gt;</code> to the URL.</div>}
        {err && <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-700">{err}</div>}

        <div className="bg-white border border-gray-200 rounded-2xl p-5 space-y-4">
          <p className="text-xs text-gray-400">Customize the welcome email parents receive. Use merge fields and they'll be filled in per athlete. Leave blank to use the default.</p>
          <div className="flex flex-wrap gap-1.5">
            {FIELDS.map(f => <code key={f} className="text-xs bg-blue-50 text-accent border border-blue-100 rounded px-1.5 py-0.5">{`{{${f}}}`}</code>)}
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Subject</label>
            <input value={subject} onChange={e => { setSubject(e.target.value); setSaved(false); }}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-accent" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Body</label>
            <textarea value={body} onChange={e => { setBody(e.target.value); setSaved(false); }} rows={10}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-accent font-mono" />
          </div>
          <div className="flex items-center gap-3">
            <button onClick={save} disabled={saving || !orgId} className="inline-flex items-center gap-1.5 px-4 py-2 bg-accent text-white rounded-lg text-sm font-semibold hover:shadow-md disabled:opacity-50">
              <Save size={14} /> {saving ? "Saving…" : "Save template"}
            </button>
            {saved && <span className="text-sm text-green-600">Saved</span>}
          </div>
        </div>

        <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
          <div className="px-5 py-3 bg-gray-50 border-b border-gray-100 text-xs font-bold text-gray-500 uppercase tracking-wide">Preview (sample data)</div>
          <div className="p-5">
            <div className="text-sm font-semibold text-gray-900 mb-2">{preview(subject)}</div>
            <div className="text-sm text-gray-600 whitespace-pre-wrap leading-relaxed">{preview(body)}</div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function EmailTemplatesPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-gray-50 flex items-center justify-center" data-theme="premium-light"><div className="animate-spin rounded-full h-10 w-10 border-b-2 border-[#0b5cd6]" /></div>}>
      <TemplatesInner />
    </Suspense>
  );
}
