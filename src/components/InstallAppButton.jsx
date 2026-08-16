"use client";

import { useState, useEffect } from "react";
import { Download, X, Share, Menu } from "lucide-react";

const isIOS = () => typeof navigator !== "undefined" && /iphone|ipad|ipod/i.test(navigator.userAgent);
const isStandalone = () =>
  typeof window !== "undefined" &&
  (window.matchMedia?.("(display-mode: standalone)").matches || window.navigator.standalone === true);

// Self-contained "Save to Home Screen" button. Drop <InstallAppButton /> into
// any dashboard header. Hides itself only once actually installed (standalone
// mode) — otherwise it ALWAYS renders, because the browser's install-prompt
// capture below is unreliable (see note) and a button that silently
// disappears when that capture fails is worse than one that falls back to
// manual instructions.
export default function InstallAppButton() {
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [installed, setInstalled] = useState(false);
  const [showHelp, setShowHelp] = useState(false);

  useEffect(() => {
    if (isStandalone()) { setInstalled(true); return; }
    // Chrome fires this ONCE, early, and only if a listener is already
    // attached at that exact moment — if this component mounts even slightly
    // late (behind data fetching, below other components), the event is
    // gone for good with no way to recover it on this pageload. So this is
    // a nice-to-have fast path, never the only path (see the fallback below).
    const onPrompt = (e) => { e.preventDefault(); setDeferredPrompt(e); };
    const onInstalled = () => { setInstalled(true); setDeferredPrompt(null); };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  if (installed) return null;

  const handleClick = async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === "accepted") setInstalled(true);
      setDeferredPrompt(null);
      return;
    }
    // No captured browser prompt (iOS never fires one; Android/desktop Chrome
    // may have missed the timing window) — fall back to manual instructions
    // instead of doing nothing.
    setShowHelp(true);
  };

  return (
    <>
      <button
        onClick={handleClick}
        title="Save to home screen"
        className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 py-1"
      >
        <Download size={14} /> <span className="hidden sm:inline">Install App</span>
      </button>

      {showHelp && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={(e) => e.target === e.currentTarget && setShowHelp(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6">
            <div className="flex items-start justify-between mb-3">
              <h3 className="font-display font-extrabold tracking-tight text-ink text-lg leading-tight">Add to Home Screen</h3>
              <button onClick={() => setShowHelp(false)} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
            </div>
            {isIOS() ? (
              <ol className="text-sm text-gray-600 space-y-2 list-decimal list-inside">
                <li>Tap the Share button <Share size={13} className="inline -mt-0.5" /> in Safari's toolbar</li>
                <li>Scroll down and tap <b>Add to Home Screen</b></li>
                <li>Tap <b>Add</b> — the app icon appears on your home screen</li>
              </ol>
            ) : (
              <ol className="text-sm text-gray-600 space-y-2 list-decimal list-inside">
                <li>Tap the menu <Menu size={13} className="inline -mt-0.5" /> in the top-right of your browser</li>
                <li>Tap <b>Install app</b> (or <b>Add to Home screen</b>)</li>
                <li>Confirm — the app icon appears on your home screen</li>
              </ol>
            )}
            <button onClick={() => setShowHelp(false)} className="w-full mt-5 py-2.5 bg-accent text-white rounded-xl font-semibold text-sm hover:opacity-90">
              Got it
            </button>
          </div>
        </div>
      )}
    </>
  );
}
