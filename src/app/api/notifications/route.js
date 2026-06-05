import { getSession } from "@/lib/auth";
import { NextResponse } from "next/server";
import sql from "@/lib/db";
import { appUserId } from "@/lib/notify";

// List the current user's recent notifications + unread count.
export async function GET() {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const userId = await appUserId(session);
    if (!userId) return NextResponse.json({ notifications: [], unread: 0 });

    try {
      const notifications = await sql`
        SELECT id, type, title, body, link, read_at, created_at
        FROM notifications WHERE user_id = ${userId}
        ORDER BY created_at DESC LIMIT 50
      `;
      const unread = notifications.filter(n => !n.read_at).length;
      return NextResponse.json({ notifications, unread });
    } catch {
      // Table not migrated yet — degrade quietly.
      return NextResponse.json({ notifications: [], unread: 0 });
    }
  } catch (error) {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// Mark one ({ id }) or all ({ all: true }) of the user's notifications read.
export async function POST(request) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const userId = await appUserId(session);
    if (!userId) return NextResponse.json({ success: true });

    const { id, all } = await request.json().catch(() => ({}));
    try {
      if (all) {
        await sql`UPDATE notifications SET read_at = NOW() WHERE user_id = ${userId} AND read_at IS NULL`;
      } else if (id) {
        await sql`UPDATE notifications SET read_at = NOW() WHERE id = ${id} AND user_id = ${userId}`;
      }
    } catch { /* not migrated yet */ }
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
