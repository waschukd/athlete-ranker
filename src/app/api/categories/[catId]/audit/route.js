import { getSession, getAppUserId } from "@/lib/auth";
import { authorizeCategoryAccess } from "@/lib/authorize";
import { NextResponse } from "next/server";
import sql from "@/lib/db";

export async function GET(request, { params }) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { catId } = params;

    const auth = await authorizeCategoryAccess(session, catId);
    if (!auth.authorized) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const { searchParams } = new URL(request.url);
    const limit = Math.min(parseInt(searchParams.get("limit") || "50"), 200);
    const offset = parseInt(searchParams.get("offset") || "0");

    const entries = await sql`
      SELECT al.*,
        u.name as editor_name, u.email as editor_email,
        a.first_name as athlete_first_name, a.last_name as athlete_last_name, a.jersey_number
      FROM audit_log al
      LEFT JOIN users u ON u.id = al.user_id
      LEFT JOIN athletes a ON a.id = al.entity_id AND al.entity_type = 'athlete'
      WHERE al.age_category_id = ${catId}
      ORDER BY al.created_at DESC
      LIMIT ${limit} OFFSET ${offset}
    `;

    const countResult = await sql`
      SELECT COUNT(*) as total FROM audit_log WHERE age_category_id = ${catId}
    `;

    return NextResponse.json({
      entries,
      total: parseInt(countResult[0].total),
      limit,
      offset,
    });
  } catch (error) {
    console.error("Audit log error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(request, { params }) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { catId } = params;
    const userId = await getAppUserId(session);
    const { action, athlete_id } = await request.json();

    if (action === "compare_used") {
      await sql`
        INSERT INTO audit_log (user_id, action, entity_type, entity_id, age_category_id)
        VALUES (${userId}, 'compare_used', 'athlete', ${athlete_id || null}, ${catId})
      `;
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (error) {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
