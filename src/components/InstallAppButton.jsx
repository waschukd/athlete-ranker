"use client";

import { useState, useEffect } from "react";
import { Download, X, Share } from "lucide-react";

const isIOS = () => typeof navigator !== "undefined" && /iphone|ipad|ipod/i.test(navigator.userAgent);
const isStandalone = () =>
  typeof window !== "undefined" &&
  (window.matchMedia?.("(display-mode: standalone)").matches || window.navigator.standalone === true);

// Self-contained "Save to Home Screen" button. Drop <InstallAppButton /> into
// any dashboard header. Hides itself once already installed, or when there's
// no usable install path at all (desktop browsers without beforeinstallprompt
// support) — never shows a button that does nothing.
export default function InstallAppButton() {
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [installed, setInstalled] = useState(false);
  const [showIOSHelp, setShowIOSHelp] = useState(false);

  useEffect(() => {
    if (isStandalone()) { setInstalled(true); return; }
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
  // Chrome/Edge/Android offer a real install prompt; iOS Safari can only be
  // walked through the manual Share -> Add to Home Screen steps. Anywhere else
  // (desktop Safari, Firefox) there's no install path yet — stay hidden.
  const canPrompt = !!deferredPrompt;
  const canShowIOS = isIOS();
  if (!canPrompt && !canShowIOS) return null;

  const handleClick = async () => {
    if (canPrompt) {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === "accepted") setInstalled(true);
      setDeferredPrompt(null);
      return;
    }
    setShowIOSHelp(true);
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

      {showIOSHelp && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={(e) => e.target === e.currentTarget && setShowIOSHelp(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6">
            <div className="flex items-start justify-between mb-3">
              <h3 className="font-display font-extrabold tracking-tight text-ink text-lg leading-tight">Add to Home Screen</h3>
              <button onClick={() => setShowIOSHelp(false)} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
            </div>
            <ol className="text-sm text-gray-600 space-y-2 list-decimal list-inside">
              <li>Tap the Share button <Share size={13} className="inline -mt-0.5" /> in Safari's toolbar</li>
              <li>Scroll down and tap <b>Add to Home Screen</b></li>
              <li>Tap <b>Add</b> — the app icon appears on your home screen</li>
            </ol>
            <button onClick={() => setShowIOSHelp(false)} className="w-full mt-5 py-2.5 bg-accent text-white rounded-xl font-semibold text-sm hover:opacity-90">
              Got it
            </button>
          </div>
        </div>
      )}
    </>
  );
}
