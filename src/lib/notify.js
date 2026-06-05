import sql from "@/lib/db";

// In-app notification center helpers. All writes are best-effort: if the
// `notifications` table hasn't been migrated yet, these no-op instead of throwing
// so they never break the primary action that triggered them.
export async function createNotification(userId, { type, title, body, link } = {}) {
  if (!userId) return;
  try {
    await sql`
      INSERT INTO notifications (user_id, type, title, body, link)
      VALUES (${userId}, ${type || null}, ${title || null}, ${body || null}, ${link || null})
    `;
  } catch (err) {
    console.error("createNotification skipped:", err?.message);
  }
}

// Resolve the app `users.id` for the current session (by email).
export async function appUserId(session) {
  if (!session?.email) return null;
  try {
    const rows = await sql`SELECT id FROM users WHERE email = ${session.email}`;
    return rows[0]?.id || null;
  } catch {
    return null;
  }
}
