// Edge-runtime Sentry init. Used by middleware.js and any route
// handlers running on the edge. Smaller surface than the Node SDK
// because the V8 isolate doesn't have full Node APIs.

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
