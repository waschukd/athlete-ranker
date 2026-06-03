import sql from "@/lib/db";

// Durable, per-(endpoint,identifier) sliding-window limiter using the same
// `auth_rate_limit` table the auth routes (login / forgot / reset) use, so no
// migration is needed. Columns: endpoint TEXT, ip TEXT, email TEXT (nullable),
// attempted_at TIMESTAMP. The `identifier` is stored in the `ip` column —
// it is the caller IP for IP-based limits, or an app user id for per-user caps.
//
// Returns { allowed, count }. Fails OPEN on DB error (same as the login
// limiter — better to allow than to lock everyone out if the DB hiccups).
export async function checkAndRecord({ endpoint, identifier, max, windowMins }) {
  try {
    const rows = await sql`
      SELECT COUNT(*)::int AS c FROM auth_rate_limit
      WHERE endpoint = ${endpoint} AND ip = ${identifier}
        AND attempted_at > NOW() - (${windowMins} * INTERVAL '1 minute')
    `;
    const count = rows[0]?.c || 0;
    if (count >= max) return { allowed: false, count };
    await sql`INSERT INTO auth_rate_limit (endpoint, ip, attempted_at) VALUES (${endpoint}, ${identifier}, NOW())`;
    return { allowed: true, count: count + 1 };
  } catch (err) {
    console.error("[rateLimit] query failed, allowing:", err?.message || err);
    return { allowed: true, count: 0 };
  }
}

// Extract the caller IP the same way the auth routes do.
export function clientIp(request) {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "unknown"
  );
}
