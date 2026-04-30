// Server-side Sentry init. Loaded by src/instrumentation.js when a
// Node.js runtime serverless function boots on Vercel. Captures
// uncaught exceptions in API routes, server actions, and middleware
// (which uses the edge runtime — see sentry.edge.config.js).

import * as Sentry from "@sentry/nextjs";

if (process.env.SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    tracesSampleRate: 0.1,
    release: process.env.VERCEL_GIT_COMMIT_SHA || undefined,
    environment: process.env.VERCEL_ENV || process.env.NODE_ENV,
    enabled: process.env.NODE_ENV === "production",
  });
}
