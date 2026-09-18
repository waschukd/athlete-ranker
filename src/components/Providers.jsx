"use client";

import { useState, useEffect } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

// Retry a chunk-load style failure with one hard reload -- deploys rotate
// Next.js's content-hashed chunk filenames, but a couple of internal files
// (the build manifest in particular) keep a stable name across builds. A
// browser that's had the page open across a deploy, or whose service worker
// served a cached copy of one of those stable-named files, ends up with a
// chunk map from one build pointing at page bundles from another -- which
// surfaces as exactly this kind of "a[e] is not a function" TypeError, not a
// recognizable ChunkLoadError. Real incident: Sentry issue 1ada4e27, /landing,
// stack running through the webpack runtime into another route's chunk.
// sessionStorage guards against a reload loop if the mismatch somehow
// persists (a real code bug, not a stale cache) -- one retry, then give up
// and let the error surface normally.
function installChunkMismatchRecovery() {
  const RELOAD_FLAG = "ss-chunk-reload";
  const looksLikeChunkMismatch = (message, stack) => {
    const text = `${message || ""} ${stack || ""}`;
    return /ChunkLoadError|Loading chunk|Loading CSS chunk/i.test(text)
      || (/is not a function/i.test(text) && /_next\/static\/chunks\//.test(stack || ""));
  };
  const recover = (message, stack) => {
    if (!looksLikeChunkMismatch(message, stack)) return;
    try {
      if (sessionStorage.getItem(RELOAD_FLAG)) return;
      sessionStorage.setItem(RELOAD_FLAG, "1");
    } catch { return; }
    window.location.reload();
  };
  window.addEventListener("unhandledrejection", (e) => {
    recover(e.reason?.message, e.reason?.stack);
  });
  window.addEventListener("error", (e) => {
    recover(e.message, e.error?.stack);
  });
}

export default function Providers({ children }) {
  useEffect(() => {
    installChunkMismatchRecovery();
    // Scoped to /evaluator/ -- this is the ONLY feature that needs offline
    // resilience (an evaluator scoring mid-session on rink wifi). Registered
    // without a scope, the service worker's network-first-cache-fallback
    // behavior applied to every navigation and every _next/static/ asset
    // site-wide, including /landing and /account/signin, which never needed
    // it and just added deploy-skew risk for every visitor. A scope here
    // is a hard browser-level limit -- the service worker cannot intercept
    // requests outside it, no per-request checks needed inside sw.js.
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js", { scope: "/evaluator/" }).catch(() => {});
    }
  }, []);

  const [queryClient] = useState(() => new QueryClient({
    defaultOptions: { queries: { staleTime: 30000, retry: 1 } },
  }));

  return (
    <QueryClientProvider client={queryClient}>
      {children}
    </QueryClientProvider>
  );
}
