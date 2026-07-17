// HMAC-signed tokens for the personal calendar feed at
// /api/evaluator/calendar?token=...
//
// Format: `${userId}.${signature}` where signature is a 32-char hex
// truncation of HMAC-SHA256(SECRET + "/calendar-feed", userId).
//
// Stable per user, no DB column needed. Rotating AUTH_SECRET invalidates
// every existing calendar subscription (intended kill-switch).

import crypto from "node:crypto";

if (!process.env.AUTH_SECRET) throw new Error("AUTH_SECRET environment variable is required");
const SECRET_BASE = process.env.AUTH_SECRET;
const KEY = SECRET_BASE + "/calendar-feed";

// Calendar importers (Google/Apple) follow Vercel's apex→www 307 redirect and then
// fail. The mobile app + apex visitors are on the bare apex host, so the request
// origin is NOT safe to hand out. Rewrite the exact apex origin to its www form;
// leave localhost / preview / already-www origins untouched.
export function canonicalCalendarBase(origin) {
  if (origin === "https://sidelinestar.com") return "https://www.sidelinestar.com";
  return origin;
}

export function signCalendarToken(userId) {
  const sig = crypto
    .createHmac("sha256", KEY)
    .update(String(userId))
    .digest("hex")
    .slice(0, 32);
  return `${userId}.${sig}`;
}

export function verifyCalendarToken(token) {
  if (!token || typeof token !== "string") return null;
  const [userIdStr, sig] = token.split(".");
  const userId = parseInt(userIdStr, 10);
  if (!userId || !sig) return null;
  const expected = signCalendarToken(userId).split(".")[1];
  if (sig !== expected) return null;
  return userId;
}

// Service-provider master-schedule feed. Signs the SP ORG id, with a DISTINCT key
// namespace so an evaluator's personal token can never be replayed against the SP
// feed (which exposes every client session), and vice-versa.
const SP_KEY = SECRET_BASE + "/sp-calendar-feed";

export function signSpCalendarToken(orgId) {
  const sig = crypto.createHmac("sha256", SP_KEY).update(String(orgId)).digest("hex").slice(0, 32);
  return `${orgId}.${sig}`;
}

export function verifySpCalendarToken(token) {
  if (!token || typeof token !== "string") return null;
  const [orgIdStr, sig] = token.split(".");
  const orgId = parseInt(orgIdStr, 10);
  if (!orgId || !sig) return null;
  const expected = signSpCalendarToken(orgId).split(".")[1];
  if (sig !== expected) return null;
  return orgId;
}

// Single-session .ics download for a PARENT's "Add to calendar · Apple/Outlook"
// link. Distinct namespace so it can never be replayed against a staff feed.
//
// Signs the evaluation_schedule row id, so the event is built server-side and no
// details ride in the URL. What it returns is exactly what the parent's email
// already told them — date, time, rink — and never the group or any athlete.
const SESSION_ICS_KEY = SECRET_BASE + "/session-ics";

export function signSessionIcsToken(scheduleId) {
  const sig = crypto.createHmac("sha256", SESSION_ICS_KEY).update(String(scheduleId)).digest("hex").slice(0, 32);
  return `${scheduleId}.${sig}`;
}

export function verifySessionIcsToken(token) {
  if (!token || typeof token !== "string") return null;
  const [idStr, sig] = token.split(".");
  const id = parseInt(idStr, 10);
  if (!id || !sig) return null;
  const expected = signSessionIcsToken(id).split(".")[1];
  // Constant-time compare: this one is reachable unauthenticated, so don't leak
  // signature bytes through early-exit timing.
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  return id;
}

// Per-category schedule feed (association / director view). Distinct namespace.
const CAT_KEY = SECRET_BASE + "/schedule-cal-feed";

export function signScheduleToken(catId) {
  const sig = crypto.createHmac("sha256", CAT_KEY).update(String(catId)).digest("hex").slice(0, 32);
  return `${catId}.${sig}`;
}

export function verifyScheduleToken(token) {
  if (!token || typeof token !== "string") return null;
  const [catIdStr, sig] = token.split(".");
  const catId = parseInt(catIdStr, 10);
  if (!catId || !sig) return null;
  const expected = signScheduleToken(catId).split(".")[1];
  if (sig !== expected) return null;
  return catId;
}
