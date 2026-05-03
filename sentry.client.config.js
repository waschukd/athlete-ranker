// Browser-side Sentry init. Loaded into every page automatically by
// the Next.js Sentry plugin. Captures unhandled exceptions and
// React error-boundary errors out of the box.

import * as Sentry from "@sentry/nextjs";

if (process.env.NEXT_PUBLIC_SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
    // 10% of transactions sampled — enough to spot perf trends without
    // burning the free-tier quota on a low-traffic pre-launch app.
    tracesSampleRate: 0.1,
    // Set release per-deploy via Vercel's VERCEL_GIT_COMMIT_SHA so
    // errors are attributed to the right commit.
    release: process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA || undefined,
    environment: process.env.NEXT_PUBLIC_VERCEL_ENV || process.env.NODE_ENV,
    // Don't capture errors during dev — only in deployed environments.
    enabled: process.env.NODE_ENV === "production",

    // String/regex matches against the error message. Cheap pre-filter
    // before beforeSend gets called.
    ignoreErrors: [
      // Sentry's own wrapper text when a non-Error value is rejected
      // through a Promise. Real DOM events (e.g. <link onerror>) get
      // caught by the global onunhandledrejection handler and serialized
      // with this exact prefix. They are never actionable.
      /Non-Error promise rejection captured/i,
      /^Event ['`"]Event['`"]/i,
    ],

    // Last-line filter: if the underlying value Sentry caught is a DOM
    // Event (not a real Error), drop it. This catches the pattern where
    // a <link> or <img> in the document head fires an error event that
    // some library wraps in a rejected Promise — happens routinely from
    // ad blockers, browser extensions, transient CDN blips. Not a bug
    // in our app, just noise that drowns the real signal.
    beforeSend(event, hint) {
      const original = hint?.originalException;
      if (typeof Event !== "undefined" && original instanceof Event) {
        return null;
      }
      return event;
    },
  });
}
