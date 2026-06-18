"use client";

import { useState, useEffect, useCallback, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  ArrowLeft, ArrowRight, Check, Plus, Trash2, Upload,
  AlertCircle, Users, Calendar, Settings, Trophy, Shield, Zap, GripVertical, Search,
} from "lucide-react";
import { OrgBrandIcon } from "@/components/OrgBrandIcon";
import RosterImport from "@/components/RosterImport";
import { useTheme } from "@/lib/useTheme";
import ThemeToggle from "@/components/ThemeToggle";

const qc = new QueryClient();

const SESSION_TYPES = [
  { value: "testing", label: "Testing", desc: "Timed drills, CSV import" },
  { value: "skills", label: "Skills Skate", desc: "Evaluator scoring" },
  { value: "scrimmage", label: "Scrimmage", desc: "Evaluator scoring" },
];
const GOALIE_SESSION_TYPES = [
  { value: "goalie_skills", label: "Goalie Skills", desc: "Goalie drills — like testing, higher is better" },
  { value: "scrimmage", label: "Scrimmage", desc: "Goalies evaluated in live play" },
];

// House-league default: Testing then 3 scrimmages. For rep tryouts, delete the
// Testing session and run all scrimmages.
const DEFAULT_SESSIONS = [
  { session_number: 1, name: "Session 1", session_type: "testing", weight_percentage: 10 },
  { session_number: 2, name: "Session 2", session_type: "scrimmage", weight_percentage: 30 },
  { session_number: 3, name: "Session 3", session_type: "scrimmage", weight_percentage: 30 },
  { session_number: 4, name: "Session 4", session_type: "scrimmage", weight_percentage: 30 },
];
// Goalie default: a Goalie Skills session then 3 scrimmages.
const DEFAULT_GOALIE_SESSIONS = [
  { session_number: 1, name: "Goalie Session 1", session_type: "goalie_skills", weight_percentage: 40 },
  { session_number: 2, name: "Goalie Session 2", session_type: "scrimmage", weight_percentage: 20 },
  { session_number: 3, name: "Goalie Session 3", session_type: "scrimmage", weight_percentage: 20 },
  { session_number: 4, name: "Goalie Session 4", session_type: "scrimmage", weight_percentage: 20 },
];

const DEFAULT_SCORING_CATS = [
  { name: "Skating", applies_to: "all" },
  { name: "Puck Skills", applies_to: "all" },
  { name: "Effort / Compete", applies_to: "all" },
  { name: "Hockey IQ", applies_to: "all" },
];
const DEFAULT_GOALIE_CATS = [
  { name: "Skating / Balance / Agility" },
  { name: "Positioning / Angles / Net Coverage" },
  { name: "Feet / Hands / Stick / Rebounds" },
  { name: "Anticipation / Reading the Play" },
];
const DEFAULT_GOALIE_SKILLS_CATS = [
  { name: "Mobility" },
  { name: "Rebound Control" },
  { name: "Positioning & Awareness" },
  { name: "Battle & Compete" },
];

const STEPS = [
  { id: 1, label: "Skater Sessions", icon: Trophy },
  { id: 2, label: "Goalie Sessions", icon: Shield },
  { id: 3, label: "Skater Scoring", icon: Settings },
  { id: 4, label: "Goalie Scoring", icon: Shield },
  { id: 5, label: "Athletes", icon: Users },
  { id: 6, label: "Schedule", icon: Calendar },
  { id: 7, label: "Review", icon: Check },
];

function parseCSV(text) {
  const lines = text.trim().split("\n");
  if (lines.length < 2) return [];
  const headers = lines[0].split(",").map(h => h.trim().replace(/^"|"$/g, ""));
  return lines.slice(1).map(line => {
    const vals = line.split(",").map(v => v.trim().replace(/^"|"$/g, ""));
    return Object.fromEntries(headers.map((h, i) => [h, vals[i] || ""]));
  });
}

function StepIndicator({ currentStep, skaterValid, onJump }) {
  const canJumpTo = (targetId) => {
    if (targetId === currentStep) return false;
    if (targetId > currentStep) return skaterValid; // step-1 weights gate forward
    return targetId < currentStep;
  };
  return (
    <div className="flex items-center gap-0 mb-10">
      {STEPS.map((step, i) => {
        const Icon = step.icon;
        const done = currentStep > step.id;
        const active = currentStep === step.id;
        const jumpable = canJumpTo(step.id);
        return (
          <div key={step.id} className="flex items-center flex-1">
            <div className="flex flex-col items-center flex-1">
              <button
                type="button"
                onClick={() => jumpable && onJump(step.id)}
                disabled={!jumpable}
                title={jumpable ? `Go to ${step.label}` : undefined}
                className={`w-9 h-9 rounded-full flex items-center justify-center border-2 transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
                  done ? "bg-accent border-accent" : active ? "bg-white border-accent" : "bg-white border-gray-200"
                } ${jumpable ? "cursor-pointer hover:opacity-75" : "cursor-default"}`}
              >
                {done ? <Check size={15} className="text-white" /> : <Icon size={15} className={active ? "text-accent" : "text-gray-400"} />}
              </button>
              <span className={`text-[11px] mt-1.5 font-medium text-center leading-tight ${active ? "text-accent" : done ? "text-gray-600" : "text-gray-400"}`}>{step.label}</span>
            </div>
            {i < STEPS.length - 1 && <div className={`h-0.5 flex-1 mb-5 ${done ? "bg-accent" : "bg-gray-200"}`} />}
          </div>
        );
      })}
    </div>
  );
}

// ─── Reusable session configurator (skaters + goalies) ──────────────────────
function SessionsStep({ title, subtitle, sessions, setSessions, typeOptions, addType }) {
  const total = sessions.reduce((s, sess) => s + Number(sess.weight_percentage), 0);
  const isValid = Math.round(total) === 100;
  const update = (i, field, value) => setSessions(prev => prev.map((s, idx) => idx === i ? { ...s, [field]: value } : s));
  const add = () => setSessions(prev => [...prev, { session_number: prev.length + 1, name: `Session ${prev.length + 1}`, session_type: addType, weight_percentage: 0 }]);
  const remove = (i) => setSessions(prev => prev.filter((_, idx) => idx !== i).map((s, idx) => ({ ...s, session_number: idx + 1 })));
  const autoBalance = () => {
    const count = sessions.length; if (!count) return;
    const base = Math.floor(100 / count), rem = 100 - base * count;
    setSessions(prev => prev.map((s, idx) => ({ ...s, weight_percentage: idx < rem ? base + 1 : base })));
  };
  return (
    <div>
      <h2 className="text-xl font-bold text-gray-900 mb-1">{title}</h2>
      <p className="text-sm text-gray-500 mb-6">{subtitle}</p>
      <div className="space-y-3 mb-4">
        {sessions.map((sess, i) => (
          <div key={i} className="bg-gray-50 border border-gray-200 rounded-xl p-4">
            <div className="flex items-center gap-3 flex-wrap">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-accent to-[#3b82f6] flex items-center justify-center text-white text-sm font-bold flex-shrink-0">{i + 1}</div>
              <input type="text" value={sess.name} onChange={e => update(i, "name", e.target.value)} className="flex-1 min-w-32 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-accent" placeholder="Session name" />
              <select value={sess.session_type} onChange={e => update(i, "session_type", e.target.value)} className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-accent bg-white">
                {typeOptions.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
              <div className="flex items-center gap-2">
                <input type="number" value={sess.weight_percentage} onChange={e => update(i, "weight_percentage", Number(e.target.value))} className="w-20 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-accent text-center" min="0" max="100" step="5" />
                <span className="text-sm text-gray-500">%</span>
              </div>
              {sessions.length > 1 && <button onClick={() => remove(i)} className="p-2 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg"><Trash2 size={15} /></button>}
            </div>
            <div className="mt-2 ml-11"><span className="text-xs text-gray-400">{typeOptions.find(t => t.value === sess.session_type)?.desc}</span></div>
          </div>
        ))}
      </div>
      <div className="flex items-center gap-3 mb-6">
        <button onClick={add} className="inline-flex items-center gap-2 px-4 py-2 border border-dashed border-gray-300 text-gray-500 rounded-lg hover:border-accent hover:text-accent text-sm"><Plus size={14} /> Add Session</button>
        {!isValid && <button onClick={autoBalance} className="inline-flex items-center gap-2 px-4 py-2 border border-accent text-accent rounded-lg text-sm font-medium hover:bg-accent hover:text-white"><Zap size={14} /> Auto-balance to 100%</button>}
      </div>
      <div className={`flex items-center justify-between p-4 rounded-xl border-2 ${isValid ? "bg-green-50 border-green-200" : "bg-amber-50 border-amber-200"}`}>
        <span className={`text-sm font-medium ${isValid ? "text-green-700" : "text-amber-700"}`}>Total Weight: {total}%</span>
        {isValid
          ? <span className="text-xs text-green-600 flex items-center gap-1"><Check size={13} /> Weights balance to 100%</span>
          : <span className="text-xs text-amber-600 flex items-center gap-1"><AlertCircle size={13} /> Must equal 100%</span>}
      </div>
    </div>
  );
}

// ─── Skater scoring ─────────────────────────────────────────────────────────
function SkaterScoringStep({ scoring, setScoring }) {
  const addCategory = () => setScoring(prev => ({ ...prev, categories: [...prev.categories, { name: "", applies_to: "all" }] }));
  const removeCategory = (i) => setScoring(prev => ({ ...prev, categories: prev.categories.filter((_, idx) => idx !== i) }));
  const updateCategory = (i, field, value) => setScoring(prev => ({ ...prev, categories: prev.categories.map((c, idx) => idx === i ? { ...c, [field]: value } : c) }));
  return (
    <div>
      <h2 className="text-xl font-bold text-gray-900 mb-1">Scoring Configuration — Skaters</h2>
      <p className="text-sm text-gray-500 mb-6">How evaluators score skaters in skills skates and scrimmages.</p>
      <div className="grid grid-cols-2 gap-4 mb-8">
        <div className="bg-gray-50 border border-gray-200 rounded-xl p-4">
          <label className="block text-sm font-semibold text-gray-700 mb-3">Score Scale</label>
          <div className="flex gap-3">
            {[5, 10].map(scale => (
              <button key={scale} onClick={() => setScoring(prev => ({ ...prev, scoring_scale: scale }))} className={`flex-1 py-2.5 rounded-lg border-2 text-sm font-medium ${scoring.scoring_scale === scale ? "border-accent bg-orange-50 text-accent" : "border-gray-200 text-gray-600 hover:border-gray-300"}`}>Out of {scale}</button>
            ))}
          </div>
        </div>
        <div className="bg-gray-50 border border-gray-200 rounded-xl p-4">
          <label className="block text-sm font-semibold text-gray-700 mb-3">Increments</label>
          <div className="flex gap-3">
            {[1, 0.5].map(inc => (
              <button key={inc} onClick={() => setScoring(prev => ({ ...prev, scoring_increment: inc }))} className={`flex-1 py-2.5 rounded-lg border-2 text-sm font-medium ${scoring.scoring_increment === inc ? "border-accent bg-orange-50 text-accent" : "border-gray-200 text-gray-600 hover:border-gray-300"}`}>{inc === 1 ? "Whole (1, 2...)" : "Half (0.5, 1...)"}</button>
            ))}
          </div>
        </div>
      </div>
      <div className="mb-8">
        <div className="flex items-center justify-between mb-3">
          <label className="text-sm font-semibold text-gray-700">Position Tagging</label>
          <button onClick={() => setScoring(prev => ({ ...prev, position_tagging: !prev.position_tagging }))} className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${scoring.position_tagging ? "bg-accent" : "bg-gray-200"}`}>
            <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${scoring.position_tagging ? "translate-x-6" : "translate-x-1"}`} />
          </button>
        </div>
        <p className="text-xs text-gray-500">{scoring.position_tagging ? "Tag players by position (Forward, Defense, Goalie) so rankings can be filtered by position. Goalies are evaluated in their own stream — configured on the next step." : "Player positions are not tracked. All athletes ranked together."}</p>
      </div>
      <div>
        <div className="flex items-center justify-between mb-3">
          <label className="text-sm font-semibold text-gray-700">Scoring Categories</label>
          <button onClick={addCategory} className="inline-flex items-center gap-1.5 text-xs text-accent hover:opacity-70 font-medium"><Plus size={13} /> Add Category</button>
        </div>
        <div className="space-y-2">
          {scoring.categories.map((cat, i) => (
            <div key={i} className="flex items-center gap-3 bg-gray-50 border border-gray-200 rounded-lg p-3">
              <GripVertical size={15} className="text-gray-300 flex-shrink-0" />
              <input type="text" value={cat.name} onChange={e => updateCategory(i, "name", e.target.value)} className="flex-1 px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-accent bg-white" placeholder="Category name" />
              {scoring.position_tagging && (
                <select value={cat.applies_to} onChange={e => updateCategory(i, "applies_to", e.target.value)} className="px-2 py-1.5 border border-gray-300 rounded-lg text-xs bg-white">
                  <option value="all">All</option>
                  <option value="skaters">Skaters</option>
                </select>
              )}
              <button onClick={() => removeCategory(i)} className="p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 rounded"><Trash2 size={13} /></button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Goalie service-provider picker (option C) ──────────────────────────────
function GoalieProviderPicker({ catId, scoring, setScoring }) {
  const [providers, setProviders] = useState([]);
  const [q, setQ] = useState("");
  const [showInvite, setShowInvite] = useState(false);
  const [inviteName, setInviteName] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);

  const load = useCallback(() => {
    fetch(`/api/categories/${catId}/goalie-provider`).then(r => r.json()).then(d => {
      setProviders(d.providers || []);
      if (d.linked && !scoring.goalie_sp_id) setScoring(prev => ({ ...prev, goalie_sp_id: d.linked.id }));
    }).catch(() => {});
  }, [catId]); // eslint-disable-line
  useEffect(() => { load(); }, [load]);

  const link = async (id) => {
    setBusy(true); setMsg(null);
    const res = await fetch(`/api/categories/${catId}/goalie-provider`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "link", goalie_sp_id: id }) });
    const d = await res.json(); setBusy(false);
    if (res.ok) { setScoring(prev => ({ ...prev, goalie_sp_id: id })); setMsg({ type: "ok", text: "Linked ✓" }); }
    else setMsg({ type: "err", text: d.error || "Failed to link" });
  };
  const invite = async () => {
    if (!inviteName || !inviteEmail) return;
    setBusy(true); setMsg(null);
    const res = await fetch(`/api/categories/${catId}/goalie-provider`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "invite", name: inviteName, email: inviteEmail }) });
    const d = await res.json(); setBusy(false);
    if (res.ok) {
      setScoring(prev => ({ ...prev, goalie_sp_id: d.goalie_sp_id }));
      setShowInvite(false); setInviteName(""); setInviteEmail("");
      setMsg({ type: "ok", text: d.invite?.url ? `Invited ${d.name}. Invite link: ${d.invite.url}` : `Invited ${d.name}.` });
      load();
    } else setMsg({ type: "err", text: d.error || "Failed to invite" });
  };

  const filtered = providers.filter(p => p.name.toLowerCase().includes(q.toLowerCase()));
  return (
    <div className="mt-4 border-t border-gray-100 pt-4">
      <label className="text-xs font-bold uppercase tracking-wide text-gray-500">Choose the goalie service provider</label>
      <div className="relative mt-2 mb-3">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search goalie service providers…" className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-accent" />
      </div>
      <div className="space-y-2 max-h-48 overflow-y-auto">
        {filtered.length === 0 && <p className="text-xs text-gray-400 px-1">No matches. Invite a new one below.</p>}
        {filtered.map(p => (
          <button key={p.id} onClick={() => link(p.id)} disabled={busy} className={`w-full flex items-center justify-between px-3 py-2 rounded-lg border text-left text-sm ${scoring.goalie_sp_id === p.id ? "border-accent bg-orange-50" : "border-gray-200 hover:border-gray-300"}`}>
            <span className="font-medium text-gray-800">{p.name}</span>
            {scoring.goalie_sp_id === p.id ? <span className="text-xs text-accent font-semibold flex items-center gap-1"><Check size={13} /> Selected</span> : <span className="text-xs text-gray-400">Select</span>}
          </button>
        ))}
      </div>
      {!showInvite ? (
        <button onClick={() => setShowInvite(true)} className="mt-3 inline-flex items-center gap-1.5 text-xs text-accent hover:opacity-70 font-medium"><Plus size={13} /> Not listed? Add &amp; invite a goalie SP</button>
      ) : (
        <div className="mt-3 bg-gray-50 border border-gray-200 rounded-lg p-3 space-y-2">
          <input value={inviteName} onChange={e => setInviteName(e.target.value)} placeholder="Company name" className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
          <input value={inviteEmail} onChange={e => setInviteEmail(e.target.value)} placeholder="Admin email" type="email" className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
          <div className="flex gap-2">
            <button onClick={() => setShowInvite(false)} className="px-3 py-1.5 border border-gray-300 text-gray-600 rounded-lg text-xs">Cancel</button>
            <button onClick={invite} disabled={busy || !inviteName || !inviteEmail} className="px-3 py-1.5 bg-accent text-white rounded-lg text-xs font-semibold disabled:opacity-50">{busy ? "Inviting…" : "Create & invite"}</button>
          </div>
        </div>
      )}
      {msg && <p className={`text-xs mt-2 break-words ${msg.type === "ok" ? "text-green-600" : "text-red-500"}`}>{msg.text}</p>}
    </div>
  );
}

// ─── Goalie scoring (A/B/C + categories) ────────────────────────────────────
function GoalieScoringStep({ catId, scoring, setScoring }) {
  const addGoalieCategory = () => setScoring(prev => ({ ...prev, goalie_categories: [...(prev.goalie_categories || []), { name: "" }] }));
  const removeGoalieCategory = (i) => setScoring(prev => ({ ...prev, goalie_categories: prev.goalie_categories.filter((_, idx) => idx !== i) }));
  const updateGoalieCategory = (i, v) => setScoring(prev => ({ ...prev, goalie_categories: prev.goalie_categories.map((c, idx) => idx === i ? { ...c, name: v } : c) }));
  const addGoalieSkillCat = () => setScoring(prev => ({ ...prev, goalie_skills_categories: [...(prev.goalie_skills_categories || []), { name: "" }] }));
  const removeGoalieSkillCat = (i) => setScoring(prev => ({ ...prev, goalie_skills_categories: prev.goalie_skills_categories.filter((_, idx) => idx !== i) }));
  const updateGoalieSkillCat = (i, v) => setScoring(prev => ({ ...prev, goalie_skills_categories: prev.goalie_skills_categories.map((c, idx) => idx === i ? { ...c, name: v } : c) }));

  const OPTIONS = [
    { value: "association", title: "A. Association evaluates in-house", desc: "Your own admins/directors designate the goalie evaluators." },
    { value: "service_provider", title: "B. The Service Provider evaluates", desc: "The service provider running this evaluation also handles goalies." },
    { value: "goalie_service_provider", title: "C. A Goalie Service Provider evaluates", desc: "A goalie-only company runs the goalie session with their own evaluators." },
  ];

  return (
    <div>
      <h2 className="text-xl font-bold text-gray-900 mb-1">Goalie Scoring Configuration</h2>
      <p className="text-sm text-gray-500 mb-6">Who evaluates the goalies, and how they're scored.</p>

      <div className="space-y-2 mb-8">
        {OPTIONS.map(o => (
          <button key={o.value} onClick={() => setScoring(prev => ({ ...prev, goalie_eval_mode: o.value }))} className={`w-full text-left p-4 rounded-xl border-2 transition-all ${scoring.goalie_eval_mode === o.value ? "border-accent bg-orange-50" : "border-gray-200 hover:border-gray-300"}`}>
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-gray-800">{o.title}</span>
              {scoring.goalie_eval_mode === o.value && <Check size={16} className="text-accent" />}
            </div>
            <p className="text-xs text-gray-500 mt-1">{o.desc}</p>
          </button>
        ))}
        {scoring.goalie_eval_mode === "goalie_service_provider" && <GoalieProviderPicker catId={catId} scoring={scoring} setScoring={setScoring} />}
      </div>

      {scoring.goalie_eval_mode !== "goalie_service_provider" && (
        <div className="flex items-center justify-between gap-3 mb-8 border border-gray-200 rounded-xl p-4">
          <div>
            <label className="text-sm font-semibold text-gray-700">Let skater evaluators also score goalies</label>
            <p className="text-xs text-gray-500 mt-0.5">Off by default. Turn on if you don't have dedicated goalie evaluators.</p>
          </div>
          <button type="button" onClick={() => setScoring(prev => ({ ...prev, players_eval_goalies: !prev.players_eval_goalies }))} className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors flex-shrink-0 ${scoring.players_eval_goalies ? "bg-accent" : "bg-gray-200"}`}>
            <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${scoring.players_eval_goalies ? "translate-x-6" : "translate-x-1"}`} />
          </button>
        </div>
      )}

      <div className="flex gap-4 flex-wrap mb-8">
        <div>
          <label className="block text-xs font-bold uppercase tracking-wide text-gray-500 mb-1.5">Goalie scale</label>
          <select value={scoring.goalie_scale} onChange={e => setScoring(prev => ({ ...prev, goalie_scale: Number(e.target.value) }))} className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm bg-white">
            <option value={5}>Out of 5</option><option value={10}>Out of 10</option><option value={100}>Out of 100</option>
          </select>
        </div>
        <div>
          <label className="block text-xs font-bold uppercase tracking-wide text-gray-500 mb-1.5">Increment</label>
          <select value={scoring.goalie_increment} onChange={e => setScoring(prev => ({ ...prev, goalie_increment: Number(e.target.value) }))} className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm bg-white">
            <option value={0.5}>0.5</option><option value={1}>1.0</option>
          </select>
        </div>
      </div>

      <div className="mb-8">
        <div className="flex items-center justify-between mb-2">
          <label className="text-xs font-bold uppercase tracking-wide text-gray-500">Goalie skills drills · session 1</label>
          <button onClick={addGoalieSkillCat} className="inline-flex items-center gap-1 text-xs text-accent hover:opacity-70 font-medium"><Plus size={12} /> Add drill</button>
        </div>
        <p className="text-xs text-gray-500 mb-2">The goalie skills session — like testing for skaters. Drills marked on points (higher is better).</p>
        <div className="space-y-2">
          {(scoring.goalie_skills_categories || []).map((c, i) => (
            <div key={i} className="flex items-center gap-3 bg-gray-50 border border-gray-200 rounded-lg p-3">
              <GripVertical size={15} className="text-gray-300 flex-shrink-0" />
              <input type="text" value={c.name} onChange={e => updateGoalieSkillCat(i, e.target.value)} className="flex-1 px-3 py-1.5 border border-gray-300 rounded-lg text-sm bg-white" placeholder="Drill name" />
              <button onClick={() => removeGoalieSkillCat(i)} className="p-1.5 text-red-400 hover:text-red-600"><Trash2 size={13} /></button>
            </div>
          ))}
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="text-xs font-bold uppercase tracking-wide text-gray-500">Goalie scrimmage categories</label>
          <button onClick={addGoalieCategory} className="inline-flex items-center gap-1 text-xs text-accent hover:opacity-70 font-medium"><Plus size={12} /> Add category</button>
        </div>
        <div className="space-y-2">
          {(scoring.goalie_categories || []).map((c, i) => (
            <div key={i} className="flex items-center gap-3 bg-gray-50 border border-gray-200 rounded-lg p-3">
              <GripVertical size={15} className="text-gray-300 flex-shrink-0" />
              <input type="text" value={c.name} onChange={e => updateGoalieCategory(i, e.target.value)} className="flex-1 px-3 py-1.5 border border-gray-300 rounded-lg text-sm bg-white" placeholder="Goalie category name" />
              <button onClick={() => removeGoalieCategory(i)} className="p-1.5 text-red-400 hover:text-red-600"><Trash2 size={13} /></button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Athletes ───────────────────────────────────────────────────────────────
function AthletesStep({ catId, categoryName }) {
  const [athletes, setAthletes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showQuickAdd, setShowQuickAdd] = useState(false);
  const [quickAdd, setQuickAdd] = useState({ first_name: "", last_name: "", external_id: "", position: "", birth_year: "" });
  const [addingPlayer, setAddingPlayer] = useState(false);

  const loadAthletes = useCallback(async () => {
    const res = await fetch(`/api/categories/${catId}/athletes`);
    const data = await res.json();
    setAthletes(data.athletes || []);
    setLoading(false);
  }, [catId]);
  useEffect(() => { loadAthletes(); }, [loadAthletes]);

  const handleQuickAdd = async (e) => {
    e.preventDefault();
    setAddingPlayer(true);
    const res = await fetch(`/api/categories/${catId}/athletes`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(quickAdd) });
    if (res.ok) { setQuickAdd({ first_name: "", last_name: "", external_id: "", position: "", birth_year: "" }); setShowQuickAdd(false); loadAthletes(); }
    setAddingPlayer(false);
  };

  return (
    <div>
      <h2 className="text-xl font-bold text-gray-900 mb-1">Add Athletes</h2>
      <p className="text-sm text-gray-500 mb-6">Upload your roster via CSV or add players individually.</p>
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <p className="text-xs text-gray-400">Works with RAMP, TeamSnap, TeamLinkt, or our template — combined names and birth dates are handled automatically.</p>
        <a href="/api/templates?type=athletes" download className="text-xs text-accent hover:underline font-medium whitespace-nowrap">↓ Download blank template</a>
      </div>
      <RosterImport catId={catId} categoryName={categoryName} onImported={() => loadAthletes()} />
      <div className="flex items-center gap-3 my-6 flex-wrap">
        <button onClick={() => setShowQuickAdd(!showQuickAdd)} className="inline-flex items-center gap-2 px-5 py-2.5 border border-gray-300 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50"><Plus size={15} /> Quick Add Player</button>
      </div>
      {showQuickAdd && (
        <form onSubmit={handleQuickAdd} className="bg-gray-50 border border-gray-200 rounded-xl p-4 mb-4">
          <p className="text-sm font-semibold text-gray-700 mb-3">Quick Add Player</p>
          <div className="grid grid-cols-2 gap-3 mb-3">
            <input type="text" placeholder="First Name *" required value={quickAdd.first_name} onChange={e => setQuickAdd(p => ({ ...p, first_name: e.target.value }))} className="px-3 py-2 border border-gray-300 rounded-lg text-sm" />
            <input type="text" placeholder="Last Name *" required value={quickAdd.last_name} onChange={e => setQuickAdd(p => ({ ...p, last_name: e.target.value }))} className="px-3 py-2 border border-gray-300 rounded-lg text-sm" />
            <input type="text" placeholder="HC# / Player ID" value={quickAdd.external_id} onChange={e => setQuickAdd(p => ({ ...p, external_id: e.target.value }))} className="px-3 py-2 border border-gray-300 rounded-lg text-sm" />
            <select value={quickAdd.position} onChange={e => setQuickAdd(p => ({ ...p, position: e.target.value }))} className="px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white">
              <option value="">Position (optional)</option><option value="forward">Forward</option><option value="defense">Defense</option><option value="goalie">Goalie</option>
            </select>
            <input type="number" placeholder="Birth Year" value={quickAdd.birth_year} onChange={e => setQuickAdd(p => ({ ...p, birth_year: e.target.value }))} className="px-3 py-2 border border-gray-300 rounded-lg text-sm" />
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={() => setShowQuickAdd(false)} className="px-4 py-2 border border-gray-300 text-gray-600 rounded-lg text-sm hover:bg-gray-100">Cancel</button>
            <button type="submit" disabled={addingPlayer} className="px-4 py-2 bg-accent text-white rounded-lg text-sm font-medium hover:opacity-90 disabled:opacity-50">{addingPlayer ? "Adding..." : "Add Player"}</button>
          </div>
        </form>
      )}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
          <span className="text-sm font-semibold text-gray-700">Roster</span>
          <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">{athletes.length} players</span>
        </div>
        {loading ? <div className="p-8 text-center text-gray-400 text-sm">Loading...</div>
          : athletes.length === 0 ? <div className="p-8 text-center text-gray-400 text-sm">No athletes added yet</div>
          : (
          <div className="max-h-64 overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 sticky top-0"><tr>
                <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
                <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500 uppercase">HC#</th>
                <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500 uppercase">Position</th>
                <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500 uppercase">Birth Year</th>
              </tr></thead>
              <tbody className="divide-y divide-gray-100">
                {athletes.map(a => (
                  <tr key={a.id} className="hover:bg-gray-50">
                    <td className="px-4 py-2.5 font-medium text-gray-900">{a.last_name}, {a.first_name}</td>
                    <td className="px-4 py-2.5 text-gray-500 font-mono text-xs">{a.external_id || "—"}</td>
                    <td className="px-4 py-2.5 text-gray-500 capitalize">{a.position || "—"}</td>
                    <td className="px-4 py-2.5 text-gray-500">{a.birth_year || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Schedule ───────────────────────────────────────────────────────────────
function ScheduleStep({ catId }) {
  const [schedule, setSchedule] = useState([]);
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState(null);

  const loadSchedule = useCallback(async () => {
    const res = await fetch(`/api/categories/${catId}/schedule`);
    const data = await res.json();
    setSchedule(data.schedule || []);
    setLoading(false);
  }, [catId]);
  useEffect(() => { loadSchedule(); }, [loadSchedule]);

  const handleCSVUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setImporting(true); setImportResult(null);
    const text = await file.text();
    const rows = parseCSV(text);
    const schedule = rows.map(row => {
      const type = (row["Type"] || row["type"] || "").toLowerCase();
      const isGoalieSkills = type.includes("goalie");
      const isTesting = type.includes("testing");
      const playerEval = row["Player Evaluators"] || row["Evaluators Required"] || "";
      const goalieEval = row["Goalie Evaluators"] || "";
      return {
        session_number: parseInt(row["Session #"] || row["session_number"] || row["Session"] || "0"),
        group_number: parseInt(row["Group #"] || row["group_number"] || row["Group"] || "0") || null,
        scheduled_date: row["Date"] || row["scheduled_date"] || "",
        day_of_week: row["Day"] || row["day_of_week"] || "",
        start_time: row["Start Time"] || row["start_time"] || "",
        end_time: row["End Time"] || row["end_time"] || "",
        location: row["Location"] || row["location"] || "",
        type,
        evaluators_required: (isTesting || isGoalieSkills) ? 0 : (parseInt(playerEval) || 0),
        goalie_evaluators_required: isGoalieSkills ? (parseInt(goalieEval) || 2) : (parseInt(goalieEval) || 0),
      };
    }).filter(r => r.session_number && r.scheduled_date);

    const res = await fetch(`/api/categories/${catId}/schedule`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ schedule }) });
    const data = await res.json();
    setImportResult(data); setImporting(false); loadSchedule();
  };

  const bySession = schedule.reduce((acc, e) => { (acc[e.session_number] ||= []).push(e); return acc; }, {});

  return (
    <div>
      <div className="flex items-start justify-between mb-1 gap-4">
        <h2 className="text-xl font-bold text-gray-900">Upload Schedule</h2>
        <span className="inline-flex items-center px-2.5 py-1 bg-gray-100 text-gray-500 rounded-full text-xs font-medium whitespace-nowrap flex-shrink-0 mt-0.5">Optional — can add later</span>
      </div>
      <p className="text-sm text-gray-500 mb-6">Upload your evaluation schedule. This creates the full evaluation timeline and is shared with your service provider and evaluators. You can skip this step and add it later.</p>
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-6">
        <div className="flex items-center justify-between mb-1">
          <p className="text-xs font-semibold text-blue-700">Required CSV Columns</p>
          <a href="/api/templates?type=schedule" download className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-100 text-blue-700 rounded-lg text-xs font-semibold hover:bg-blue-200">↓ Download Template</a>
        </div>
        <p className="text-xs text-blue-600 font-mono">Session #, Group #, Type, Date, Day, Start Time, End Time, Location, Player Evaluators, Goalie Evaluators</p>
        <p className="text-xs text-blue-500 mt-1">Date: YYYY-MM-DD · Times: HH:MM (24hr) · Each row = one group time slot.</p>
        <p className="text-xs text-blue-500 mt-1"><b>Type</b> = Testing · Goalie Skills · Scrimmage · Skills. Mark the goalies' session-1 slot as <b>Goalie Skills</b>; it carries its own Goalie Evaluators count.</p>
      </div>
      <div className="flex items-center gap-3 mb-6">
        <label className="inline-flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-accent to-[#3b82f6] text-white rounded-lg text-sm font-semibold cursor-pointer hover:shadow-lg">
          <Upload size={15} />{importing ? "Importing..." : "Upload Schedule CSV"}
          <input type="file" accept=".csv" onChange={handleCSVUpload} className="hidden" disabled={importing} />
        </label>
      </div>
      {importResult && <div className="p-4 rounded-xl bg-green-50 border border-green-200 mb-4"><p className="text-sm font-semibold text-green-700">✓ Imported {(importResult.inserted || 0) + (importResult.updated || 0) || importResult.imported || 0} schedule entries</p></div>}
      {loading ? <div className="p-8 text-center text-gray-400 text-sm">Loading...</div>
        : schedule.length === 0 ? <div className="p-8 text-center text-gray-400 text-sm bg-gray-50 rounded-xl border border-dashed border-gray-200">No schedule uploaded yet</div>
        : (
        <div className="space-y-4">
          {Object.entries(bySession).sort(([a], [b]) => Number(a) - Number(b)).map(([sessionNum, entries]) => (
            <div key={sessionNum} className="bg-white border border-gray-200 rounded-xl overflow-hidden">
              <div className="flex items-center gap-3 px-4 py-3 bg-gray-50 border-b border-gray-100">
                <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-accent to-[#3b82f6] flex items-center justify-center text-white text-xs font-bold">{sessionNum}</div>
                <span className="text-sm font-semibold text-gray-700">Session {sessionNum}</span>
                <span className="text-xs text-gray-400">{entries.length} group{entries.length !== 1 ? "s" : ""}</span>
              </div>
              <table className="w-full text-sm">
                <thead><tr className="text-xs text-gray-500 uppercase">
                  <th className="px-4 py-2 text-left">Group</th><th className="px-4 py-2 text-left">Date</th><th className="px-4 py-2 text-left">Day</th><th className="px-4 py-2 text-left">Time</th><th className="px-4 py-2 text-left">Location</th><th className="px-4 py-2 text-left">Eval (P/G)</th>
                </tr></thead>
                <tbody className="divide-y divide-gray-100">
                  {entries.sort((a, b) => (a.group_number || 0) - (b.group_number || 0)).map((e, i) => (
                    <tr key={i} className="hover:bg-gray-50">
                      <td className="px-4 py-2.5 font-medium text-gray-700">{e.group_number ? `Group ${e.group_number}` : "—"}</td>
                      <td className="px-4 py-2.5 text-gray-600">{e.scheduled_date?.toString().split("T")[0]}</td>
                      <td className="px-4 py-2.5 text-gray-500">{e.day_of_week || "—"}</td>
                      <td className="px-4 py-2.5 text-gray-500">{e.start_time && e.end_time ? `${e.start_time} – ${e.end_time}` : e.start_time || "—"}</td>
                      <td className="px-4 py-2.5 text-gray-500">{e.location || "—"}</td>
                      <td className="px-4 py-2.5 text-gray-500">{e.evaluators_required ?? 0}/{e.goalie_evaluators_required ?? 0}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Review ─────────────────────────────────────────────────────────────────
function ReviewStep({ catName, sessions, scoring }) {
  const totalWeight = sessions.reduce((s, sess) => s + Number(sess.weight_percentage), 0);
  const gTotal = (scoring.goalie_sessions || []).reduce((t, s) => t + Number(s.weight_percentage || 0), 0);
  const modeLabel = { association: "Association (in-house)", service_provider: "Service Provider", goalie_service_provider: "Goalie Service Provider" }[scoring.goalie_eval_mode] || "Association";
  return (
    <div>
      <h2 className="text-xl font-bold text-gray-900 mb-1">Review & Launch</h2>
      <p className="text-sm text-gray-500 mb-6">Review both skater and goalie configuration before activating.</p>
      <div className="space-y-4">
        <div className="bg-gray-50 border border-gray-200 rounded-xl p-5">
          <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2"><Trophy size={15} className="text-accent" /> Skater Sessions ({sessions.length})</h3>
          <div className="space-y-2">
            {sessions.map((s, i) => (<div key={i} className="flex items-center justify-between text-sm"><span className="text-gray-700">{s.name} <span className="text-gray-400 capitalize">({s.session_type})</span></span><span className="font-semibold text-accent">{s.weight_percentage}%</span></div>))}
            <div className={`flex items-center justify-between text-sm pt-2 border-t border-gray-200 font-semibold ${totalWeight === 100 ? "text-green-600" : "text-red-500"}`}><span>Total</span><span>{totalWeight}%</span></div>
          </div>
        </div>
        <div className="bg-gray-50 border border-gray-200 rounded-xl p-5">
          <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2"><Shield size={15} className="text-accent" /> Goalie Sessions ({(scoring.goalie_sessions || []).length})</h3>
          <div className="space-y-2">
            {(scoring.goalie_sessions || []).map((s, i) => (<div key={i} className="flex items-center justify-between text-sm"><span className="text-gray-700">{s.name} <span className="text-gray-400 capitalize">({s.session_type.replace("_", " ")})</span></span><span className="font-semibold text-accent">{s.weight_percentage}%</span></div>))}
            <div className={`flex items-center justify-between text-sm pt-2 border-t border-gray-200 font-semibold ${Math.round(gTotal) === 100 ? "text-green-600" : "text-red-500"}`}><span>Total</span><span>{gTotal}%</span></div>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div className="bg-gray-50 border border-gray-200 rounded-xl p-5">
            <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2"><Settings size={15} className="text-accent" /> Skater Scoring</h3>
            <div className="space-y-1.5 text-sm">
              <div><span className="text-gray-500">Scale:</span> <span className="font-medium">Out of {scoring.scoring_scale}</span></div>
              <div><span className="text-gray-500">Increments:</span> <span className="font-medium">{scoring.scoring_increment === 0.5 ? "0.5" : "1.0"}</span></div>
              <div><span className="text-gray-500">Position Tagging:</span> <span className="font-medium">{scoring.position_tagging ? "On" : "Off"}</span></div>
            </div>
            <div className="flex flex-wrap gap-1.5 mt-3">{scoring.categories.map((c, i) => (<span key={i} className="px-2 py-0.5 bg-orange-50 text-accent border border-orange-200 rounded-full text-xs font-medium">{c.name}</span>))}</div>
          </div>
          <div className="bg-gray-50 border border-gray-200 rounded-xl p-5">
            <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2"><Shield size={15} className="text-accent" /> Goalie Scoring</h3>
            <div className="space-y-1.5 text-sm">
              <div><span className="text-gray-500">Evaluated by:</span> <span className="font-medium">{modeLabel}</span></div>
              <div><span className="text-gray-500">Scale:</span> <span className="font-medium">Out of {scoring.goalie_scale}</span></div>
            </div>
            <div className="flex flex-wrap gap-1.5 mt-3">
              {(scoring.goalie_skills_categories || []).map((c, i) => (<span key={`s${i}`} className="px-2 py-0.5 bg-blue-50 text-blue-600 border border-blue-200 rounded-full text-xs font-medium">{c.name}</span>))}
              {(scoring.goalie_categories || []).map((c, i) => (<span key={`c${i}`} className="px-2 py-0.5 bg-gray-100 text-gray-600 border border-gray-200 rounded-full text-xs font-medium">{c.name}</span>))}
            </div>
          </div>
        </div>
        {totalWeight !== 100 && (<div className="flex items-start gap-3 p-4 bg-red-50 border border-red-200 rounded-xl"><AlertCircle size={16} className="text-red-500 mt-0.5 flex-shrink-0" /><p className="text-sm text-red-700">Skater session weights must total 100%. Go back to Step 1.</p></div>)}
        {totalWeight === 100 && (<div className="flex items-start gap-3 p-4 bg-green-50 border border-green-200 rounded-xl"><Check size={16} className="text-green-500 mt-0.5 flex-shrink-0" /><p className="text-sm text-green-700">Looks good! Click <strong>Launch Category</strong> to activate. You can edit settings later.</p></div>)}
      </div>
    </div>
  );
}

// ─── Main Wizard ─────────────────────────────────────────────────────────────
function SetupWizard() {
  const searchParams = useSearchParams();
  const catId = searchParams.get("cat");
  const orgId = searchParams.get("org");

  const [step, setStep] = useState(1);
  const [catName, setCatName] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [theme, toggleTheme] = useTheme();

  const [sessions, setSessions] = useState(DEFAULT_SESSIONS);
  const [scoring, setScoring] = useState({
    scoring_scale: 10,
    scoring_increment: 0.5,
    position_tagging: true,
    players_eval_goalies: false,
    categories: DEFAULT_SCORING_CATS,
    goalie_eval_mode: "association",
    goalie_sp_id: null,
    goalie_scale: 10,
    goalie_increment: 0.5,
    goalie_sessions: DEFAULT_GOALIE_SESSIONS,
    goalie_categories: DEFAULT_GOALIE_CATS,
    goalie_skills_categories: DEFAULT_GOALIE_SKILLS_CATS,
  });
  const setGoalieSessions = (updater) => setScoring(prev => ({ ...prev, goalie_sessions: typeof updater === "function" ? updater(prev.goalie_sessions) : updater }));

  useEffect(() => {
    if (!catId) return;
    fetch(`/api/categories/${catId}/setup`).then(r => r.json()).then(data => {
      if (data.category) setCatName(data.category.name);
      if (data.sessions?.length) setSessions(data.sessions);
      if (data.category?.scoring_scale) {
        setScoring(prev => ({
          ...prev,
          scoring_scale: data.category.scoring_scale,
          scoring_increment: parseFloat(data.category.scoring_increment),
          position_tagging: data.category.position_tagging,
          players_eval_goalies: !!data.category.players_eval_goalies,
          goalie_eval_mode: data.category.goalie_eval_mode || prev.goalie_eval_mode,
          goalie_scale: data.category.goalie_config?.scale ?? prev.goalie_scale,
          goalie_increment: data.category.goalie_config?.increment ?? prev.goalie_increment,
          goalie_sessions: Array.isArray(data.category.goalie_config?.sessions) && data.category.goalie_config.sessions.length ? data.category.goalie_config.sessions : prev.goalie_sessions,
        }));
      }
      if (data.scoringCategories?.length) {
        const gcats = data.scoringCategories.filter(c => c.applies_to === "goalies");
        const gskill = data.scoringCategories.filter(c => c.applies_to === "goalie_skills");
        const scats = data.scoringCategories.filter(c => c.applies_to !== "goalies" && c.applies_to !== "goalie_skills");
        setScoring(prev => ({
          ...prev,
          categories: scats.length ? scats : prev.categories,
          goalie_categories: gcats.length ? gcats : prev.goalie_categories,
          goalie_skills_categories: gskill.length ? gskill : prev.goalie_skills_categories,
        }));
      }
    });
  }, [catId]);

  const skaterValid = Math.round(sessions.reduce((s, sess) => s + Number(sess.weight_percentage), 0)) === 100;
  const goalieConfigPayload = () => ({ scale: scoring.goalie_scale, increment: scoring.goalie_increment, sessions: scoring.goalie_sessions });

  const saveStep = async () => {
    setSaving(true); setError("");
    const post = (body) => fetch(`/api/categories/${catId}/setup`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    try {
      if (step === 1) {
        if (!skaterValid) { setError("Skater session weights must total 100%."); setSaving(false); return; }
        await post({ step: "sessions", data: { sessions } });
      }
      if (step === 2) {
        const gTotal = scoring.goalie_sessions.reduce((t, s) => t + Number(s.weight_percentage || 0), 0);
        if (Math.round(gTotal) !== 100) { setError("Goalie session weights must total 100%."); setSaving(false); return; }
        await post({ step: "goalie_sessions", data: { goalie_config: goalieConfigPayload() } });
      }
      if (step === 3) {
        await post({ step: "scoring", data: { scoring_scale: scoring.scoring_scale, scoring_increment: scoring.scoring_increment, position_tagging: scoring.position_tagging, categories: scoring.categories } });
      }
      if (step === 4) {
        await post({ step: "goalie_scoring", data: {
          goalie_eval_mode: scoring.goalie_eval_mode,
          players_eval_goalies: scoring.players_eval_goalies,
          goalie_config: goalieConfigPayload(),
          goalie_categories: scoring.goalie_categories,
          goalie_skills_categories: scoring.goalie_skills_categories,
        } });
      }
      if (step === 7) {
        if (!skaterValid) { setError("Fix skater session weights before launching."); setSaving(false); return; }
        await post({ step: "complete" });
        window.location.href = `/association/dashboard/category/${catId}?org=${orgId}`;
        return;
      }
      setStep(s => s + 1);
    } catch (e) { setError(e.message); }
    setSaving(false);
  };

  return (
    <div data-theme={theme} className="min-h-screen bg-gray-50">
      <div className="bg-white border-b border-gray-200 shadow-sm">
        <div className="max-w-3xl mx-auto px-4 py-5">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <a href={`/association/dashboard/category/${catId}?org=${orgId}`} className="inline-flex items-center gap-1.5 font-display text-xs font-bold tracking-[0.2em] uppercase text-accent hover:opacity-70 mb-2"><ArrowLeft size={13} /> {catName || "Back to category"}</a>
              <div className="flex items-end gap-4 flex-wrap"><h1 className="font-display font-black tracking-tight text-ink text-4xl sm:text-5xl leading-none">Setup</h1><OrgBrandIcon orgId={orgId} size={44} /></div>
            </div>
            <ThemeToggle theme={theme} onToggle={toggleTheme} />
          </div>
        </div>
      </div>
      <div className="max-w-3xl mx-auto px-4 py-10">
        <StepIndicator currentStep={step} skaterValid={skaterValid} onJump={setStep} />
        <div className="bg-white border border-gray-200 rounded-2xl p-8 shadow-sm mb-6">
          {step === 1 && <SessionsStep title="Configure Skater Sessions" subtitle="How many sessions, their types, and weighting. House-league default is Testing then 3 scrimmages — for rep tryouts, delete Testing and run scrimmages. Weights must total 100%." sessions={sessions} setSessions={setSessions} typeOptions={SESSION_TYPES} addType="scrimmage" />}
          {step === 2 && <SessionsStep title="Configure Goalie Sessions" subtitle="Goalies run their own session set. Default is a Goalie Skills session then 3 scrimmages — for rep tryouts, delete Goalie Skills and run scrimmages. Weights must total 100%." sessions={scoring.goalie_sessions} setSessions={setGoalieSessions} typeOptions={GOALIE_SESSION_TYPES} addType="scrimmage" />}
          {step === 3 && <SkaterScoringStep scoring={scoring} setScoring={setScoring} />}
          {step === 4 && <GoalieScoringStep catId={catId} scoring={scoring} setScoring={setScoring} />}
          {step === 5 && <AthletesStep catId={catId} categoryName={catName} />}
          {step === 6 && <ScheduleStep catId={catId} />}
          {step === 7 && <ReviewStep catName={catName} sessions={sessions} scoring={scoring} />}
        </div>
        {error && <div className="flex items-center gap-2 p-4 bg-red-50 border border-red-200 rounded-xl mb-4"><AlertCircle size={15} className="text-red-500 flex-shrink-0" /><p className="text-sm text-red-700">{error}</p></div>}
        <div className="flex items-center justify-between">
          <button onClick={() => setStep(s => s - 1)} disabled={step === 1} className="inline-flex items-center gap-2 px-5 py-2.5 border border-gray-300 text-gray-700 rounded-xl font-medium text-sm hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"><ArrowLeft size={15} /> Back</button>
          <span className="text-xs text-gray-400">Step {step} of {STEPS.length}</span>
          <button onClick={saveStep} disabled={saving} className="inline-flex items-center gap-2 px-6 py-2.5 bg-gradient-to-r from-accent to-[#3b82f6] text-white rounded-xl font-semibold text-sm hover:shadow-lg disabled:opacity-50">{saving ? "Saving..." : step === 7 ? "Launch Category" : "Save & Continue"}{!saving && <ArrowRight size={15} />}</button>
        </div>
      </div>
    </div>
  );
}

export default function CategorySetupPage() {
  return (
    <QueryClientProvider client={qc}>
      <Suspense fallback={<div data-theme="premium" className="min-h-screen bg-gray-50 flex items-center justify-center"><div className="animate-spin rounded-full h-10 w-10 border-b-2 border-accent" /></div>}>
        <SetupWizard />
      </Suspense>
    </QueryClientProvider>
  );
}
