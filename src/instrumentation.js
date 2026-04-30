// Next.js 14 server-startup hook. The framework calls register() once
// per server instance — we delegate to whichever Sentry config matches
// the runtime so init runs before any route handler.
//
// Browser-side init is wired separately via sentry.client.config.js
// (loaded automatically by the Sentry Next.js plugin).

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("../sentry.server.config.js");
  }
  if (process.env.NEXT_RUNTIME === "edge") {
    await import("../sentry.edge.config.js");
  }
}
