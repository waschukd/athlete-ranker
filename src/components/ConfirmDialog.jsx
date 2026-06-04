"use client";

import { AlertTriangle } from "lucide-react";

// Deliberate confirmation modal for destructive actions. Unlike the old
// click-the-same-button-twice pattern, this requires a distinct click on a
// separate "Delete" button in a modal — a stray double-click can't trigger it.
// For especially destructive actions, pass `requireText` (e.g. the item name or
// "DELETE") to force the user to type it before the confirm button enables.
export default function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = "Delete",
  cancelLabel = "Cancel",
  danger = true,
  busy = false,
  requireText = null,
  typed = "",
  onTyped,
  onConfirm,
  onCancel,
}) {
  if (!open) return null;
  const locked = requireText != null && typed.trim() !== String(requireText).trim();

  return (
    <div
      className="fixed inset-0 z-[60] bg-black/40 flex items-center justify-center p-4"
      onClick={(e) => e.target === e.currentTarget && !busy && onCancel?.()}
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6">
        <div className="flex items-start gap-3">
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${danger ? "bg-red-50 text-red-600" : "bg-accent-soft text-accent"}`}>
            <AlertTriangle size={18} />
          </div>
          <div className="min-w-0">
            <h3 className="font-display font-extrabold tracking-tight text-ink text-lg leading-tight">{title}</h3>
            {message && <p className="text-sm text-gray-500 mt-1.5 leading-relaxed">{message}</p>}
          </div>
        </div>

        {requireText != null && (
          <div className="mt-4">
            <label className="text-xs text-gray-500">Type <b className="text-ink">{requireText}</b> to confirm</label>
            <input
              autoFocus
              value={typed}
              onChange={(e) => onTyped?.(e.target.value)}
              className="w-full mt-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-300"
              placeholder={String(requireText)}
            />
          </div>
        )}

        <div className="flex gap-3 mt-6">
          <button
            onClick={onCancel}
            disabled={busy}
            className="flex-1 px-4 py-2.5 border border-gray-200 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50 disabled:opacity-50"
          >
            {cancelLabel}
          </button>
          <button
            onClick={onConfirm}
            disabled={busy || locked}
            className={`flex-1 px-4 py-2.5 rounded-lg text-sm font-semibold text-white disabled:opacity-40 ${danger ? "bg-red-600 hover:bg-red-700" : "bg-accent hover:opacity-90"}`}
          >
            {busy ? "Working…" : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
