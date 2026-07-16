"use client";

import { useState, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { ArrowLeft, Mail, Save, RotateCcw } from "lucide-react";
import { useTheme } from "@/lib/useTheme";
import ThemeToggle from "@/components/ThemeToggle";
import { DEFAULT_TEMPLATES, TEMPLATE_KEYS, SAMPLE_VARS, renderTemplate } from "@/lib/emailTemplateDefaults";

function TemplatesInner() {
  const searchParams = useSearchParams();
  const orgId = searchParams.get("org");
  const [theme, toggleTheme] = useTheme();

  const initialKey = TEMPLATE_KEYS.includes(searchParams.get("key")) ? searchParams.get("key") : "welcome";
  const [key, setKey] = useState(initialKey);

  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [isDefault, setIsDefault] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [err, setErr] = useState("");

  const def = DEFAULT_TEMPLATES[key] || { subject: "", body: "", fields: [], label: key };

  // Load the org's override for this key, else fall back to the built-in wording.
  useEffect(() => {
    if (!orgId) return;
    let alive = true;
    setSaved(false); setErr("");
    fetch(`/api/email-templates?org=${orgId}&key=${key}`)
      .then(r => r.json())
      .then(d => {
        if (!alive) return;
        if (d.error) { setErr(d.error); return; }
        const has = d.template && (d.template.subject || d.template.body_html);
        setSubject(has && d.template.subject ? d.template.subject : def.subject);
        setBody(has && d.template.body_html ? d.template.body_html : def.body);
        setIsDefault(!has);
      })
      .catch(() => alive && setErr("Couldn't load the template."));
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId, key]);

  const save = async () => {
    setSaving(true); setSaved(false); setErr("");
    const res = await fetch("/api/email-templates", {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ organization_id: Number(orgId), key, subject, body_html: body }),
    });
    const d = await res.json();
    if (d.error) setErr(d.error);
    else { setSaved(true); setIsDefault(false); }
    setSaving(false);
  };

  const restore = () => { setSubject(def.subject); setBody(def.body); setSaved(false); };

  const preview = str => renderTemplate(str, SAMPLE_VARS) || "";
  const dirty = subject !== def.subject || body !== def.body;

  return (
    <div className="min-h-screen bg-gray-50" data-theme={theme}>
      <div className="bg-white border-b border-gray-200 shadow-sm">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-5 flex items-center justify-between flex-wrap gap-3">
          <div>
            <button onClick={() => window.history.back()} className="inline-flex items-center gap-1.5 font-display text-xs font-bold tracking-[0.2em] uppercase text-accent hover:opacity-70 mb-1">
              <ArrowLeft size={13} /> Association · Email templates
            </button>
            <h1 className="font-display font-black tracking-tight text-ink text-3xl sm:text-4xl leading-none flex items-center gap-3">
              <Mail size={24} className="text-accent" /> Email Templates
            </h1>
          </div>
          <ThemeToggle theme={theme} onToggle={toggleTheme} />
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8 space-y-5">
        {!orgId && <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-700">Add <code>?org=&lt;association id&gt;</code> to the URL.</div>}
        {err && <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-700">{err}</div>}

        {/* Which email you're editing */}
        <div className="flex flex-wrap gap-2">
          {TEMPLATE_KEYS.map(k => (
            <button
              key={k}
              onClick={() => setKey(k)}
              className={`px-3.5 py-2 rounded-lg text-sm font-semibold border transition-colors ${
                k === key
                  ? "bg-accent text-white border-accent"
                  : "bg-white text-gray-600 border-gray-200 hover:border-accent/50"
              }`}
            >
              {DEFAULT_TEMPLATES[k].label}
            </button>
          ))}
        </div>

        <div className="bg-white border border-gray-200 rounded-2xl p-5 space-y-4">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <p className="text-xs text-gray-400 max-w-md">{def.description}</p>
            <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${
              isDefault ? "bg-gray-100 text-gray-500" : "bg-green-50 text-green-700"
            }`}>
              {isDefault ? "Using default" : "Your wording"}
            </span>
          </div>

          <div className="flex flex-wrap gap-1.5">
            {def.fields.map(f => <code key={f} className="text-xs bg-accent-soft text-accent border border-accent/20 rounded px-1.5 py-0.5">{`{{${f}}}`}</code>)}
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Subject</label>
            <input value={subject} onChange={e => { setSubject(e.target.value); setSaved(false); }}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-accent" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Body</label>
            <textarea value={body} onChange={e => { setBody(e.target.value); setSaved(false); }} rows={14}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-accent leading-relaxed" />
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            <button onClick={save} disabled={saving || !orgId} className="inline-flex items-center gap-1.5 px-4 py-2 bg-accent text-white rounded-lg text-sm font-semibold hover:shadow-md disabled:opacity-50">
              <Save size={14} /> {saving ? "Saving…" : "Save template"}
            </button>
            {dirty && (
              <button onClick={restore} className="inline-flex items-center gap-1.5 px-3 py-2 text-sm text-gray-500 rounded-lg hover:bg-gray-100">
                <RotateCcw size={13} /> Restore default wording
              </button>
            )}
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
    <Suspense fallback={<div className="min-h-screen bg-gray-50 flex items-center justify-center" data-theme="premium-light"><div className="animate-spin rounded-full h-10 w-10 border-b-2 border-accent" /></div>}>
      <TemplatesInner />
    </Suspense>
  );
}
