// Lightweight server-side event logger.
//
// Fire-and-forget — the caller MUST NOT await this. If the DB write fails
// we log a warning and move on; analytics outages must never bubble up
// into a user-facing failure.
//
// PRIVACY POLICY (read before adding new events):
//   - Only ids and enums in metadata. Never first_name, last_name, email,
//     notes, or any other free-text the user typed. Treat metadata like a
//     leaderboard, not a chat log.
//   - The user_id and org_id columns are the *primary* dimensions; metadata
//     is for context that helps interpret an event (catId, scheduleId,
//     viewMode, etc).
//   - If a query would feel surveillance-y to the user it tracks, don't
//     write the query.

import sql from "@/lib/db";

/**
 * Record a product-analytics event.
 *
 * @param {object} args
 * @param {number|null} args.userId      app users.id; null for anonymous
 * @param {string}      args.role        session role; "anonymous" if unknown
 * @param {string}      args.event       dotted event name e.g. "score.submitted"
 * @param {number|null} [args.orgId]     organization the event happened in
 * @param {number|null} [args.durationMs] for events with a natural duration
 * @param {object|null} [args.metadata]  ids + enums only — no PII
 */
export function logEvent({ userId = null, role = "anonymous", event, orgId = null, durationMs = null, metadata = null }) {
  if (!event) return;
  // Don't await — return immediately. The DB write rides on its own
  // microtask; failures are swallowed so the caller never sees them.
  sql`
    INSERT INTO analytics_events (user_id, org_id, role, event, duration_ms, metadata)
    VALUES (${userId}, ${orgId}, ${role}, ${event}, ${durationMs}, ${metadata ? JSON.stringify(metadata) : null})
  `.catch(err => {
    // Keep this quiet — Sentry already covers real errors. We just want a
    // breadcrumb in the server logs if analytics itself starts misbehaving.
    if (process.env.NODE_ENV !== "test") {
      console.warn("[analytics] write failed", event, err?.message);
    }
  });
}
