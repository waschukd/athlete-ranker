"use client";

// Small pop-up notification when a new team ping arrives from someone else
// while the panel's closed -- the unread badge alone only shows once you
// open Settings, which defeats "quickly tell the group something" if
// nobody's looking.
export default function PingToast({ toast, onClick }) {
  return (
    <div className="fixed top-2 left-2 right-2 z-[70] flex justify-center pointer-events-none">
      <button
        onClick={onClick}
        className="pointer-events-auto max-w-sm w-full bg-ink text-white rounded-xl shadow-lg px-4 py-3 flex items-start gap-2.5 text-left hover:opacity-95"
      >
        <span className="text-lg leading-none flex-shrink-0">💬</span>
        <span className="min-w-0">
          <span className="block text-xs font-bold uppercase tracking-wide text-white/60">{toast.name}</span>
          <span className="block text-sm truncate">{toast.message}</span>
        </span>
      </button>
    </div>
  );
}
