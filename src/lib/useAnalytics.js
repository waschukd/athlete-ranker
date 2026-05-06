// Client-side analytics helpers.
//
// Two things in here:
//   1. logClientEvent(event, opts)  — fire-and-forget POST to the event
//      endpoint. Use sendBeacon when available so the event survives a
//      page-unload; fall back to fetch with keepalive.
//   2. useTrackPageView(event, metadata?) — React hook that records a
//      duration-bracketed page view: nothing fires on mount; on unmount
//      we send the elapsed milliseconds so dashboards can answer "who
//      spends time looking at what?"

"use client";

import { useEffect, useRef } from "react";

export function logClientEvent(event, { orgId = null, durationMs = null, metadata = null } = {}) {
  if (!event) return;
  const body = JSON.stringify({ event, orgId, durationMs, metadata });
  try {
    if (typeof navigator !== "undefined" && navigator.sendBeacon) {
      const blob = new Blob([body], { type: "application/json" });
      navigator.sendBeacon("/api/analytics/event", blob);
      return;
    }
  } catch { /* fall through to fetch */ }
  // keepalive lets the request finish even if the page is unloading
  fetch("/api/analytics/event", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
    keepalive: true,
  }).catch(() => { /* swallow — analytics must never break product */ });
}

/**
 * Track time-on-page. Pass a stable event name and optional metadata. The
 * actual analytics write happens on unmount (or page hide on mobile, where
 * unmount may never fire). Safe to use anywhere — no-op during SSR.
 */
export function useTrackPageView(event, metadata) {
  const mountedAtRef = useRef(null);
  // Stash a JSON-stable copy so the effect doesn't re-fire on object identity
  const metaRef = useRef(metadata);
  metaRef.current = metadata;

  useEffect(() => {
    if (typeof window === "undefined" || !event) return;
    mountedAtRef.current = Date.now();

    const flush = () => {
      if (mountedAtRef.current == null) return;
      const durationMs = Date.now() - mountedAtRef.current;
      mountedAtRef.current = null;
      logClientEvent(event, { durationMs, metadata: metaRef.current ?? null });
    };

    // pagehide is more reliable than unmount on mobile webviews and Safari
    const onPageHide = () => flush();
    window.addEventListener("pagehide", onPageHide);

    return () => {
      window.removeEventListener("pagehide", onPageHide);
      flush();
    };
    // Intentionally only re-bind on event-name change — not on metadata
    // identity, which would re-fire constantly.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [event]);
}
