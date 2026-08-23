"use client";

import { useState } from "react";
import { X, Pencil, Ban, RotateCcw, Plus } from "lucide-react";
import ConfirmDialog from "@/components/ConfirmDialog";

const DAYS_OF_WEEK = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

// Shared modal shell for the schedule add/edit forms — Minimal Athletic look.
export function ScheduleFormModal({ title, subtitle, form, setForm, showSessionGroup, busy, error, onSubmit, onClose, submitLabel }) {
  const set = (k) => (e) => setForm((p) => ({ ...p, [k]: e.target.value }));
  const inputCls = "w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent/30";
  const labelCls = "text-xs font-medium text-gray-500 mb-1 block";
  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={(e) => e.target === e.currentTarget && !busy && onClose()}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
        <div className="flex items-start justify-between mb-1">
          <h3 className="font-display font-extrabold tracking-tight text-ink text-lg leading-tight">{title}</h3>
          <button onClick={onClose} disabled={busy} className="text-gray-400 hover:text-gray-600 disabled:opacity-50"><X size={18} /></button>
        </div>
        {subtitle && <p className="text-xs text-gray-400 mb-4">{subtitle}</p>}
        <div className="space-y-3 mt-3">
          {showSessionGroup && (
            <div className="grid grid-cols-2 gap-3">
              <div><label className={labelCls}>Session # *</label><input type="number" min="1" value={form.session_number} onChange={set("session_number")} className={inputCls} /></div>
              <div><label className={labelCls}>Group #</label><input type="number" min="1" value={form.group_number} onChange={set("group_number")} className={inputCls} /></div>
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div><label className={labelCls}>Date *</label><input type="date" value={form.scheduled_date} onChange={set("scheduled_date")} className={inputCls} /></div>
            <div>
              <label className={labelCls}>Day</label>
              <select value={form.day_of_week || ""} onChange={set("day_of_week")} className={inputCls}>
                <option value="">Auto</option>
                {DAYS_OF_WEEK.map((d) => <option key={d} value={d}>{d}</option>)}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className={labelCls}>Start time</label><input type="time" value={form.start_time || ""} onChange={set("start_time")} className={inputCls} /></div>
            <div><label className={labelCls}>End time</label><input type="time" value={form.end_time || ""} onChange={set("end_time")} className={inputCls} /></div>
          </div>
          <div><label className={labelCls}>Location</label><input type="text" placeholder="Arena / rink" value={form.location || ""} onChange={set("location")} className={inputCls} /></div>
          <div><label className={labelCls}>Player evaluators</label><input type="number" min="0" value={form.evaluators_required} onChange={set("evaluators_required")} className={inputCls} /></div>
          {error && <p className="text-xs font-medium text-red-500">{error}</p>}
          <div className="flex gap-3 pt-2">
            <button onClick={onClose} disabled={busy} className="flex-1 px-4 py-2 border border-gray-300 text-gray-600 rounded-lg text-sm disabled:opacity-50">Cancel</button>
            <button onClick={onSubmit} disabled={busy} className="flex-1 px-4 py-2 bg-accent text-white rounded-lg text-sm font-semibold hover:opacity-90 disabled:opacity-40">{busy ? "Saving…" : submitLabel}</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// Per-row schedule controls: Edit / Cancel / Reinstate, calling the per-category
// schedule endpoints. Reports back to the parent via onSaved (which refetches and
// shows the confirmation line). Self-contained so no existing state changes.
export function ScheduleRowControls({ entry, onSaved, orgParam }) {
  const catId = entry.age_category_id;
  // SP-owned testing events have no age_category_id — they're edited via the
  // SP testing-events endpoint, not the (category-keyed) schedule endpoint.
  const isSpOwned = !catId;
  const teUrl = `/api/service-provider/testing-events${orgParam ? `?org=${orgParam}` : ""}`;
  const [showEdit, setShowEdit] = useState(false);
  const [showCancel, setShowCancel] = useState(false);
  const [showRemove, setShowRemove] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [form, setForm] = useState(null);

  const toTime = (t) => (t ? t.toString().slice(0, 5) : "");
  const openEdit = () => {
    setError(null);
    setForm({
      scheduled_date: entry.scheduled_date?.toString().split("T")[0] || "",
      day_of_week: entry.day_of_week || "",
      start_time: toTime(entry.start_time),
      end_time: toTime(entry.end_time),
      location: entry.location || "",
      evaluators_required: entry.evaluators_required ?? 4,
      goalie_evaluators_required: entry.goalie_evaluators_required ?? 0,
    });
    setShowEdit(true);
  };

  const submitEdit = async () => {
    setBusy(true); setError(null);
    const url = isSpOwned ? teUrl : `/api/categories/${catId}/schedule`;
    const res = await fetch(url, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: entry.id,
        scheduled_date: form.scheduled_date,
        day_of_week: form.day_of_week || null,
        start_time: form.start_time || null,
        end_time: form.end_time || null,
        location: form.location || null,
        evaluators_required: form.evaluators_required,
        goalie_evaluators_required: form.goalie_evaluators_required,
      }),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok || data.error) { setError(data.error || "Failed to save"); return; }
    setShowEdit(false);
    onSaved();
  };

  const doCancel = async () => {
    setBusy(true);
    const res = isSpOwned
      ? await fetch(teUrl, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: entry.id, status: "cancelled" }) })
      : await fetch(`/api/categories/${catId}/schedule?id=${entry.id}`, { method: "DELETE" });
    setBusy(false);
    setShowCancel(false);
    if (res.ok) onSaved();
  };

  const doRemove = async () => {
    setBusy(true);
    const res = isSpOwned
      ? await fetch(`${teUrl}${orgParam ? "&" : "?"}id=${entry.id}`, { method: "DELETE" })
      : await fetch(`/api/categories/${catId}/schedule?id=${entry.id}&hard=1`, { method: "DELETE" });
    setBusy(false);
    setShowRemove(false);
    if (res.ok) onSaved();
  };

  const doReinstate = async () => {
    setBusy(true);
    const res = await fetch(isSpOwned ? teUrl : `/api/categories/${catId}/schedule`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: entry.id, status: "scheduled" }),
    });
    setBusy(false);
    if (res.ok) onSaved();
  };

  const isCancelled = entry.status === "cancelled";

  return (
    <>
      <button onClick={openEdit} disabled={busy} className="text-xs px-3 py-1.5 border border-gray-200 text-gray-600 rounded-lg hover:bg-gray-50 inline-flex items-center gap-1 disabled:opacity-50">
        <Pencil size={11} /> Edit
      </button>
      {isCancelled ? (
        <button onClick={doReinstate} disabled={busy} className="text-xs px-3 py-1.5 border border-green-200 text-green-700 bg-green-50 rounded-lg hover:bg-green-100 inline-flex items-center gap-1 disabled:opacity-50">
          <RotateCcw size={11} /> Reinstate
        </button>
      ) : (
        <button onClick={() => setShowCancel(true)} disabled={busy} className="text-xs px-3 py-1.5 border border-red-200 text-red-500 rounded-lg hover:bg-red-50 inline-flex items-center gap-1 disabled:opacity-50">
          <Ban size={11} /> Cancel session
        </button>
      )}
      <button onClick={() => setShowRemove(true)} disabled={busy} title="Permanently remove this session" className="text-xs px-2.5 py-1.5 border border-gray-200 text-gray-500 rounded-lg hover:bg-gray-50 hover:text-red-600 inline-flex items-center gap-1 disabled:opacity-50">
        <X size={12} /> Remove
      </button>

      <ConfirmDialog
        open={showRemove}
        title="Remove this session?"
        message="This permanently deletes the session and frees any signed-up evaluators. Use this when fixing or redoing a schedule. It can't be undone — to keep it on the books but call it off, use Cancel instead."
        confirmLabel="Remove permanently"
        cancelLabel="Keep session"
        busy={busy}
        onConfirm={doRemove}
        onCancel={() => setShowRemove(false)}
      />

      {showEdit && form && (
        <ScheduleFormModal
          title="Edit session"
          subtitle={`${entry.org_name} · ${entry.category_name} · S${entry.session_number}${entry.group_number ? ` G${entry.group_number}` : ""}`}
          form={form} setForm={setForm} showSessionGroup={false}
          busy={busy} error={error} onSubmit={submitEdit} onClose={() => setShowEdit(false)} submitLabel="Save changes"
        />
      )}

      <ConfirmDialog
        open={showCancel}
        title="Cancel this session?"
        message="The association admin, directors, and any signed-up evaluators will all be notified."
        confirmLabel="Cancel session"
        cancelLabel="Keep session"
        busy={busy}
        onConfirm={doCancel}
        onCancel={() => setShowCancel(false)}
      />
    </>
  );
}

// "Add session" affordance scoped to a single association/category context.
export function AddSessionButton({ category, onSaved }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const blank = { session_number: "", group_number: "1", scheduled_date: "", day_of_week: "", start_time: "", end_time: "", location: "", evaluators_required: "4", goalie_evaluators_required: "0" };
  const [form, setForm] = useState(blank);

  const submit = async () => {
    if (!form.session_number || !form.scheduled_date) { setError("Session # and date are required."); return; }
    setBusy(true); setError(null);
    const res = await fetch(`/api/categories/${category.age_category_id}/schedule`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        add: {
          session_number: form.session_number,
          group_number: form.group_number || 1,
          scheduled_date: form.scheduled_date,
          day_of_week: form.day_of_week || null,
          start_time: form.start_time || null,
          end_time: form.end_time || null,
          location: form.location || null,
          evaluators_required: form.evaluators_required,
          goalie_evaluators_required: form.goalie_evaluators_required,
        },
      }),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok || data.error) { setError(data.error || "Failed to add session"); return; }
    setOpen(false);
    setForm(blank);
    onSaved();
  };

  return (
    <>
      <button onClick={() => { setForm(blank); setError(null); setOpen(true); }} className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-accent text-white rounded-lg text-xs font-semibold hover:opacity-90">
        <Plus size={13} /> Add session
      </button>
      {open && (
        <ScheduleFormModal
          title="Add session"
          subtitle={`${category.org_name} · ${category.category_name}`}
          form={form} setForm={setForm} showSessionGroup={true}
          busy={busy} error={error} onSubmit={submit} onClose={() => setOpen(false)} submitLabel="Add session"
        />
      )}
    </>
  );
}
