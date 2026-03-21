import { NextResponse } from "next/server";
import sql from "@/lib/db";
import { getSession } from "@/lib/auth";

export async function GET() {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const user = await sql`SELECT id, name, role FROM users WHERE email = ${session.email}`;
    if (!user.length) return NextResponse.json({ status: "ok", flags: [] });
    const userId = user[0].id;

    // Check strikes
    const strikes = await sql`
      SELECT COUNT(*) as count FROM evaluator_flags
      WHERE evaluator_id = ${userId} AND flag_type = 'late_cancel' AND reviewed = false
    `;
    const strikeCount = parseInt(strikes[0].count);

    // Check suspension
    const suspended = strikeCount >= 2;

    // Get unreviewed flags
    const flags = await sql`
      SELECT flag_type, severity, details, created_at
      FROM evaluator_flags
      WHERE evaluator_id = ${userId} AND reviewed = false
      ORDER BY created_at DESC
      LIMIT 5
    `;

    return NextResponse.json({
      status: suspended ? "suspended" : strikeCount > 0 ? "warned" : "ok",
      strike_count: strikeCount,
      suspended,
      flags,
      userId,
    });
  } catch (error) {
    return NextResponse.json({ status: "ok", flags: [] });
  }
}
