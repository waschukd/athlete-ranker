// HMAC-signed tokens for the personal calendar feed at
// /api/evaluator/calendar?token=...
//
// Format: `${userId}.${signature}` where signature is a 32-char hex
// truncation of HMAC-SHA256(SECRET + "/calendar-feed", userId).
//
// Stable per user, no DB column needed. Rotating AUTH_SECRET invalidates
// every existing calendar subscription (intended kill-switch).

import crypto from "node:crypto";

const SECRET_BASE = process.env.AUTH_SECRET || "dev-secret-do-not-use-in-prod";
const KEY = SECRET_BASE + "/calendar-feed";

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
