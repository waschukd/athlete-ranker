"use client";

import { useState, useEffect, useCallback, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  ArrowLeft, ArrowRight, Check, Plus, Trash2, Upload,
  AlertCircle, ChevronUp, ChevronDown, Users, Calendar,
  Settings, Trophy, Zap, GripVertical
} from "lucide-react";

const qc = new QueryClient();

const SESSION_TYPES = [
  { value: "testing", label: "Testing", desc: "Timed drills, CSV import" },
  { value: "skills", label: "Skills Skate", desc: "Evaluator scoring" },
  { value: "scrimmage", label: "Scrimmage", desc: "Evaluator scoring" },
];

const DEFAULT_SESSIONS = [
  { session_number: 1, name: "Session 1", session_type: "testing", weight_percentage: 10 },
  { session_number: 2, name: "Session 2", session_type: "skills", weight_percentage: 30 },
  { session_number: 3, name: "Session 3", session_type: "skills", weight_percentage: 30 },
  { session_number: 4, name: "Session 4", session_type: "scrimmage", weight_percentage: 30 },
];

const DEFAULT_SCORING_CATS = [
  { name: "Skating", applies_to: "all" },
  { name: "Puck Skills", applies_to: "all" },
  { name: "Effort / Compete", applies_to: "all" },
  { name: "Hockey IQ", applies_to: "all" },
];

const STEPS = [
  { id: 1, label: "Sessions", icon: Trophy },
  { id: 2, label: "Scoring", icon: Settings },
  { id: 3, label: "Athletes", icon: Users },
  { id: 4, label: "Schedule", icon: Calendar },
  { id: 5, label: "Review", icon: Check },
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

function StepIndicator({ currentStep }) {
  return (
    <div className="flex items-center gap-0 mb-10">
      {STEPS.map((step, i) => {
        const Icon = step.icon;
        const done = currentStep > step.id;
        const active = currentStep === step.id;
        return (
          <div key={step.id} className="flex items-center flex-1">
            <div className="flex flex-col items-center flex-1">
              <div className={`w-9 h-9 rounded-full flex items-center justify-center border-2 transition-all ${
                done ? "bg-[#1A6BFF] border-[#1A6BFF]" :
                active ? "bg-white border-[#1A6BFF]" :
                "bg-white border-gray-200"
              }`}>
                {done
                  ? <Check size={15} className="text-white" />
                  : <Icon size={15} className={active ? "text-[#1A6BFF]" : "text-gray-400"} />
                }
              </div>
              <span className={`text-xs mt-1.5 font-medium ${active ? "text-[#1A6BFF]" : done ? "text-gray-600" : "text-gray-400"}`}>
                {step.label}
              </span>
            </div>
            {i < STEPS.length - 1 && (
              <div className={`h-0.5 flex-1 mb-5 ${done ? "bg-[#1A6BFF]" : "bg-gray-200"}`} />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Step 1: Sessions ───────────────────────────────────────────────────────
function SessionsStep({ sessions, setSessions }) {
  const total = sessions.reduce((s, sess) => s + Number(sess.weight_percentage), 0);
  const isValid = Math.round(total) === 100;

  const updateSession = (i, field, value) => {
    setSessions(prev => prev.map((s, idx) => idx === i ? { ...s, [field]: value } : s));
  };

  const addSession = () => {
    const next = sessions.length + 1;
    setSessions(prev => [...prev, { session_number: next, name: `Session ${next}`, session_type: "skills", weight_percentage: 0 }]);
  };

  const removeSession = (i) => {
    setSessions(prev => prev.filter((_, idx) => idx !== i).map((s, idx) => ({ ...s, session_number: idx + 1 })));
  };

  return (
    <div>
      <h2 className="text-xl font-bold text-gray-900 mb-1">Configure Sessions</h2>
      <p className="text-sm text-gray-500 mb-6">Define how many sessions, their types, and how they contribute to the final ranking. Weights must total 100%.</p>

      <div className="space-y-3 mb-4">
        {sessions.map((sess, i) => (
          <div key={i} className="bg-gray-50 border border-gray-200 rounded-xl p-4">
            <div className="flex items-center gap-3 flex-wrap">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#1A6BFF] to-[#4D8FFF] flex items-center justify-center text-white text-sm font-bold flex-shrink-0">
                {i + 1}
              </div>
              <input
                type="text"
                value={sess.name}
                onChange={e => updateSession(i, "name", e.target.value)}
                className="flex-1 min-w-32 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1A6BFF]"
                placeholder="Session name"
              />
              <select
                value={sess.session_type}
                onChange={e => updateSession(i, "session_type", e.target.value)}
                className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1A6BFF] bg-white"
              >
                {SESSION_TYPES.map(t => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  value={sess.weight_percentage}
                  onChange={e => updateSession(i, "weight_percentage", Number(e.target.value))}
                  className="w-20 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1A6BFF] text-center"
                  min="0" max="100" step="5"
                />
                <span className="text-sm text-gray-500">%</span>
              </div>
              {sessions.length > 1 && (
                <button onClick={() => removeSession(i)} className="p-2 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors">
                  <Trash2 size={15} />
                </button>
              )}
            </div>
            <div className="mt-2 ml-11">
              <span className="text-xs text-gray-400">{SESSION_TYPES.find(t => t.value === sess.session_type)?.desc}</span>
            </div>
          </div>
        ))}
      </div>

      <button onClick={addSession} className="inline-flex items-center gap-2 px-4 py-2 border border-dashed border-gray-300 text-gray-500 rounded-lg hover:border-[#1A6BFF] hover:text-[#1A6BFF] text-sm transition-colors mb-6">
        <Plus size={14} /> Add Session
      </button>

      <div className={`flex items-center justify-between p-4 rounded-xl border-2 ${isValid ? "bg-green-50 border-green-200" : "bg-amber-50 border-amber-200"}`}>
        <span className={`text-sm font-medium ${isValid ? "text-green-700" : "text-amber-700"}`}>
          Total Weight: {total}%
        </span>
        {isValid
          ? <span className="text-xs text-green-600 flex items-center gap-1"><Check size={13} /> Weights balance to 100%</span>
          : <span className="text-xs text-amber-600 flex items-center gap-1"><AlertCircle size={13} /> Must equal 100% (currently {100 - total > 0 ? `${100 - total}% remaining` : `${total - 100}% over`})</span>
        }
      </div>
    </div>
  );
}

// ─── Step 2: Scoring ────────────────────────────────────────────────────────
function ScoringStep({ scoring, setScoring }) {
  const addCategory = () => {
    setScoring(prev => ({ ...prev, categories: [...prev.categories, { name: "", applies_to: "all" }] }));
  };

  const removeCategory = (i) => {
    setScoring(prev => ({ ...prev, categories: prev.categories.filter((_, idx) => idx !== i) }));
  };

  const updateCategory = (i, field, value) => {
    setScoring(prev => ({
      ...prev,
      categories: prev.categories.map((c, idx) => idx === i ? { ...c, [field]: value } : c)
    }));
  };

  return (
    <div>
      <h2 className="text-xl font-bold text-gray-900 mb-1">Scoring Configuration</h2>
      <p className="text-sm text-gray-500 mb-6">Configure how evaluators score athletes in Skills Skates and Scrimmages.</p>

      <div className="grid grid-cols-2 gap-4 mb-8">
        <div className="bg-gray-50 border border-gray-200 rounded-xl p-4">
          <label className="block text-sm font-semibold text-gray-700 mb-3">Score Scale</label>
          <div className="flex gap-3">
            {[5, 10].map(scale => (
              <button
                key={scale}
                onClick={() => setScoring(prev => ({ ...prev, scoring_scale: scale }))}
                className={`flex-1 py-2.5 rounded-lg border-2 text-sm font-medium transition-all ${
                  scoring.scoring_scale === scale ? "border-[#1A6BFF] bg-orange-50 text-[#1A6BFF]" : "border-gray-200 text-gray-600 hover:border-gray-300"
                }`}
              >
                Out of {scale}
              </button>
            ))}
          </div>
        </div>

        <div className="bg-gray-50 border border-gray-200 rounded-xl p-4">
          <label className="block text-sm font-semibold text-gray-700 mb-3">Increments</label>
          <div className="flex gap-3">
            {[1, 0.5].map(inc => (
              <button
                key={inc}
                onClick={() => setScoring(prev => ({ ...prev, scoring_increment: inc }))}
                className={`flex-1 py-2.5 rounded-lg border-2 text-sm font-medium transition-all ${
                  scoring.scoring_increment === inc ? "border-[#1A6BFF] bg-orange-50 text-[#1A6BFF]" : "border-gray-200 text-gray-600 hover:border-gray-300"
                }`}
              >
                {inc === 1 ? "Whole (1, 2...)" : "Half (0.5, 1...)"}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="mb-8">
        <div className="flex items-center justify-between mb-3">
          <label className="text-sm font-semibold text-gray-700">Position Tagging</label>
          <button
            onClick={() => setScoring(prev => ({ ...prev, position_tagging: !prev.position_tagging }))}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${scoring.position_tagging ? "bg-[#1A6BFF]" : "bg-gray-200"}`}
          >
            <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${scoring.position_tagging ? "translate-x-6" : "translate-x-1"}`} />
          </button>
        </div>
        <p className="text-xs text-gray-500">
          {scoring.position_tagging
            ? "Tag players by position (Forward, Defense, Goalie) so rankings can be filtered and sorted by position at the end. Goalies are evaluated in a completely separate stream with their own evaluators."
            : "Player positions are not tracked. All athletes ranked together in one pool."}
        </p>
      </div>

      <div>
        <div className="flex items-center justify-between mb-3">
          <label className="text-sm font-semibold text-gray-700">Scoring Categories</label>
          <button onClick={addCategory} className="inline-flex items-center gap-1.5 text-xs text-[#1A6BFF] hover:text-[#0F4FCC] font-medium">
            <Plus size={13} /> Add Category
          </button>
        </div>

        <div className="space-y-2">
          {scoring.categories.map((cat, i) => (
            <div key={i} className="flex items-center gap-3 bg-gray-50 border border-gray-200 rounded-lg p-3">
              <GripVertical size={15} className="text-gray-300 flex-shrink-0" />
              <input
                type="text"
                value={cat.name}
                onChange={e => updateCategory(i, "name", e.target.value)}
                className="flex-1 px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1A6BFF] bg-white"
                placeholder="Category name"
              />
              {scoring.position_tagging && (
                <select
                  value={cat.applies_to}
                  onChange={e => updateCategory(i, "applies_to", e.target.value)}
                  className="px-2 py-1.5 border border-gray-300 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-[#1A6BFF] bg-white"
                >
                  <option value="all">All</option>
                  <option value="skaters">Skaters</option>
                  <option value="goalies">Goalies</option>
                </select>
              )}
              <button onClick={() => removeCategory(i)} className="p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors">
                <Trash2 size={13} />
              </button>
            </div>
            <div className="flex items-center justify-between py-3 border-t border-gray-100">
              <div>
                <div className="font-medium text-gray-900 text-sm">Anchor Player Calibration</div>
                <div className="text-xs text-gray-500 mt-0.5">Allow flagging anchor players to normalize evaluator bias across groups. Must be approved per session.</div>
              </div>
              <button type="button" onClick={() => handleToggle('anchor_calibration_enabled')}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${form.anchor_calibration_enabled ? 'bg-[#1A6BFF]' : 'bg-gray-200'}`}>
                <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${form.anchor_calibration_enabled ? 'translate-x-6' : 'translate-x-1'}`} />
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Step 3: Athletes ───────────────────────────────────────────────────────
function AthletesStep({ catId }) {
  const [athletes, setAthletes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState(null);
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

  const handleCSVUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setImporting(true);
    setImportResult(null);

    const text = await file.text();
    const rows = parseCSV(text);

    // Map CSV columns flexibly
    const athletes = rows.map(row => ({
      first_name: row["First Name"] || row["first_name"] || row["FirstName"] || "",
      last_name: row["Last Name"] || row["last_name"] || row["LastName"] || "",
      external_id: row["HC#"] || row["Hockey Canada #"] || row["external_id"] || row["ID"] || "",
      position: row["Position"] || row["position"] || "",
      birth_year: row["Birth Year"] || row["birth_year"] || row["DOB"] || "",
      parent_email: row["Parent Email"] || row["parent_email"] || row["Email"] || "",
    })).filter(a => a.first_name && a.last_name);

    const res = await fetch(`/api/categories/${catId}/athletes`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ athletes }),
    });
    const data = await res.json();
    setImportResult(data);
    setImporting(false);
    loadAthletes();
  };

  const handleQuickAdd = async (e) => {
    e.preventDefault();
    setAddingPlayer(true);
    const res = await fetch(`/api/categories/${catId}/athletes`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(quickAdd),
    });
    if (res.ok) {
      setQuickAdd({ first_name: "", last_name: "", external_id: "", position: "", birth_year: "" });
      setShowQuickAdd(false);
      loadAthletes();
    }
    setAddingPlayer(false);
  };

  return (
    <div>
      <h2 className="text-xl font-bold text-gray-900 mb-1">Add Athletes</h2>
      <p className="text-sm text-gray-500 mb-6">Upload your roster via CSV or add players individually.</p>

      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-6 flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold text-blue-700 mb-1">CSV Format</p>
          <p className="text-xs text-blue-600 font-mono">First Name, Last Name, HC#, Position, Birth Year, Parent Email</p>
          <p className="text-xs text-blue-500 mt-1">HC# = Hockey Canada number or any unique player ID. Position: forward / defense / goalie</p>
        </div>
        <a href="/api/templates?type=athletes" download
          className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-100 text-blue-700 rounded-lg text-xs font-semibold hover:bg-blue-200 whitespace-nowrap flex-shrink-0">
          ↓ Download Template
        </a>
      </div>

      <div className="flex items-center gap-3 mb-6 flex-wrap">
        <label className="inline-flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-[#1A6BFF] to-[#4D8FFF] text-white rounded-lg text-sm font-semibold cursor-pointer hover:shadow-lg transition-shadow">
          <Upload size={15} />
          {importing ? "Importing..." : "Upload CSV"}
          <input type="file" accept=".csv" onChange={handleCSVUpload} className="hidden" disabled={importing} />
        </label>
        <button
          onClick={() => setShowQuickAdd(!showQuickAdd)}
          className="inline-flex items-center gap-2 px-5 py-2.5 border border-gray-300 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors"
        >
          <Plus size={15} /> Quick Add Player
        </button>
      </div>

      {importResult && (
        <div className={`p-4 rounded-xl border mb-4 ${importResult.imported > 0 ? "bg-green-50 border-green-200" : "bg-amber-50 border-amber-200"}`}>
          <p className={`text-sm font-semibold ${importResult.imported > 0 ? "text-green-700" : "text-amber-700"}`}>
            ✓ Imported {importResult.imported} athletes{importResult.skipped > 0 ? `, ${importResult.skipped} skipped` : ""}
          </p>
          {importResult.errors?.length > 0 && (
            <ul className="mt-2 text-xs text-red-600 space-y-0.5">
              {importResult.errors.slice(0, 5).map((e, i) => <li key={i}>• {e}</li>)}
            </ul>
          )}
        </div>
      )}

      {showQuickAdd && (
        <form onSubmit={handleQuickAdd} className="bg-gray-50 border border-gray-200 rounded-xl p-4 mb-4">
          <p className="text-sm font-semibold text-gray-700 mb-3">Quick Add Player</p>
          <div className="grid grid-cols-2 gap-3 mb-3">
            <input type="text" placeholder="First Name *" required value={quickAdd.first_name} onChange={e => setQuickAdd(p => ({ ...p, first_name: e.target.value }))}
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1A6BFF]" />
            <input type="text" placeholder="Last Name *" required value={quickAdd.last_name} onChange={e => setQuickAdd(p => ({ ...p, last_name: e.target.value }))}
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1A6BFF]" />
            <input type="text" placeholder="HC# / Player ID" value={quickAdd.external_id} onChange={e => setQuickAdd(p => ({ ...p, external_id: e.target.value }))}
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1A6BFF]" />
            <select value={quickAdd.position} onChange={e => setQuickAdd(p => ({ ...p, position: e.target.value }))}
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1A6BFF] bg-white">
              <option value="">Position (optional)</option>
              <option value="forward">Forward</option>
              <option value="defense">Defense</option>
              <option value="goalie">Goalie</option>
            </select>
            <input type="number" placeholder="Birth Year" value={quickAdd.birth_year} onChange={e => setQuickAdd(p => ({ ...p, birth_year: e.target.value }))}
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1A6BFF]" />
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={() => setShowQuickAdd(false)}
              className="px-4 py-2 border border-gray-300 text-gray-600 rounded-lg text-sm hover:bg-gray-100">Cancel</button>
            <button type="submit" disabled={addingPlayer}
              className="px-4 py-2 bg-[#1A6BFF] text-white rounded-lg text-sm font-medium hover:bg-[#0F4FCC] disabled:opacity-50">
              {addingPlayer ? "Adding..." : "Add Player"}
            </button>
          </div>
        </form>
      )}

      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
          <span className="text-sm font-semibold text-gray-700">Roster</span>
          <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">{athletes.length} players</span>
        </div>
        {loading ? (
          <div className="p-8 text-center text-gray-400 text-sm">Loading...</div>
        ) : athletes.length === 0 ? (
          <div className="p-8 text-center text-gray-400 text-sm">No athletes added yet</div>
        ) : (
          <div className="max-h-64 overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 sticky top-0">
                <tr>
                  <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
                  <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500 uppercase">HC#</th>
                  <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500 uppercase">Position</th>
                  <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500 uppercase">Birth Year</th>
                </tr>
              </thead>
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

// ─── Step 4: Schedule ───────────────────────────────────────────────────────
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
    setImporting(true);
    setImportResult(null);

    const text = await file.text();
    const rows = parseCSV(text);

    const schedule = rows.map(row => ({
      session_number: parseInt(row["Session #"] || row["session_number"] || row["Session"] || "0"),
      group_number: parseInt(row["Group #"] || row["group_number"] || row["Group"] || "0") || null,
      scheduled_date: row["Date"] || row["scheduled_date"] || "",
      day_of_week: row["Day"] || row["day_of_week"] || "",
      start_time: row["Start Time"] || row["start_time"] || "",
      end_time: row["End Time"] || row["end_time"] || "",
      location: row["Location"] || row["location"] || "",
    })).filter(r => r.session_number && r.scheduled_date);

    const res = await fetch(`/api/categories/${catId}/schedule`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ schedule }),
    });
    const data = await res.json();
    setImportResult(data);
    setImporting(false);
    loadSchedule();
  };

  const bySession = schedule.reduce((acc, entry) => {
    const key = entry.session_number;
    if (!acc[key]) acc[key] = [];
    acc[key].push(entry);
    return acc;
  }, {});

  return (
    <div>
      <h2 className="text-xl font-bold text-gray-900 mb-1">Upload Schedule</h2>
      <p className="text-sm text-gray-500 mb-6">Upload your evaluation schedule. This creates the full evaluation timeline and is shared with your service provider and evaluators.</p>

      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-6">
        <div className="flex items-center justify-between mb-1">
          <p className="text-xs font-semibold text-blue-700">Required CSV Columns</p>
          <a href="/api/templates?type=schedule" download
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-100 text-blue-700 rounded-lg text-xs font-semibold hover:bg-blue-200">
            ↓ Download Template
          </a>
        </div>
        <p className="text-xs text-blue-600 font-mono">Session #, Group #, Date, Day, Start Time, End Time, Location</p>
        <p className="text-xs text-blue-500 mt-1">Date format: YYYY-MM-DD. Times: HH:MM (24hr). Each row = one group time slot.</p>
      </div>

      <div className="flex items-center gap-3 mb-6">
        <label className="inline-flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-[#1A6BFF] to-[#4D8FFF] text-white rounded-lg text-sm font-semibold cursor-pointer hover:shadow-lg transition-shadow">
          <Upload size={15} />
          {importing ? "Importing..." : "Upload Schedule CSV"}
          <input type="file" accept=".csv" onChange={handleCSVUpload} className="hidden" disabled={importing} />
        </label>
      </div>

      {importResult && (
        <div className="p-4 rounded-xl bg-green-50 border border-green-200 mb-4">
          <p className="text-sm font-semibold text-green-700">✓ Imported {importResult.imported} schedule entries</p>
        </div>
      )}

      {loading ? (
        <div className="p-8 text-center text-gray-400 text-sm">Loading...</div>
      ) : schedule.length === 0 ? (
        <div className="p-8 text-center text-gray-400 text-sm bg-gray-50 rounded-xl border border-dashed border-gray-200">
          No schedule uploaded yet
        </div>
      ) : (
        <div className="space-y-4">
          {Object.entries(bySession).sort(([a], [b]) => Number(a) - Number(b)).map(([sessionNum, entries]) => (
            <div key={sessionNum} className="bg-white border border-gray-200 rounded-xl overflow-hidden">
              <div className="flex items-center gap-3 px-4 py-3 bg-gray-50 border-b border-gray-100">
                <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-[#1A6BFF] to-[#4D8FFF] flex items-center justify-center text-white text-xs font-bold">
                  {sessionNum}
                </div>
                <span className="text-sm font-semibold text-gray-700">Session {sessionNum}</span>
                <span className="text-xs text-gray-400">{entries.length} group{entries.length !== 1 ? "s" : ""}</span>
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-gray-500 uppercase">
                    <th className="px-4 py-2 text-left">Group</th>
                    <th className="px-4 py-2 text-left">Date</th>
                    <th className="px-4 py-2 text-left">Day</th>
                    <th className="px-4 py-2 text-left">Time</th>
                    <th className="px-4 py-2 text-left">Location</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {entries.sort((a, b) => (a.group_number || 0) - (b.group_number || 0)).map((e, i) => (
                    <tr key={i} className="hover:bg-gray-50">
                      <td className="px-4 py-2.5 font-medium text-gray-700">{e.group_number ? `Group ${e.group_number}` : "—"}</td>
                      <td className="px-4 py-2.5 text-gray-600">{e.scheduled_date}</td>
                      <td className="px-4 py-2.5 text-gray-500">{e.day_of_week || "—"}</td>
                      <td className="px-4 py-2.5 text-gray-500">
                        {e.start_time && e.end_time ? `${e.start_time} – ${e.end_time}` : e.start_time || "—"}
                      </td>
                      <td className="px-4 py-2.5 text-gray-500">{e.location || "—"}</td>
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

// ─── Step 5: Review ─────────────────────────────────────────────────────────
function ReviewStep({ catName, sessions, scoring }) {
  const totalWeight = sessions.reduce((s, sess) => s + Number(sess.weight_percentage), 0);

  return (
    <div>
      <h2 className="text-xl font-bold text-gray-900 mb-1">Review & Launch</h2>
      <p className="text-sm text-gray-500 mb-6">Review your configuration before activating this age category.</p>

      <div className="space-y-4">
        <div className="bg-gray-50 border border-gray-200 rounded-xl p-5">
          <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2"><Trophy size={15} className="text-[#1A6BFF]" /> Sessions ({sessions.length})</h3>
          <div className="space-y-2">
            {sessions.map((s, i) => (
              <div key={i} className="flex items-center justify-between text-sm">
                <span className="text-gray-700">{s.name} <span className="text-gray-400 capitalize">({s.session_type})</span></span>
                <span className="font-semibold text-[#1A6BFF]">{s.weight_percentage}%</span>
              </div>
            ))}
            <div className={`flex items-center justify-between text-sm pt-2 border-t border-gray-200 font-semibold ${totalWeight === 100 ? "text-green-600" : "text-red-500"}`}>
              <span>Total</span>
              <span>{totalWeight}%</span>
            </div>
          </div>
        </div>

        <div className="bg-gray-50 border border-gray-200 rounded-xl p-5">
          <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2"><Settings size={15} className="text-[#1A6BFF]" /> Scoring</h3>
          <div className="grid grid-cols-2 gap-3 text-sm mb-3">
            <div><span className="text-gray-500">Scale:</span> <span className="font-medium">Out of {scoring.scoring_scale}</span></div>
            <div><span className="text-gray-500">Increments:</span> <span className="font-medium">{scoring.scoring_increment === 0.5 ? "0.5" : "1.0"}</span></div>
            <div><span className="text-gray-500">Position Tagging:</span> <span className="font-medium">{scoring.position_tagging ? "On" : "Off"}</span></div>
          </div>
          <div className="flex flex-wrap gap-2">
            {scoring.categories.map((c, i) => (
              <span key={i} className="px-2.5 py-1 bg-orange-50 text-[#1A6BFF] border border-orange-200 rounded-full text-xs font-medium">{c.name}</span>
            ))}
          </div>
        </div>

        {totalWeight !== 100 && (
          <div className="flex items-start gap-3 p-4 bg-red-50 border border-red-200 rounded-xl">
            <AlertCircle size={16} className="text-red-500 mt-0.5 flex-shrink-0" />
            <p className="text-sm text-red-700">Session weights must total 100% before you can launch. Go back to Step 1 to fix this.</p>
          </div>
        )}

        {totalWeight === 100 && (
          <div className="flex items-start gap-3 p-4 bg-green-50 border border-green-200 rounded-xl">
            <Check size={16} className="text-green-500 mt-0.5 flex-shrink-0" />
            <p className="text-sm text-green-700">Everything looks good! Click <strong>Launch Category</strong> to activate it. You can always edit these settings later.</p>
          </div>
        )}
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

  const [sessions, setSessions] = useState(DEFAULT_SESSIONS);
  const [scoring, setScoring] = useState({
    scoring_scale: 10,
    scoring_increment: 0.5,
    position_tagging: false,
    categories: DEFAULT_SCORING_CATS,
  });

  useEffect(() => {
    if (!catId) return;
    fetch(`/api/categories/${catId}/setup`)
      .then(r => r.json())
      .then(data => {
        if (data.category) setCatName(data.category.name);
        if (data.sessions?.length) setSessions(data.sessions);
        if (data.category?.scoring_scale) {
          setScoring(prev => ({
            ...prev,
            scoring_scale: data.category.scoring_scale,
            scoring_increment: parseFloat(data.category.scoring_increment),
            position_tagging: data.category.position_tagging,
          }));
        }
        if (data.scoringCategories?.length) {
          setScoring(prev => ({ ...prev, categories: data.scoringCategories }));
        }
      });
  }, [catId]);

  const saveStep = async () => {
    setSaving(true);
    setError("");
    try {
      if (step === 1) {
        const total = sessions.reduce((s, sess) => s + Number(sess.weight_percentage), 0);
        if (Math.round(total) !== 100) { setError("Session weights must total 100%."); setSaving(false); return; }
        await fetch(`/api/categories/${catId}/setup`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ step: "sessions", data: { sessions } }),
        });
      }
      if (step === 2) {
        await fetch(`/api/categories/${catId}/setup`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ step: "scoring", data: scoring }),
        });
      }
      if (step === 5) {
        const total = sessions.reduce((s, sess) => s + Number(sess.weight_percentage), 0);
        if (Math.round(total) !== 100) { setError("Fix session weights before launching."); setSaving(false); return; }
        await fetch(`/api/categories/${catId}/setup`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ step: "complete" }),
        });
        window.location.href = `/association/dashboard/category/${catId}?org=${orgId}`;
        return;
      }
      setStep(s => s + 1);
    } catch (e) {
      setError(e.message);
    }
    setSaving(false);
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-3xl mx-auto px-4 py-10">
        <div className="flex items-center gap-3 mb-8">
          <a href={`/association/dashboard?org=${orgId}`}
            className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors">
            <ArrowLeft size={18} />
          </a>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{catName}</h1>
            <p className="text-sm text-gray-500">Category Setup</p>
          </div>
        </div>

        <StepIndicator currentStep={step} />

        <div className="bg-white border border-gray-200 rounded-2xl p-8 shadow-sm mb-6">
          {step === 1 && <SessionsStep sessions={sessions} setSessions={setSessions} />}
          {step === 2 && <ScoringStep scoring={scoring} setScoring={setScoring} />}
          {step === 3 && <AthletesStep catId={catId} />}
          {step === 4 && <ScheduleStep catId={catId} />}
          {step === 5 && <ReviewStep catName={catName} sessions={sessions} scoring={scoring} />}
        </div>

        {error && (
          <div className="flex items-center gap-2 p-4 bg-red-50 border border-red-200 rounded-xl mb-4">
            <AlertCircle size={15} className="text-red-500 flex-shrink-0" />
            <p className="text-sm text-red-700">{error}</p>
          </div>
        )}

        <div className="flex items-center justify-between">
          <button
            onClick={() => setStep(s => s - 1)}
            disabled={step === 1}
            className="inline-flex items-center gap-2 px-5 py-2.5 border border-gray-300 text-gray-700 rounded-xl font-medium text-sm hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            <ArrowLeft size={15} /> Back
          </button>

          <span className="text-xs text-gray-400">Step {step} of {STEPS.length}</span>

          <button
            onClick={saveStep}
            disabled={saving}
            className="inline-flex items-center gap-2 px-6 py-2.5 bg-gradient-to-r from-[#1A6BFF] to-[#4D8FFF] text-white rounded-xl font-semibold text-sm hover:shadow-lg disabled:opacity-50 transition-shadow"
          >
            {saving ? "Saving..." : step === 5 ? "Launch Category" : "Save & Continue"}
            {!saving && <ArrowRight size={15} />}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function CategorySetupPage() {
  return (
    <QueryClientProvider client={qc}>
      <Suspense fallback={<div className="min-h-screen bg-gray-50 flex items-center justify-center"><div className="animate-spin rounded-full h-10 w-10 border-b-2 border-[#1A6BFF]" /></div>}>
        <SetupWizard />
      </Suspense>
    </QueryClientProvider>
  );
}
