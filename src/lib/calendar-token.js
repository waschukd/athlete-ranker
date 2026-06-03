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
