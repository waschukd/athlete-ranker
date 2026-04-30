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
  });
}
