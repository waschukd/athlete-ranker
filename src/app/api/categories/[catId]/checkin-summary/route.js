import { getSession } from "@/lib/auth";
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

    const sessions = await sql`
      SELECT es.id AS schedule_id, es.session_number, es.group_number,
        COUNT(pc.id) FILTER (WHERE pc.checked_in) AS checked_in,
        COUNT(pc.id) AS total
      FROM evaluation_schedule es
      LEFT JOIN player_checkins pc ON pc.schedule_id = es.id
      WHERE es.age_category_id = ${catId}
      GROUP BY es.id, es.session_number, es.group_number
      ORDER BY es.session_number, es.group_number
    `;

    return NextResponse.json({ sessions });
  } catch (error) {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
