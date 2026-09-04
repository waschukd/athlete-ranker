"use client";

import { Settings as SettingsIcon, X, ChevronRight, BookOpen, LifeBuoy, Phone, MessageSquare } from "lucide-react";
import ThemeToggle from "@/components/ThemeToggle";
import { SUPPORT_NAME, SUPPORT_PHONE_DISPLAY, supportSmsHref, supportTelHref } from "@/lib/support";

// Everything that isn't needed at a glance while scoring lives here: scoring
// guide, calibration numbers, layout, consensus, backup/recovery, appearance.
// Keeps the header down to just player counts, the team filter, and the save
// indicator. Purely a menu/dispatcher -- every action here just opens another
// top-level modal or flips a setting owned by the parent.
export default function SettingsModal({
  onClose,
  jerseySearch, setJerseySearch, isAnon,
  readOnly,
  onOpenAddPlayer, onOpenRoster,
  onOpenPings, unreadPings,
  hasGuideContent, onOpenGuide,
  onOpenRanges,
  hasGuidance, onOpenGuidance,
  viewMode, onSetViewMode,
  onDownloadBackup, onDownloadBackupJson, onRestoreFromFile,
  theme, onToggleTheme,
  evaluatorName, orgName, categoryName, sessionNumber,
}) {
  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-end md:items-center justify-center" onClick={onClose}>
      <div className="bg-white rounded-t-2xl md:rounded-2xl w-full md:max-w-sm max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="sticky top-0 bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between">
          <h3 className="font-display font-bold text-ink flex items-center gap-1.5"><SettingsIcon size={17} className="text-accent" /> Settings</h3>
          <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>
        <div className="p-4 space-y-5">
          <div>
            <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-2">Find a player</h4>
            <div className="relative">
              <input
                value={jerseySearch}
                onChange={e => { setJerseySearch(e.target.value); onClose(); }}
                inputMode="numeric"
                placeholder={isAnon ? "Find #" : "Find # or name"}
                autoFocus
                className="w-full pl-3 pr-8 py-2 text-sm rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-accent/30"
              />
              {jerseySearch && (
                <button onClick={() => setJerseySearch("")} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-700 text-base leading-none">×</button>
              )}
            </div>
          </div>

          {!readOnly && (
            <button onClick={onOpenAddPlayer} className="w-full flex items-center justify-between px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm font-semibold text-ink hover:bg-gray-100">
              <span>+ Add player (on ice, not checked in)</span>
              <ChevronRight size={15} className="text-gray-400" />
            </button>
          )}

          <button onClick={onOpenRoster} className="w-full flex items-center justify-between px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm font-semibold text-ink hover:bg-gray-100">
            <span>Who's evaluating with me</span>
            <ChevronRight size={15} className="text-gray-400" />
          </button>

          {!readOnly && (
            <button onClick={onOpenPings} className="w-full flex items-center justify-between px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm font-semibold text-ink hover:bg-gray-100">
              <span className="flex items-center gap-2">
                Team ping
                {unreadPings > 0 && <span className="w-5 h-5 flex items-center justify-center rounded-full bg-accent text-white text-[10px] font-bold">{unreadPings}</span>}
              </span>
              <ChevronRight size={15} className="text-gray-400" />
            </button>
          )}

          {hasGuideContent && (
            <button onClick={onOpenGuide} className="w-full flex items-center justify-between px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm font-semibold text-ink hover:bg-gray-100">
              <span className="flex items-center gap-2"><BookOpen size={15} className="text-accent" /> Scoring guide</span>
              <ChevronRight size={15} className="text-gray-400" />
            </button>
          )}

          <button onClick={onOpenRanges} className="w-full flex items-center justify-between px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm font-semibold text-ink hover:bg-gray-100">
            <span>Ranges</span>
            <ChevronRight size={15} className="text-gray-400" />
          </button>

          {hasGuidance && (
            <button onClick={onOpenGuidance} className="w-full flex items-center justify-between px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm font-semibold text-ink hover:bg-gray-100">
              <span>Scoring guidance for this group</span>
              <ChevronRight size={15} className="text-gray-400" />
            </button>
          )}

          <div>
            <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-2">Layout</h4>
            <div className="flex bg-gray-100 rounded-lg border border-gray-300 overflow-hidden">
              {[
                { id: "card", label: "Buttons" },
                { id: "numpad", label: "Numpad" },
                { id: "grid", label: "Grid" },
              ].map(m => (
                <button key={m.id} onClick={() => onSetViewMode(m.id)}
                  className={`flex-1 px-2.5 py-2 text-xs font-semibold transition-colors ${viewMode === m.id ? "bg-accent text-white" : "text-gray-500"}`}>
                  {m.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-2">Backup</h4>
            <div className="space-y-1">
              <button onClick={onDownloadBackup} className="block w-full text-left px-3 py-2 text-sm text-ink hover:bg-gray-50 rounded-lg border border-gray-200">Download CSV (readable)</button>
              <button onClick={onDownloadBackupJson} className="block w-full text-left px-3 py-2 text-sm text-ink hover:bg-gray-50 rounded-lg border border-gray-200">Download backup file</button>
              <label className="block w-full text-left px-3 py-2 text-sm text-ink hover:bg-gray-50 rounded-lg border border-gray-200 cursor-pointer">
                Restore from file…
                <input type="file" accept=".json,application/json" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; onClose(); onRestoreFromFile(f); }} />
              </label>
              <p className="px-1 pt-1 text-xs text-gray-400 leading-snug">Emergency use — your scores already save to this device and sync automatically.</p>
            </div>
          </div>

          <div className="flex items-center justify-between">
            <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wide">Appearance</h4>
            <ThemeToggle theme={theme} onToggle={onToggleTheme} />
          </div>

          {/* Last, deliberately: everything above is used far more often. But when
              this IS needed it is urgent -- someone locked out four minutes before a
              session does not want a form. The call is a real tel: link and the text
              a real SMS, both prefilled with who and which session, so the first two
              replies are not always the same two questions. */}
          <div>
            <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-2 flex items-center gap-1.5">
              <LifeBuoy size={13} className="text-accent" /> Need help?
            </h4>
            <div className="space-y-1.5">
              <a href={supportSmsHref({ evaluatorName, orgName, categoryName, sessionNumber })}
                className="flex items-center justify-between px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm font-semibold text-ink hover:bg-gray-100">
                <span className="flex items-center gap-2"><MessageSquare size={15} className="text-gray-400" /> Message {SUPPORT_NAME} — not urgent</span>
                <ChevronRight size={15} className="text-gray-400" />
              </a>
              <a href={supportTelHref()}
                className="flex items-center justify-between px-3 py-2.5 bg-red-50 border border-red-200 rounded-xl text-sm font-semibold text-red-700 hover:bg-red-100">
                <span className="flex items-center gap-2"><Phone size={15} /> Emergency — call {SUPPORT_NAME}</span>
                <span className="text-xs font-bold tabular-nums">{SUPPORT_PHONE_DISPLAY}</span>
              </a>
              <p className="px-1 pt-1 text-xs text-gray-400 leading-snug">Locked out, wrong roster, or the session will not open — call. Anything that can wait, text.</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
